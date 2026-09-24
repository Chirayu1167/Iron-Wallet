"""
ai_investigator/investigator.py — AI Fraud Investigator service (Phase 9)

Strict grounding, failure handling, no risk score invention, evidence citations.

Uses Gemini via server-side proxy pattern (same as /assistant). Falls back to deterministic templating if no key/timeout/malformed.
"""
from __future__ import annotations
import os
import json
import time
import logging
from typing import Dict, Any, List, Optional

from .prompts import SYSTEM_PROMPT, build_user_prompt
from .models import InvestigatorOutput

log = logging.getLogger("ironwallet.investigator")

INVESTIGATOR_VERSION = "ai-investigator-v1"

# Phase 19 — grounded intel helpers (deterministic, no new detection).
# All text derives strictly from supplied RiskEngine evidence.
try:
    from risk_engine.attack import ATTACK_LABELS as _ATTACK_LABELS
except Exception:
    _ATTACK_LABELS = {}
try:
    from risk_engine.account_takeover import DIMENSION_LABELS as _DIMENSION_LABELS
except Exception:
    _DIMENSION_LABELS = {}

_ATTACK_ACTION_GUIDANCE: Dict[str, str] = {
    "OTP_HARVESTING": "Never share OTP, PIN, CVV or passwords with anyone — no bank or official will ask for them.",
    "REMOTE_ACCESS": "Do not install remote-access or screen-sharing apps at anyone's request.",
    "FAKE_KYC_SUSPENSION": "Do not act on account-block or KYC threats in calls or messages — verify through your bank's official channel.",
    "FAKE_REFUND_REWARD": "Treat unexpected prize, refund or cashback offers as suspicious — verify with the official source before paying.",
    "INVESTMENT_LOAN_SCAM": "Treat guaranteed-return investment or instant-loan offers as suspicious — verify before sending money.",
    "IMPERSONATION": "Verify the sender's identity through an official channel before paying.",
}

_NO_BLOCK_SUFFIX = "The system will not block the payment."

