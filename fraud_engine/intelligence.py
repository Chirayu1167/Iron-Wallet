"""
fraud_engine/intelligence.py — Deterministic Fraud Intelligence Engine (Phase 5)

Deterministic, explainable, testable, rule-based, evidence-driven.

Organized categories (5B):
1. RECIPIENT_INTELLIGENCE
2. TRANSACTION_PATTERNS
3. SCAM_LANGUAGE / SOCIAL_ENGINEERING
4. NETWORK / DEVICE
5. ACCOUNT_BEHAVIOUR

Produces structured signals: {id, category, severity, score, evidence, description, source}
Severity: LOW/MEDIUM/HIGH/CRITICAL (not BLOCK)
Does NOT independently block payments — signals only.

Performance: bounded history windows (30), cached recipient reputation.

Phase 5 specifics:
- fraud_score 0-100 separate from behavior_score
- confidence based on evidence quality
- deduplication of signals
- explanations with evidence
"""
from __future__ import annotations
import time
import calendar
import math
from typing import Dict, Any, List, Optional, Tuple

from .fraud_rules import ALL_RULES, RULES_BY_ID, Severity, PatternCategory
from .pattern_matcher import match_patterns
from .fraud_scorer import compute_fraud_score
from .confidence import compute_confidence
from .keyword_detector import detect_social_engineering, detect_upi_structural_risk

try:
    import scam_registry
except ImportError:
    scam_registry = None

# ── Recipient intelligence ───────────────────────────────────────────────────
def get_recipient_intelligence(recipient: str) -> Dict[str, Any]:
    """
    5F — recipient reputation wrapper around scam_registry.
    Returns standardized result or clean if scam_registry unavailable.
    """
    if scam_registry is None or not recipient:
        return {
            "recipient": recipient,
            "known": False,
            "reported": False,
            "report_count": 0,
            "reputation": "CLEAN",
            "signals": [],
            "source": "scam_registry",
        }
    # Use new reputation if available, else fallback to risk
    if hasattr(scam_registry, "get_recipient_reputation"):
        rep = scam_registry.get_recipient_reputation(recipient)
        # Map to 5F shape
        return {
            "recipient": rep.get("recipient", recipient),
            "known": rep.get("known", False),
            "reported": rep.get("reported", False),
            "report_count": rep.get("report_count", 0),
            "reputation": rep.get("reputation", "CLEAN"),
            "tier": rep.get("tier", "clean"),
            "confidence": rep.get("confidence", 0.9),
            "recency_days": rep.get("recency_days"),
            "evidence": rep.get("evidence", {}),
            "signals": rep.get("signals", []),
            "source": "scam_registry",
        }
    else:
        risk = scam_registry.get_recipient_risk(recipient)
        count = int(risk.get("report_count", 0))
        tier = risk.get("tier", "clean")
        rep = "HIGH_RISK" if tier == "high_risk" else ("FLAGGED" if tier == "flagged" else "CLEAN")
        return {
            "recipient": recipient,
            "known": count > 0,
            "reported": count > 0,
            "report_count": count,
            "reputation": rep,
            "tier": tier,
            "confidence": 0.85 if count >=3 else (0.70 if count>=1 else 0.92),
            "recency_days": None,
            "evidence": {"report_count": count, "reasons": risk.get("reasons", [])},
            "signals": [],
            "source": "scam_registry",
        }

# ── Velocity detection from persisted history (5G) ───────────────────────────
def _parse_epochs(history: List[Dict[str, Any]]) -> List[float]:
    out = []
    for h in history:
        ts = h.get("timestamp")
        if not ts:
            continue
        try:
            out.append(calendar.timegm(time.strptime(ts, "%Y-%m-%dT%H:%M:%SZ")))
        except Exception:
            continue
    return out

