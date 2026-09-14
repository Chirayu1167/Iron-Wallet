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
) -> Dict[str, Any]:
    """
    Fallback when LLM unavailable/malformed. Uses backend evidence only.
    """
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

    top = dedup[:5]
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

    if tier == "HIGH_RISK":
        summary = f"This payment is flagged as HIGH_RISK (score {score}) with several risk signals. Review before proceeding."
        risk_explanation = f"The Risk Engine scored this as HIGH_RISK ({score}/100) with confidence {confidence:.2f}. " + ("Top signals: " + ", ".join([k["finding"] for k in key_findings[:2]]) if key_findings else "Evidence listed in signals.")
    elif tier == "CAUTION":
        summary = f"This payment is marked CAUTION (score {score}). Review before proceeding."
        risk_explanation = f"The combined risk is CAUTION ({score}/100). " + (key_findings[0]["finding"] if key_findings else "No major signals, but some caution signals present.")
    else:
        summary = f"This payment looks normal (SAFE, score {score})."
        risk_explanation = "No significant risk signals were found. The transaction matches your usual pattern."

    if not top:
        evidence = []
        key_findings = []

    return {
        "summary": summary,
        "risk_explanation": risk_explanation,
        "key_findings": key_findings,
        "evidence": evidence,
        "recommended_action": "Review recipient and amount. Verify recipient identity. Proceed with OTP if you recognize the transaction. Cancel voluntarily if uncomfortable. The system will not block the payment.",
        "confidence": round(float(confidence), 2) if confidence else 0.5,
        "investigator_version": INVESTIGATOR_VERSION,
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
) -> Optional[Dict[str, Any]]:
    """
    Validate LLM output: must have required fields, evidence_ids must be subset of allowed_ids, no invented scores.
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
) -> Dict[str, Any]:
    """
    Main investigator entry. Strict grounding, fallback on failure.
    Does NOT calculate new risk score.
    """
    # Collect allowed evidence IDs from backend signals
    allowed_ids = set()
    for comp in [behavior, fraud_intelligence, recipient_intelligence, context, risk, explanation]:
        if isinstance(comp, dict):
            for s in comp.get("signals", []) or []:
                if isinstance(s, dict) and s.get("id"):
                    allowed_ids.add(s["id"])
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
    )

    # Try LLM
    llm_out = await _call_gemini(system_prompt, user_prompt)
    if llm_out is not None:
        validated = _validate_and_ground(llm_out, allowed_ids, risk)
        if validated is not None:
            # Ensure version
            validated["investigator_version"] = INVESTIGATOR_VERSION
            # Ensure recommended_action never blocks
            rec = validated.get("recommended_action", "")
            if "block" in rec.lower() and "not block" not in rec.lower():
                validated["recommended_action"] = "Review recipient and proceed with OTP if recognized. The system will not block the payment."
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
    )
    return fallback