def _build_intel_fields(
    attack: Dict[str, Any] | None,
    account_takeover: Dict[str, Any] | None,
    scam_network: Dict[str, Any] | None,
    signals_by_id: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """Deterministic intel summary from SUPPLIED evidence only. Never invents."""
    attack = attack or {}
    account_takeover = account_takeover or {}
    scam_network = scam_network or {}

    attack_type = str(attack.get("attack_type", "NONE") or "NONE").upper()
    if attack_type != "NONE":
        label = _ATTACK_LABELS.get(attack_type, attack_type.replace("_", " ").title())
        attack_scenario = f"Likely {label} scenario"
    else:
        attack_scenario = "No specific scam pattern detected"

    affected_factors: List[str] = []
    ato_dims = account_takeover.get("dimensions", {}) or {}
    if account_takeover.get("account_threat_detected"):
        for dim in ("device", "location", "time", "amount", "recipient", "velocity", "behavior"):
            if dim in ato_dims:
                affected_factors.append(_DIMENSION_LABELS.get(dim, dim))
    net_ev = scam_network.get("evidence", {}) or {}
    if scam_network.get("network_threat_detected"):
        try:
            rc = int(net_ev.get("report_count", 0) or 0)
        except Exception:
            rc = 0
        try:
            rpc = int(net_ev.get("reporter_count", 0) or 0)
        except Exception:
            rpc = 0
        handle = str(net_ev.get("handle", "") or "")
        if rpc >= 2:
            affected_factors.append(f"recipient reported by {rpc} users")
        elif rc >= 2:
            affected_factors.append(f"recipient with {rc} fraud reports")
        if handle:
            affected_factors.append(f"shared handle '@{handle}'")
        for p in (net_ev.get("pieces", []) or []):
            if p == "recipient_repeat" and "repeat recipient" not in affected_factors:
                affected_factors.append("repeat recipient")
            elif p == "velocity_cluster" and "burst activity" not in affected_factors:
                affected_factors.append("burst activity")
    # Deduplicate preserving order.
    seen_f = set()
    dedup_factors: List[str] = []
    for f in affected_factors:
        if f not in seen_f:
            seen_f.add(f)
            dedup_factors.append(f)
    affected_factors = dedup_factors

    recommended_actions: List[str] = []
    if attack_type in _ATTACK_ACTION_GUIDANCE:
        recommended_actions.append(_ATTACK_ACTION_GUIDANCE[attack_type])
    if account_takeover.get("account_threat_detected"):
        recommended_actions.append("Check that the device and location are yours; if anything looks unfamiliar, secure your account before proceeding.")
    if scam_network.get("network_threat_detected"):
        recommended_actions.append("This recipient or pattern was flagged by other users — double-check the recipient independently before paying.")
    # Velocity corroboration (existing signals only).
    vel_ids = {"rapid_velocity_5m", "high_velocity_5m", "high_velocity_1h",
               "recipient_switching", "sequential_amounts", "velocity_1h", "velocity_24h",
               "high_velocity_5m_ctx", "high_velocity_1h_ctx", "amount_escalation_burst"}
    if any(sid.lower() in vel_ids for sid in signals_by_id):
        recommended_actions.append("Pause on rapid repeat payments — confirm each one is intended.")
    recommended_actions = recommended_actions[:5]
    return {
        "attack_scenario": attack_scenario,
        "affected_factors": affected_factors,
        "recommended_actions": recommended_actions,
    }

def _max_severity(sig_ids: List[str], signals_by_id: Dict[str, Dict[str, Any]]) -> str:
    order = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
    best = "MEDIUM"
    for sid in sig_ids or []:
        s = signals_by_id.get(sid, signals_by_id.get(str(sid).lower(), {}))
        sev = str(s.get("severity", "MEDIUM")).upper() if isinstance(s, dict) else "MEDIUM"
        if order.get(sev, 1) > order.get(best, 1):
            best = sev
    return best

class InvestigatorError(Exception):
    pass

# ── Deterministic fallback (no LLM) — converts backend evidence to structured investigation ──
def _fallback_investigation(
    transaction: Dict[str, Any],
    risk: Dict[str, Any],
    behavior: Dict[str, Any],
    fraud_intelligence: Dict[str, Any],
    recipient_intelligence: Dict[str, Any],
    context: Dict[str, Any],
    explanation: Dict[str, Any],
    attack: Dict[str, Any] | None = None,
    account_takeover: Dict[str, Any] | None = None,
    scam_network: Dict[str, Any] | None = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    Fallback when LLM unavailable/malformed. Uses backend evidence only.
    Phase 19: also explains attack/takeover/network intel in plain language,
    citing only supplied evidence. Accepts `network` as alias for scam_network.
    """
    if scam_network is None and "network" in kwargs:
        scam_network = kwargs.get("network")
    attack = attack or {}
    account_takeover = account_takeover or {}
    scam_network = scam_network or {}
    tier = str(risk.get("tier", risk.get("iron_tier", "UNKNOWN"))).upper()
    score = risk.get("score", risk.get("final", {}).get("score", 0) if isinstance(risk.get("final"), dict) else 0)
    confidence = float(risk.get("confidence", explanation.get("confidence", 0.5) if isinstance(explanation, dict) else 0.5))
    # Collect signals from all components
    all_signals: List[Dict[str, Any]] = []
    for comp in [behavior, fraud_intelligence, recipient_intelligence, context, risk]:
        if isinstance(comp, dict):
            sigs = comp.get("signals", [])
            if isinstance(sigs, list):
                for s in sigs:
                    if isinstance(s, dict) and "id" in s:
                        all_signals.append(s)
            # Also check explanation reasons
            if comp is explanation and isinstance(comp.get("reasons"), list):
                for r in comp["reasons"]:
                    if isinstance(r, dict) and r.get("id"):
                        # Map reason to signal-like for citation
                        pass

    # Also include risk signals directly
    risk_sigs = risk.get("signals", [])
    if isinstance(risk_sigs, list):
        for s in risk_sigs:
            if isinstance(s, dict) and s not in all_signals:
                all_signals.append(s)

    # Deduplicate by id
    seen = set()
    dedup: List[Dict[str, Any]] = []
    for s in all_signals:
        sid = s.get("id")
        if sid and sid not in seen:
            seen.add(sid)
            dedup.append(s)
    # Prioritize by contribution/severity
    def _sev(s):
        return {"CRITICAL":4,"HIGH":3,"MEDIUM":2,"LOW":1}.get(str(s.get("severity","MEDIUM")).upper(),2)
    dedup.sort(key=lambda x: (-float(x.get("contribution", x.get("score", 0))), -_sev(x)))

    top = dedup[:3]
    key_findings = []
    evidence = []
    for sig in top:
        fid = sig.get("id", "unknown")
        desc = sig.get("description", sig.get("title", fid.replace("_"," ").title()))
        sev = str(sig.get("severity","MEDIUM")).upper()
        # Human finding sentence
        if fid in ("recipient_new", "recipient_novelty", "recipient_new"):
            finding = "The recipient is unfamiliar — you have not previously paid this recipient."
        elif fid in ("recipient_reported", "recipient_high_report_count", "REPORTED_RECIPIENT"):
            rc = sig.get("evidence", {}).get("report_count", "?")
            finding = f"The recipient has been reported for fraud ({rc} report(s))."
        elif fid in ("amount_deviation", "amount_anomaly", "sudden_behaviour_change"):
            finding = "The payment amount differs significantly from your usual behaviour."
        elif fid in ("urgency_language", "otp_request_language", "impersonation_language"):
            finding = f"Message contains {fid.replace('_',' ')} often seen in social engineering."
        elif fid in ("unfamiliar_device", "unfamiliar_device_ctx", "NEW_DEVICE"):
            finding = "This payment comes from an unfamiliar device."
        elif fid in ("unfamiliar_location", "unfamiliar_location_ctx", "LOCATION_ANOMALY"):
            finding = "The location differs from your usual pattern."
        elif fid in ("rapid_velocity_5m", "HIGH_VELOCITY_5M", "velocity_1h"):
            finding = "Multiple transactions were made in a short time."
        else:
            finding = desc

        key_findings.append({
            "finding": finding,
            "evidence_ids": [fid],
            "severity": sev
        })
        evidence.append({
            "id": fid,
            "description": desc,
            "category": sig.get("category",""),
            "severity": sev
        })

    # Phase 19 — intel findings, citing ONLY supplied supporting signal ids.
    signals_by_id: Dict[str, Dict[str, Any]] = {}
    for s in dedup:
        if isinstance(s, dict) and s.get("id"):
            signals_by_id[s["id"]] = s
            signals_by_id[str(s["id"]).lower()] = s
    intel_fields = _build_intel_fields(attack, account_takeover, scam_network, signals_by_id)
    allowed_signal_ids = set(signals_by_id.keys())

    def _grounded_ids(ids: List[str]) -> List[str]:
        return [i for i in (ids or []) if i in allowed_signal_ids]

    attack_type = str((attack or {}).get("attack_type", "NONE") or "NONE").upper()
    if attack_type != "NONE":
        atk_ids = _grounded_ids(list((attack or {}).get("signal_ids", []) or []))
        if atk_ids:
            label = _ATTACK_LABELS.get(attack_type, attack_type.replace("_", " ").title())
            desc = str((attack or {}).get("description", "") or "").strip()
            key_findings.append({
                "finding": f"Likely {label} pattern" + (f": {desc}" if desc else "") + ".",
                "evidence_ids": atk_ids,
                "severity": _max_severity(atk_ids, signals_by_id),
            })
    if isinstance(account_takeover, dict) and account_takeover.get("account_threat_detected"):
        ato_ids = _grounded_ids(list(account_takeover.get("signal_ids", []) or []))
        if ato_ids:
            key_findings.append({
                "finding": f"Possible account takeover: {str(account_takeover.get('explanation', '') or '').strip()}",
                "evidence_ids": ato_ids,
                "severity": _max_severity(ato_ids, signals_by_id),
            })
    if isinstance(scam_network, dict) and scam_network.get("network_threat_detected"):
        net_ids = _grounded_ids(list(scam_network.get("signal_ids", []) or []))
        nev = scam_network.get("evidence", {}) or {}
        try:
            nrc = int(nev.get("reporter_count", nev.get("report_count", 0)) or 0)
        except Exception:
            nrc = 0
        ntype = str(scam_network.get("network_type", "") or "").replace("_", " ").title()
        extra = f" Flagged by {nrc} users." if nrc >= 2 else ""
        if net_ids or nrc >= 2:
            key_findings.append({
                "finding": f"Possible scam network ({ntype}).{extra} {str(scam_network.get('explanation', '') or '').strip()}".strip(),
                "evidence_ids": net_ids,
                "severity": _max_severity(net_ids, signals_by_id) if net_ids else "HIGH",
            })
    # Cap findings at 5 (signal findings first, then intel) — deterministic.
    key_findings = key_findings[:5]
    # Evidence entries for any newly cited intel ids.
    have_ev = {e.get("id") for e in evidence if isinstance(e, dict)}
    for kf in key_findings:
        for eid in kf.get("evidence_ids", []) or []:
            if eid not in have_ev and eid in signals_by_id:
                s = signals_by_id[eid]
                evidence.append({
                    "id": eid,
                    "description": s.get("description", eid),
                    "category": s.get("category", ""),
                    "severity": str(s.get("severity", "MEDIUM")).upper(),
                })
                have_ev.add(eid)

    if tier == "HIGH_RISK":
        summary = f"This payment is flagged as HIGH_RISK (score {score}) with several risk signals. Review before proceeding."
        risk_explanation = f"The Risk Engine scored this as HIGH_RISK ({score}/100) with confidence {confidence:.2f}. " + ("Top signals: " + ", ".join([k["finding"] for k in key_findings[:2]]) if key_findings else "Evidence listed in signals.")
    elif tier == "CAUTION":
        summary = f"This payment is marked CAUTION (score {score}). Review before proceeding."
        risk_explanation = f"The combined risk is CAUTION ({score}/100). " + (key_findings[0]["finding"] if key_findings else "No major signals, but some caution signals present.")
    else:
        summary = f"This payment looks normal (SAFE, score {score})."
        risk_explanation = "No significant risk signals were found. The transaction matches your usual pattern."

    # Phase 19 — plain-language intel sentence appended from supplied evidence only.
    if intel_fields["attack_scenario"] and attack_type != "NONE":
        risk_explanation = f"{risk_explanation} Likely scenario: {intel_fields['attack_scenario']}."
    if account_takeover.get("account_threat_detected"):
        risk_explanation = f"{risk_explanation} {str(account_takeover.get('explanation', '') or '').strip()}"
    if scam_network.get("network_threat_detected"):
        risk_explanation = f"{risk_explanation} {str(scam_network.get('explanation', '') or '').strip()}"

    if not top and not any([attack_type != "NONE",
                            account_takeover.get("account_threat_detected"),
                            scam_network.get("network_threat_detected")]):
        evidence = []
        key_findings = []

    return {
        "summary": summary,
        "risk_explanation": risk_explanation.strip(),
        "key_findings": key_findings,
        "evidence": evidence,
        "recommended_action": "Review recipient and amount. Verify recipient identity. Proceed with OTP if you recognize the transaction. Cancel voluntarily if uncomfortable. The system will not block the payment.",
        "confidence": round(float(confidence), 2) if confidence else 0.5,
        "investigator_version": INVESTIGATOR_VERSION,
        "attack_scenario": intel_fields["attack_scenario"],
        "affected_factors": intel_fields["affected_factors"],
        "recommended_actions": intel_fields["recommended_actions"],
    }

async def _call_gemini(system_prompt: str, user_prompt: str, timeout: float = 12.0) -> Optional[Dict[str, Any]]:
    """
    Call Gemini server-side. Returns parsed JSON dict or None on failure.
    Mirrors /assistant proxy (httpx to generativelanguage.googleapis.com).
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        import httpx
    except ImportError:
        log.warning("httpx not available for investigator")
        return None

    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 900, "responseMimeType": "application/json"},
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}",
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            if not resp.is_success:
                log.warning("Investigator Gemini error %s: %s", resp.status_code, resp.text[:500])
                return None
            data = resp.json()
            # Extract text
            candidates = data.get("candidates", [])
            if not candidates:
                return None
            text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            if not text:
                return None
            # Try parse JSON
            # Gemini may wrap in code block
            text = text.strip()
            if text.startswith("```"):
                # strip code fence
                import re
                m = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.S)
                if m:
                    text = m.group(1).strip()
            # Attempt to extract JSON object
            import re
            # Find first { and last }
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1:
                text = text[start:end+1]
            obj = json.loads(text)
            return obj
    except Exception as e:
        log.warning("Investigator Gemini call failed: %s", e)
        return None