def detect_velocity_signals(
    history: List[Dict[str, Any]],
    current_recipient: str | None = None,
    current_amount: float | None = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """
    Use persisted transactions to detect velocity patterns with windows 5m/1h/24h.
    Returns (signals, metrics)
    Thresholds documented:
      - 3+ in 5m → HIGH
      - 6+ in 60m → MEDIUM
      - 3+ unique recipients in 30m → HIGH
      - burst amount escalation → MEDIUM/HIGH
    """
    signals: List[Dict[str, Any]] = []
    now = time.time()
    epochs = _parse_epochs(history)
    # Recent counts
    cnt_5m = sum(1 for e in epochs if now - e < 300)
    cnt_1h = sum(1 for e in epochs if now - e < 3600)
    cnt_24h = sum(1 for e in epochs if now - e < 86400)
    # Unique recipients in 30m
    uniq_30 = set()
    for h in history:
        try:
            e = calendar.timegm(time.strptime(h.get("timestamp",""), "%Y-%m-%dT%H:%M:%SZ"))
            if now - e < 1800:
                uniq_30.add(h.get("recipient",""))
        except Exception:
            continue
    # If current tx would be added, increment counts for prospective check
    # For detection we include current transaction prospectively (+1)
    prospective_5m = cnt_5m + 1
    prospective_1h = cnt_1h + 1
    prospective_uniq = len(uniq_30 | ({current_recipient} if current_recipient else set()))

    metrics = {"cnt_5m": prospective_5m, "cnt_1h": prospective_1h, "cnt_24h": cnt_24h+1, "uniq_30m": prospective_uniq}

    if prospective_5m >= 3:
        signals.append({
            "id": "rapid_velocity_5m",
            "category": "VELOCITY",
            "severity": "HIGH",
            "score": 16,
            "evidence": {"count_5m": prospective_5m, "window": "5m", "threshold": 3},
            "description": f"Rapid repeated transfers: {prospective_5m} transactions in 5 minutes — automated attack signature",
            "source": "velocity_engine",
        })
    if prospective_1h >= 6:
        signals.append({
            "id": "high_velocity_1h",
            "category": "VELOCITY",
            "severity": "MEDIUM",
            "score": 10,
            "evidence": {"count_1h": prospective_1h, "window": "1h", "threshold": 6},
            "description": f"Unusually high volume: {prospective_1h} transactions in the past hour",
            "source": "velocity_engine",
        })
    if prospective_uniq >= 3:
        signals.append({
            "id": "recipient_switching",
            "category": "VELOCITY",
            "severity": "HIGH",
            "score": 15,
            "evidence": {"unique_30m": prospective_uniq, "window": "30m", "threshold": 3},
            "description": f"Sending to {prospective_uniq} different recipients in 30 min — account-drain pattern",
            "source": "velocity_engine",
        })

    # Burst amount escalation: check recent amounts sequential increase
    recent_amounts = [float(h.get("amount",0)) for h in sorted(history, key=lambda x: x.get("timestamp",""), reverse=True)[:5]]
    # Include current amount at front for burst check
    if current_amount is not None:
        recent_amounts = [float(current_amount)] + recent_amounts[:4]
    # Detect incrementing pattern: each next >= previous *1.5
    if len(recent_amounts) >= 3:
        # Check if sequence is increasing worryingly
        inc = all(recent_amounts[i] >= recent_amounts[i+1] * 1.3 for i in range(min(3, len(recent_amounts)-1)))
        # Or total burst in 24h vs average?
        if inc and max(recent_amounts) > 1000:
            signals.append({
                "id": "amount_escalation_burst",
                "category": "TRANSACTION_PATTERNS",
                "severity": "HIGH",
                "score": 14,
                "evidence": {"recent_amounts": recent_amounts[:4], "pattern": "incrementing"},
                "description": "Recent transactions show escalating amounts — possible wallet testing/burst attack",
                "source": "velocity_engine",
            })
        # Also check total burst: sum of last 3 > 2× avg would be handled by account behaviour
    return signals, metrics

# ── Device / Location signals (5B-4) ─────────────────────────────────────────
def detect_device_location_signals(
    device_familiarity: float | None,
    location_familiarity: float | None,
    baseline_device: Dict[str, Any] | None = None,
    baseline_location: Dict[str, Any] | None = None,
) -> List[Dict[str, Any]]:
    signals: List[Dict[str, Any]] = []
    # Device familiarity <0.5 => unfamiliar device
    if device_familiarity is not None and float(device_familiarity) < 0.5:
        signals.append({
            "id": "unfamiliar_device",
            "category": "NETWORK",
            "severity": "HIGH",
            "score": 18,
            "evidence": {"device_familiarity": float(device_familiarity), "threshold": 0.5},
            "description": "Transaction from a device not previously associated with this account",
            "source": "device_engine",
        })
    elif baseline_device is not None and device_familiarity is None:
        # If we have baseline but no current, treat missing as unfamiliar?
        pass

    if location_familiarity is not None and float(location_familiarity) < 0.5:
        signals.append({
            "id": "unfamiliar_location",
            "category": "NETWORK",
            "severity": "HIGH",
            "score": 15,
            "evidence": {"location_familiarity": float(location_familiarity), "threshold": 0.5},
            "description": "Transaction origin differs from user's known geographic pattern",
            "source": "location_engine",
        })
    return signals

# ── Account behaviour signals (5B-5) ─────────────────────────────────────────
def detect_account_behaviour_signals(
    amount: float,
    history: List[Dict[str, Any]],
    recipient: str | None = None,
    hour_of_day: int | None = None,
) -> List[Dict[str, Any]]:
    signals: List[Dict[str, Any]] = []
    if not history:
        # Cold start — cannot detect sudden change reliably; return empty
        return signals
    amounts = []
    for h in history:
        try:
            amounts.append(float(h.get("amount", 0)))
        except Exception:
            continue
    if not amounts:
        return signals
    import numpy as np
    arr = np.array(amounts, dtype=float)
    mean = float(np.mean(arr))
    std = float(np.std(arr)) if len(arr) > 1 else mean * 0.5 or 500
    if std < 1:
        std = max(mean * 0.3, 100)
    z = (float(amount) - mean) / std if std else 0

    if abs(z) >= 3.0:
        signals.append({
            "id": "sudden_behaviour_change",
            "category": "ACCOUNT_BEHAVIOUR",
            "severity": "HIGH" if abs(z) >= 4 else "MEDIUM",
            "score": 18 if abs(z) >= 4 else 10,
            "evidence": {"amount": float(amount), "mean": round(mean,2), "std": round(std,2), "zscore": round(z,2), "history_count": len(amounts)},
            "description": f"Amount is {abs(z):.1f} std from user's normal spending (mean Rs.{mean:.0f}) — sudden behaviour change",
            "source": "behaviour_engine",
        })
    elif abs(z) >= 2.0 and float(amount) > mean * 2:
        signals.append({
            "id": "unusual_amount_spike",
            "category": "ACCOUNT_BEHAVIOUR",
            "severity": "MEDIUM",
            "score": 8,
            "evidence": {"amount": float(amount), "mean": round(mean,2), "zscore": round(z,2)},
            "description": f"Transaction amount Rs.{amount:.0f} is unusually high vs typical Rs.{mean:.0f}",
            "source": "behaviour_engine",
        })

    # Unusual hour vs history peak hours (derived from history)
    if hour_of_day is not None and history:
        hours = []
        for h in history:
            try:
                tm = time.strptime(h.get("timestamp",""), "%Y-%m-%dT%H:%M:%SZ")
                hours.append(tm.tm_hour)
            except Exception:
                continue
        if hours:
            from collections import Counter
            cnt = Counter(hours)
            # peak hours = top 3
            peaks = {h for h, _ in cnt.most_common(3)}
            if hour_of_day not in peaks and 1 <= hour_of_day <= 5:
                signals.append({
                    "id": "unusual_transaction_timing",
                    "category": "ACCOUNT_BEHAVIOUR",
                    "severity": "MEDIUM",
                    "score": 8,
                    "evidence": {"hour": hour_of_day, "peak_hours": sorted(peaks)},
                    "description": f"Transaction at {hour_of_day}:00 — outside user's typical active hours {sorted(peaks)}",
                    "source": "behaviour_engine",
                })

    # Unusual recipient sequence: if recipient never seen and last 2 recipients were different?
    if recipient and history:
        recent_recipients = [h.get("recipient","") for h in sorted(history, key=lambda x: x.get("timestamp",""), reverse=True)[:3]]
        if recipient not in recent_recipients and len(set(recent_recipients)) >= 2:
            # Only flag if we have high velocity context — otherwise this is just new recipient (covered by RECIPIENT)
            pass

    return signals

# ── Main fraud intelligence orchestrator ─────────────────────────────────────
def _deduplicate_signals(signals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    5I — Rule deduplication. Avoid counting same underlying signal multiple times.
    Normalized signal identity: use id mapping.
    Example maps:
      scam_registry recipient_reported  ↔  fraud_rules REPORTED_RECIPIENT
    Keep highest severity/score per underlying evidence.
    """
    # Mapping of duplicate groups — same evidence, different ids should be merged
    dup_groups = {
        "recipient_reported": {"recipient_reported", "REPORTED_RECIPIENT", "recipient_flagged"},
        "recipient_high_reports": {"recipient_high_reports", "HIGH_RISK_RECIPIENT", "recipient_reported", "REPORTED_RECIPIENT"},
        "velocity_5m": {"rapid_velocity_5m", "HIGH_VELOCITY_5M"},
        "velocity_1h": {"high_velocity_1h", "HIGH_VELOCITY_1H"},
        "recipient_switching": {"recipient_switching", "RECIPIENT_SWITCHING"},
        "device": {"unfamiliar_device", "NEW_DEVICE"},
        "location": {"unfamiliar_location", "LOCATION_ANOMALY"},
    }
    # Build reverse mapping id -> group
    id_to_group: Dict[str, str] = {}
    for g, ids in dup_groups.items():
        for i in ids:
            id_to_group[i] = g

    grouped: Dict[str, Dict[str, Any]] = {}
    for sig in signals:
        gid = id_to_group.get(sig["id"], sig["id"])
        # Keep highest score/severity per group
        if gid not in grouped:
            grouped[gid] = sig
        else:
            existing = grouped[gid]
            # Compare severity order CRITICAL>HIGH>MEDIUM>LOW
            order = {"LOW":0,"MEDIUM":1,"HIGH":2,"CRITICAL":3}
            if order.get(sig["severity"],0) > order.get(existing["severity"],0):
                grouped[gid] = sig
            elif sig.get("score",0) > existing.get("score",0):
                grouped[gid] = sig
            # else keep existing
    # Return sorted by score desc
    deduped = list(grouped.values())
    deduped.sort(key=lambda x: (-x.get("score",0), x.get("id","")))
    return deduped

def run_fraud_intelligence_deterministic(
    transaction: Dict[str, Any],
    history: List[Dict[str, Any]] | None = None,
    user_profile: Dict[str, Any] | None = None,
    behavior_score: float | None = None,
    note: str | None = None,
    recipient: str | None = None,
    upi_id: str | None = None,
    device_familiarity: float | None = None,
    location_familiarity: float | None = None,
    baselines: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """
    Phase 5 deterministic fraud-intelligence entry point.

    Uses persisted history where available, scam_registry, velocity detection,
    keyword/social engineering, device/location, account behaviour.

    Returns:
      {
        "fraud_score": 78,          # 0-100 separate from behavior_score
        "confidence": 0.87,         # based on evidence quality
        "signals": [ structured ...],
        "recipient_reputation": {...},
        "velocity": {...},
        "categories": [...]
      }
    Does NOT compute final combined risk — Phase 6 will.
    """
    history = history or []
    user_profile = user_profile or {}
    # Resolve recipient and note
    recipient_val = recipient or transaction.get("recipient") or transaction.get("merchant_name") or ""
    note_val = note or transaction.get("note", "") or ""
    upi_val = upi_id or (recipient_val if "@" in str(recipient_val) else None)
    # Bound history for performance — only need last 50
    history = history[:50]

    all_signals: List[Dict[str, Any]] = []

    # 1. RECIPIENT INTELLIGENCE (scam_registry)
    rep = get_recipient_intelligence(str(recipient_val) if recipient_val else "")
    for sig in rep.get("signals", []):
        # Ensure consistent category
        sig_copy = dict(sig)
        # Map severity string to upper if needed
        if sig_copy.get("severity"):
            sig_copy["severity"] = str(sig_copy["severity"]).upper()
        all_signals.append(sig_copy)

    # Additional unfamiliar recipient check via history (if not already reported)
    # If recipient unfamiliar and not already flagged, add low-medium signal
    # Use history to compute familiarity directly
    if history is not None:
        recips = set(h.get("recipient","") for h in history)
        # normalized matching for phone
        norm_recip = str(recipient_val).strip()
        unfamiliar = norm_recip not in recips
        # Phone suffix check
        if unfamiliar and norm_recip.isdigit():
            suffix = norm_recip[-10:]
            unfamiliar = not any(str(r)[-10:] == suffix for r in recips if str(r).isdigit())
        if unfamiliar and norm_recip and not rep.get("reported"):
            # Only flag unfamiliar if history_count >=3 to avoid flagging every cold-start as fraud
            if len(history) >= 3:
                all_signals.append({
                    "id": "unfamiliar_recipient",
                    "category": "RECIPIENT",
                    "severity": "MEDIUM",
                    "score": 10,
                    "evidence": {"recipient": norm_recip, "history_count": len(history)},
                    "description": "Recipient has not appeared in user's transaction history - unfamiliar recipient",
                    "source": "history_engine",
                })
        # Recently reported check (recency_days <=7)
        if rep.get("recency_days") is not None and rep["recency_days"] <= 3 and rep.get("report_count",0) >=1:
            all_signals.append({
                "id": "recently_reported_recipient",
                "category": "RECIPIENT",
                "severity": "HIGH",
                "score": 14,
                "evidence": {"recency_days": rep["recency_days"], "report_count": rep["report_count"]},
                "description": f"Recipient reported {rep['recency_days']} days ago — recently flagged",
                "source": "scam_registry",
            })

    # 2. VELOCITY (persisted)
    vel_signals, vel_metrics = detect_velocity_signals(history, str(recipient_val) if recipient_val else None, float(transaction.get("amount",0)) if transaction.get("amount") is not None else None)
    all_signals.extend(vel_signals)

    # Also run existing pattern_matcher for legacy velocity/balance/device rules using built signals
    # Build signals dict for legacy matcher: need txn_velocity_1h etc from vel_metrics
    legacy_signals_dict = {
        "amount": float(transaction.get("amount", 0)),
        "user_avg_amount": float(user_profile.get("avg_amount", 1500)),
        "balance_drain_pct": min(float(transaction.get("amount",0)) / float(transaction.get("balance_before") or transaction.get("balance", 10000) or 1), 1.0),
        "is_p2p": (transaction.get("recipient_type") == "individual"),
        "recipient_frequency_score": 0.0 if all_signals and any(s["id"]=="unfamiliar_recipient" for s in all_signals) else 1.0,
        "days_since_recipient_seen": 999 if any(s["id"]=="unfamiliar_recipient" for s in all_signals) else 0,
        "recipient_report_count": int(rep.get("report_count",0)),
        "is_off_network": transaction.get("is_off_network", False),
        "hour_of_day": int(transaction.get("hour_of_day", 12)),
        "txn_velocity_5m": int(vel_metrics.get("cnt_5m", 1)),
        "txn_velocity_1h": int(vel_metrics.get("cnt_1h", 1)),
        "unique_recipients_30m": int(vel_metrics.get("uniq_30m", 1)),
        "device_familiarity": float(device_familiarity if device_familiarity is not None else transaction.get("device_familiarity", 1.0)),
        "location_familiarity": float(location_familiarity if location_familiarity is not None else transaction.get("location_familiarity", 1.0)),
        "recent_amounts": [float(h.get("amount",0)) for h in history[:5]],
        "urgency_score": float(transaction.get("urgency_score", 0.0)),
        "daily_spend_ratio": min((float(transaction.get("daily_spend_today",0)) + float(transaction.get("amount",0))) / max(float(user_profile.get("daily_avg_spend", 3000)) or 1, 1.0), 1.0),
        "merchant_frequency_score": float(transaction.get("merchant_frequency_score", 0.5)),
    }
    matched_rules = match_patterns(legacy_signals_dict)
    for r in matched_rules:
        # Convert FraudRule to structured signal with dedup id mapping
        # Skip recipient rules if already covered by scam_registry to avoid double count — dedup will handle but we still include for scoring
        all_signals.append({
            "id": r.id,
            "category": r.category.value,
            "severity": r.severity.value,
            "score": round(r.base_weight * (1.4 if r.severity==Severity.CRITICAL else 1.2 if r.severity==Severity.HIGH else 1.0 if r.severity==Severity.MEDIUM else 0.75), 2),
            "evidence": {"rule": r.id, "base_weight": r.base_weight},
            "description": r.user_message,
            "source": "fraud_rules",
        })

    # 3. SOCIAL ENGINEERING / KEYWORD (deterministic)
    se_signals = detect_social_engineering(note_val, upi_val, str(recipient_val) if recipient_val else None)
    all_signals.extend(se_signals)
    # UPI structural
    upi_signals = detect_upi_structural_risk(upi_val)
    all_signals.extend(upi_signals)

    # 4. DEVICE / LOCATION
    dev_fam = device_familiarity if device_familiarity is not None else transaction.get("device_familiarity")
    loc_fam = location_familiarity if location_familiarity is not None else transaction.get("location_familiarity")
    # Also allow baseline lookup if not passed explicitly — caller may provide baselines dict
    dl_signals = detect_device_location_signals(
        dev_fam, loc_fam,
        baselines.get("device") if baselines else None,
        baselines.get("location") if baselines else None,
    )
    all_signals.extend(dl_signals)

    # 5. ACCOUNT BEHAVIOUR
    acct_signals = detect_account_behaviour_signals(
        float(transaction.get("amount",0)),
        history,
        str(recipient_val) if recipient_val else None,
        int(transaction.get("hour_of_day", 12)),
    )
    all_signals.extend(acct_signals)

    # Deduplicate (5I)
    deduped = _deduplicate_signals(all_signals)

    # Compute fraud_score deterministic (5J) — not using ML combined yet
    # Use weighted sum similar to fraud_scorer but without behaviour prior unless provided
    # For pure phase5, if behavior_score provided we lightly influence, else independent
    # Compute severity-weighted sum
    if not deduped:
        # No signals => low fraud, may lean on behavior slightly if provided
        if behavior_score is not None:
            base = float(behavior_score) * 0.15
            fraud_score = int(round(min(base, 30)))
        else:
            fraud_score = 0
    else:
        from .fraud_scorer import _SEVERITY_MULT
        # Map signal severity to multiplier
        sev_mult = {"LOW":0.75,"MEDIUM":1.0,"HIGH":1.2,"CRITICAL":1.4}
        raw = sum(float(s.get("score",0)) * sev_mult.get(str(s.get("severity","MEDIUM")).upper(),1.0) for s in deduped)
        # Behaviour prior light (±10 max) if provided
        if behavior_score is not None:
            raw += (float(behavior_score) - 50) / 50 * 6  # reduced to 6 to keep independence
        # Logistic saturation
        k = 0.06
        centre = 40.0
        saturated = 100 / (1 + math.exp(-k * (raw - centre)))
        fraud_score = max(0, min(100, int(round(saturated))))

    # Confidence (5K) — based on evidence quality
    # Multiple independent signals → higher confidence
    # Single weak → lower; verified scam registry → stronger
    if not deduped:
        confidence = 0.35 if history else 0.25
        if behavior_score is not None and behavior_score < 20:
            confidence = 0.55  # confident it's clean when no signals and normal behaviour
    else:
        # Severity-weighted quality
        sev_conf = {"LOW":4,"MEDIUM":10,"HIGH":18,"CRITICAL":25}
        quality = sum(sev_conf.get(str(s.get("severity","MEDIUM")).upper(),0) for s in deduped)
        quality = min(quality, 60)
        categories_hit = len(set(s.get("category","") for s in deduped))
        diversity = min(categories_hit * 5, 20)
        # Agreement not applicable without behavior, but if behavior provided include
        agreement_bonus = 0
        if behavior_score is not None:
            agreement_bonus = int(min(float(behavior_score), float(fraud_score)) / 100 * 10)
        # Single weak penalty
        single_penalty = -10 if len(deduped)==1 and deduped[0].get("severity") in ("LOW","MEDIUM") else 0
        # Verified scam registry boost
        scam_boost = 15 if any(s.get("source")=="scam_registry" and s.get("evidence",{}).get("report_count",0)>=3 for s in deduped) else 0
        raw_conf = 10 + quality + diversity + agreement_bonus + single_penalty + scam_boost
        # Normalize to 0-1
        confidence  = max(5, min(99, int(raw_conf))) / 100.0
        confidence = round(float(confidence), 2)

    # Ensure confidence is float 0-1
    if isinstance(confidence, int):
        confidence = confidence / 100.0

    # Explanations: already have description per signal
    categories = sorted(list({s.get("category","") for s in deduped}))

    return {
        "fraud_score": int(fraud_score),
        "confidence": float(confidence),
        "signals": deduped,
        "recipient": rep,
        "recipient_reputation": {
            "recipient": rep.get("recipient"),
            "known": rep.get("known"),
            "reported": rep.get("reported"),
            "report_count": rep.get("report_count"),
            "reputation": rep.get("reputation"),
            "tier": rep.get("tier"),
            "evidence": rep.get("evidence"),
            "source": rep.get("source"),
        },
        "velocity": vel_metrics,
        "categories": categories,
        "signal_count": len(deduped),
        "history_count": len(history),
    }
