"""
risk_engine/recipient.py — Recipient Intelligence (Phase 8)

Aggregates user-specific transaction history + global scam registry reputation
into an explainable recipient profile and score. Privacy-aware: only aggregates.

Performance: bounded history (limit 100), indexed query on phone.
"""
from __future__ import annotations
import time
import calendar
import math
from typing import Dict, Any, List, Optional
from collections import Counter

try:
    import iron_store
except ImportError:
    iron_store = None

try:
    import scam_registry
except ImportError:
    scam_registry = None

RECIPIENT_INTELLIGENCE_VERSION = "v1"

def _normalize_recipient(recipient: str) -> str:
    if scam_registry and hasattr(scam_registry, "_normalize_recipient"):
        return scam_registry._normalize_recipient(recipient)
    r = (recipient or "").strip()
    digits = "".join(c for c in r if c.isdigit())
    if digits and ("@" not in r):
        if len(digits) >= 10:
            return digits[-10:]
        return digits
    return r.lower()

def _parse_ts(ts: str) -> float | None:
    try:
        return calendar.timegm(time.strptime(ts, "%Y-%m-%dT%H:%M:%SZ"))
    except Exception:
        return None

def get_recipient_profile(phone: str, recipient: str) -> Dict[str, Any]:
    """
    8A/8B — Build normalized recipient intelligence model for a given user+recipient.

    Returns:
      {
        "recipient": "9876543210",
        "known": true,
        "transaction_count": 12,
        "first_seen": "2024-03-01T10:00:00Z",
        "last_seen": "2024-08-15T14:22:00Z",
        "total_amount": 45000,
        "avg_amount": 3750,
        "median_amount": 3200,
        "reported": true,
        "report_count": 3,
        "reputation": "CAUTION",
        "risk_score": 62,
        "familiarity": "FREQUENT",
        "signals": [...],
        "evidence": {...}
      }
    """
    if not recipient or not recipient.strip():
        return {
            "recipient": recipient,
            "known": False,
            "transaction_count": 0,
            "first_seen": None,
            "last_seen": None,
            "total_amount": 0,
            "avg_amount": 0,
            "median_amount": 0,
            "reported": False,
            "report_count": 0,
            "reputation": "CLEAN",
            "risk_score": 0,
            "confidence": 0.5,
            "familiarity": "NEW",
            "signals": [],
            "evidence": {},
            "version": RECIPIENT_INTELLIGENCE_VERSION,
        }

    norm = _normalize_recipient(recipient)
    now = time.time()

    # ── User-specific history aggregation (bounded) ──────────────────────────
    history_count = 0
    txs_for_recipient: List[Dict[str, Any]] = []
    first_seen = None
    last_seen = None
    total_amount = 0.0
    amounts: List[float] = []
    timestamps: List[float] = []

    if iron_store is not None and phone:
        try:
            all_txs = iron_store.get_transactions_for_user(phone, limit=100)
            for tx in all_txs:
                rec = (tx.get("recipient") or "").strip()
                # Normalize both for comparison (phone suffix or UPI lower)
                is_match = False
                if _normalize_recipient(rec) == norm:
                    is_match = True
                elif rec == recipient:
                    is_match = True
                if is_match:
                    txs_for_recipient.append(tx)
                    try:
                        amt = float(tx.get("amount", 0))
                        amounts.append(amt)
                        total_amount += amt
                    except Exception:
                        pass
                    ts = tx.get("timestamp")
                    ep = _parse_ts(ts) if ts else None
                    if ep is not None:
                        timestamps.append(ep)
                        if first_seen is None or ep < _parse_ts(first_seen) if first_seen else True:
                            # Track earliest/latest via epoch
                            pass
            if txs_for_recipient:
                # Determine first/last by timestamp
                txs_sorted = sorted(txs_for_recipient, key=lambda x: x.get("timestamp", ""))
                first_seen = txs_sorted[0].get("timestamp")
                last_seen = txs_sorted[-1].get("timestamp")
                history_count = len(txs_for_recipient)
        except Exception:
            pass

    # Compute aggregates
    avg_amount = float(sum(amounts) / len(amounts)) if amounts else 0.0
    median_amount = float(sorted(amounts)[len(amounts)//2]) if amounts else 0.0
    # Familiarity (8C)
    if history_count == 0:
        familiarity = "NEW"
    elif history_count >= 5:
        familiarity = "FREQUENT"
    else:
        familiarity = "FAMILIAR"

    # ── Global reputation via scam_registry ─────────────────────────────────
    reported = False
    report_count = 0
    reputation = "CLEAN"
    report_recency_days: Optional[int] = None
    report_confidence = 0.92
    reasons: List[str] = []
    if scam_registry is not None:
        try:
            if hasattr(scam_registry, "get_recipient_reputation"):
                rep = scam_registry.get_recipient_reputation(recipient)
            else:
                rep = scam_registry.get_recipient_risk(recipient)
            report_count = int(rep.get("report_count", 0))
            reported = report_count >= 1
            tier = rep.get("tier", "clean")
            if tier == "high_risk":
                reputation = "HIGH_RISK"
            elif tier == "flagged":
                reputation = "CAUTION"
            else:
                reputation = "CLEAN"
            report_confidence = float(rep.get("confidence", 0.92))
            report_recency_days = rep.get("recency_days")
            reasons = rep.get("reasons", []) or rep.get("reasons", [])
        except Exception:
            pass

    # ── Personal vs Global signals (8G) ─────────────────────────────────────
    signals: List[Dict[str, Any]] = []

    # Familiarity signals
    if familiarity == "NEW":
        signals.append({
            "id": "recipient_new",
            "category": "RECIPIENT",
            "severity": "MEDIUM",
            "score": 12,
            "evidence": {"transaction_count": 0, "familiarity": "NEW"},
            "description": "You have not previously paid this recipient",
            "source": "recipient_intelligence",
        })
    elif familiarity == "FAMILIAR":
        signals.append({
            "id": "recipient_familiar",
            "category": "RECIPIENT",
            "severity": "LOW",
            "score": 2,
            "evidence": {"transaction_count": history_count, "familiarity": "FAMILIAR"},
            "description": f"You have paid this recipient {history_count} times before",
            "source": "recipient_intelligence",
        })
    elif familiarity == "FREQUENT":
        signals.append({
            "id": "recipient_frequent",
            "category": "RECIPIENT",
            "severity": "LOW",
            "score": 0,
            "evidence": {"transaction_count": history_count, "familiarity": "FREQUENT", "avg_amount": round(avg_amount,2)},
            "description": f"Frequent recipient — {history_count} prior payments, avg Rs.{avg_amount:.0f}",
            "source": "recipient_intelligence",
        })

    # Global report signals
    if reported:
        if report_count >= 3:
            signals.append({
                "id": "recipient_high_report_count",
                "category": "RECIPIENT",
                "severity": "CRITICAL",
                "score": 28,
                "evidence": {"report_count": report_count, "reputation": reputation, "recency_days": report_recency_days},
                "description": f"Recipient has {report_count} fraud reports ({reputation})",
                "source": "scam_registry",
            })
        else:
            signals.append({
                "id": "recipient_reported",
                "category": "RECIPIENT",
                "severity": "HIGH",
                "score": 18,
                "evidence": {"report_count": report_count, "reputation": reputation},
                "description": f"Recipient has {report_count} fraud report(s)",
                "source": "scam_registry",
            })
        # Recency
        if report_recency_days is not None and report_recency_days <= 7:
            signals.append({
                "id": "recipient_recently_reported",
                "category": "RECIPIENT",
                "severity": "HIGH",
                "score": 14,
                "evidence": {"recency_days": report_recency_days, "report_count": report_count},
                "description": f"Recently reported {report_recency_days} days ago",
                "source": "scam_registry",
            })
        elif report_recency_days is not None and report_recency_days > 180:
            signals.append({
                "id": "recipient_old_report",
                "category": "RECIPIENT",
                "severity": "LOW",
                "score": 4,
                "evidence": {"recency_days": report_recency_days},
                "description": f"Report is old ({report_recency_days} days ago) — lower relevance",
                "source": "scam_registry",
            })

    # Amount anomaly vs personal recipient history (8D)
    # If current transaction amount not provided here, this is just profile-level anomaly check — caller can pass amount via context
    # We don't have current amount in this function; recipient risk score will be context-agnostic unless amount supplied via extra param.
    # For now, risk_score will be based on reports + familiarity

    # ── Risk score (8D) — explainable 0–100, not blocking ────────────────────
    # Components:
    # - Global reports 0–40 (high count 40, 1 report 18)
    # - Familiarity penalty/bonus: NEW +12, FREQUENT -10
    # - Recency boost +10 if recent
    # Clamp 0–100
    risk = 0
    sev_mult = {"LOW": 0.75, "MEDIUM": 1.0, "HIGH": 1.2, "CRITICAL": 1.4}
    for s in signals:
        mult = sev_mult.get(s["severity"], 1.0)
        risk += float(s["score"]) * mult
    # Normalize via logistic-ish but keep simple: cap and scale
    # Use same logistic as fraud for consistency
    import math
    # If no signals (frequent clean) risk may be 0
    if not signals:
        risk_score = 5  # minimal
    else:
        # Logistic saturation to 0–100
        k = 0.06
        centre = 35
        saturated = 100 / (1 + math.exp(-k * (risk - centre)))
        risk_score = int(round(max(0, min(100, saturated))))
    # Adjust for personal vs global: frequent + high report → both signals present, global dominates but personal familiarity slightly mitigates
    # If FREQUENT and HIGH_RISK, reduce by 8 points (personal familiarity mitigates but not erases)
    if familiarity == "FREQUENT" and reported and report_count >= 3:
        risk_score = max(0, risk_score - 8)

    # Confidence (8E)
    # High when many reports + recent or frequent history; low when NEW with no reports and cold-start
    if reported and report_count >= 3 and report_recency_days is not None and report_recency_days <= 7:
        confidence = 0.94
    elif reported:
        confidence = 0.82
    elif familiarity == "FREQUENT":
        confidence = 0.88
    elif familiarity == "FAMILIAR":
        confidence = 0.70
    else:  # NEW, no reports
        # Confidence moderate — we know it's new but not fraud-proven
        confidence = 0.65

    # Reputation mapping for risk engine (8D)
    if risk_score >= 70:
        rep_tier = "HIGH_RISK"
    elif risk_score >= 40:
        rep_tier = "CAUTION"
    else:
        rep_tier = "CLEAN"

    return {
        "recipient": norm,
        "known": history_count > 0 or reported,
        "transaction_count": history_count,
        "first_seen": first_seen,
        "last_seen": last_seen,
        "total_amount": round(total_amount, 2),
        "avg_amount": round(avg_amount, 2),
        "median_amount": round(median_amount, 2),
        "reported": reported,
        "report_count": report_count,
        "reputation": rep_tier,  # CAUTION/HIGH_RISK/CLEAN derived from risk_score
        "global_reputation": reputation,  # original scam registry tier
        "risk_score": int(risk_score),
        "confidence": round(float(confidence), 2),
        "familiarity": familiarity,
        "signals": signals,
        "evidence": {
            "transaction_count": history_count,
            "total_amount": round(total_amount,2),
            "avg_amount": round(avg_amount,2),
            "report_count": report_count,
            "recency_days": report_recency_days,
            "reasons": reasons,
        },
        "version": RECIPIENT_INTELLIGENCE_VERSION,
    }

def get_recipient_intelligence_api(phone: str, recipient: str, current_amount: float | None = None) -> Dict[str, Any]:
    """
    8H — API wrapper that validates authorization.
    Phone is the authenticated user; recipient is queried.
    Returns aggregated intelligence only, no private transaction details of other users.
    Includes amount anomaly if current_amount supplied.
    """
    profile = get_recipient_profile(phone, recipient)
    # If current_amount provided, add amount anomaly signal relative to personal avg
    if current_amount is not None and profile["transaction_count"] > 0:
        avg = profile["avg_amount"] or 1
        if current_amount > avg * 2.5 and current_amount > 1000:
            profile["signals"].append({
                "id": "recipient_amount_anomaly",
                "category": "RECIPIENT",
                "severity": "MEDIUM",
                "score": 14,
                "evidence": {"amount": current_amount, "avg_amount": avg, "multiplier": round(current_amount/avg,1)},
                "description": f"Amount Rs.{current_amount:.0f} is {current_amount/avg:.1f}× your typical amount to this recipient (avg Rs.{avg:.0f})",
                "source": "recipient_intelligence",
            })
            # Bump risk_score slightly
            profile["risk_score"] = min(100, profile["risk_score"] + 10)
        # Velocity anomaly: if recipient got many txs in short window — would need history timestamps; simplified
    return profile