def _validate_and_ground(
    llm_output: Dict[str, Any],
    allowed_ids: set,
    risk: Dict[str, Any],
    attack: Dict[str, Any] | None = None,
) -> Optional[Dict[str, Any]]:
    """
    Validate LLM output: must have required fields, evidence_ids must be subset of allowed_ids, no invented scores.
    Phase 19: attack_scenario must match the supplied attack evidence (or be unclear/none).
    Returns normalized dict or None if invalid.
    """
    try:
        # Use pydantic for validation
        out = InvestigatorOutput.model_validate(llm_output)
        # Check evidence_ids are grounded
        for finding in out.key_findings:
            for eid in finding.evidence_ids:
                if eid not in allowed_ids:
                    log.warning("Investigator ungrounded evidence_id %s not in %s", eid, allowed_ids)
                    # If any ungrounded, reject whole output to avoid hallucination
                    return None
        # Phase 19: scenario must not invent a different attack than supplied evidence.
        supplied_type = str((attack or {}).get("attack_type", "NONE") or "NONE").upper()
        if out.attack_scenario:
            scen = out.attack_scenario.upper()
            supplied_label = (_ATTACK_LABELS.get(supplied_type, "") or "").upper()
            if supplied_type == "NONE":
                # With no attack evidence, a specific-scam claim is invention.
                known_types = ("KYC", "IMPERSONATION", "REFUND", "REWARD", "PRIZE",
                               "INVESTMENT", "LOAN", "REMOTE", "OTP", "HARVEST",
                               "TAKEOVER", "NETWORK", "CAMPAIGN")
                if any(k in scen for k in known_types) and "NO SPECIFIC" not in scen and "UNCLEAR" not in scen:
                    log.warning("Investigator invented attack scenario %s with NONE evidence", out.attack_scenario)
                    return None
            else:
                if supplied_type not in scen and supplied_label not in scen and "UNCLEAR" not in scen:
                    log.warning("Investigator scenario %s mismatches supplied %s", out.attack_scenario, supplied_type)
                    return None
        # Check that LLM did not invent score tier mismatch
        # Allow summary to mention score, but do not validate strictly
        # Ensure confidence 0-1
        # Ensure summary not claiming definite fraud
        summary_lower = out.summary.lower() + out.risk_explanation.lower()
        if "definitely fraud" in summary_lower or "account is malicious" in summary_lower or "recipient is a scammer" in summary_lower:
            # Check if backend actually supports such strong claim
            has_strong_evidence = any(
                s.get("report_count",0) >=5 or str(s.get("severity","")).upper()=="CRITICAL" for s in []  # placeholder
            )
            # For strict grounding, reject if definitive claim without strong evidence
            # Simplify: reject definitive fraud language
            log.warning("Investigator made definitive fraud claim without support")
            return None
        # Convert back to dict
        return out.model_dump()
    except Exception as e:
        log.warning("Investigator output validation failed: %s", e)
        return None

async def investigate(
    transaction: Dict[str, Any],
    risk: Dict[str, Any],
    behavior: Dict[str, Any],
    fraud_intelligence: Dict[str, Any],
    recipient_intelligence: Dict[str, Any],
    context: Dict[str, Any],
    explanation: Dict[str, Any],
    attack: Dict[str, Any] | None = None,
    account_takeover: Dict[str, Any] | None = None,
    scam_network: Dict[str, Any] | None = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    Main investigator entry. Strict grounding, fallback on failure.
    Does NOT calculate new risk score. RiskEngine remains source of truth.
    Phase 19: uses supplied attack / takeover / network intel as evidence;
    structured intel fields are always derived deterministically (grounded).
    Accepts `network` as alias for scam_network. Extra kwargs ignored.
    """
    if scam_network is None and "network" in kwargs:
        scam_network = kwargs.get("network")
    attack = attack or {}
    account_takeover = account_takeover or {}
    scam_network = scam_network or {}
    # Collect allowed evidence IDs from backend signals (+ intel supports, subset)
    allowed_ids = set()
    for comp in [behavior, fraud_intelligence, recipient_intelligence, context, risk, explanation,
                 attack, account_takeover, scam_network]:
        if isinstance(comp, dict):
            for s in comp.get("signals", []) or []:
                if isinstance(s, dict) and s.get("id"):
                    allowed_ids.add(s["id"])
            for sid in comp.get("signal_ids", []) or []:
                if isinstance(sid, str) and sid:
                    allowed_ids.add(sid)
            for r in comp.get("reasons", []) or []:
                if isinstance(r, dict) and r.get("id"):
                    allowed_ids.add(r["id"])
            # Also risk signals may be list of dicts with id
            if comp is risk:
                for s in comp.get("signals", []) or []:
                    if isinstance(s, dict) and s.get("id"):
                        allowed_ids.add(s["id"])
    # Also add explanation reason ids
    if isinstance(explanation, dict):
        for r in explanation.get("reasons", []):
            if isinstance(r, dict) and r.get("id"):
                allowed_ids.add(r["id"])

    # Build prompts
    system_prompt = SYSTEM_PROMPT
    user_prompt = build_user_prompt(
        transaction=transaction,
        risk=risk,
        behavior=behavior,
        fraud_intelligence=fraud_intelligence,
        recipient_intelligence=recipient_intelligence,
        context=context,
        explanation=explanation,
        attack=attack,
        account_takeover=account_takeover,
        scam_network=scam_network,
    )

    # Grounded intel fields derived deterministically from supplied evidence.
    signals_by_id: Dict[str, Dict[str, Any]] = {}
    for comp in [behavior, fraud_intelligence, recipient_intelligence, context, risk]:
        if isinstance(comp, dict):
            for s in comp.get("signals", []) or []:
                if isinstance(s, dict) and s.get("id"):
                    signals_by_id[s["id"]] = s
                    signals_by_id[str(s["id"]).lower()] = s
    grounded_intel = _build_intel_fields(attack, account_takeover, scam_network, signals_by_id)

    # Try LLM
    llm_out = await _call_gemini(system_prompt, user_prompt)
    if llm_out is not None:
        validated = _validate_and_ground(llm_out, allowed_ids, risk, attack)
        if validated is not None:
            # Ensure version
            validated["investigator_version"] = INVESTIGATOR_VERSION
            # Ensure recommended_action never blocks
            rec = validated.get("recommended_action", "")
            if "block" in rec.lower() and "not block" not in rec.lower():
                validated["recommended_action"] = "Review recipient and proceed with OTP if recognized. The system will not block the payment."
            # Structured intel fields always come from supplied evidence (grounded).
            validated["attack_scenario"] = grounded_intel["attack_scenario"]
            validated["affected_factors"] = grounded_intel["affected_factors"]
            validated["recommended_actions"] = grounded_intel["recommended_actions"]
            return validated
        else:
            log.info("Investigator LLM output failed validation, falling back")

    # Fallback deterministic (always available, no invention)
    fallback = _fallback_investigation(
        transaction=transaction,
        risk=risk,
        behavior=behavior,
        fraud_intelligence=fraud_intelligence,
        recipient_intelligence=recipient_intelligence,
        context=context,
        explanation=explanation,
        attack=attack,
        account_takeover=account_takeover,
        scam_network=scam_network,
    )
    return fallback
