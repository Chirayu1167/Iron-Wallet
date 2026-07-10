"""
engine.py  –  Fraud Intelligence Layer orchestrator.

This is the ONLY file the FastAPI endpoint imports.
It owns the full Stage 2 pipeline:

  Input  → signal extraction → pattern matching → scoring
         → confidence → recommendation → structured output

Input schema (from FastAPI endpoint)
--------------------------------------
{
  "behavior_score": 84,           # 0-100 from Isolation Forest (Stage 1)
  "transaction": {
    "amount":                   4500.0,
    "hour_of_day":              3,
    "day_of_week":              "Monday",
    "is_weekend":               0,
    "merchant_name":            "Unknown Shop",
    "merchant_category":        "E-Commerce",
    "recipient_type":           "merchant",      # or "individual"
    "payment_method":           "Net Banking",
    "device_familiarity":       0.1,
    "location_familiarity":     0.2,
    "balance_before":           5200.0,
    "recipient_frequency_score":0.0,
    "days_since_recipient_seen":999,
    "merchant_frequency_score": 0.05,
    "recipient_report_count":   0,               # from RecipientRiskRegistry
    "is_off_network":           false,
    "urgency_score":            0.0,
    "note":                     "",
    "txn_velocity_1h":          1,
    "txn_velocity_5m":          1,
    "unique_recipients_30m":    1,
    "recent_amounts":           [],
    "daily_spend_today":        0.0,
  },
  "user_profile": {
    "user_id":          "U001",
    "avg_amount":       850.0,
    "daily_avg_spend":  2500.0,
  }
}

Output schema
-------------
{
  "fraud_score":       78,
  "matched_patterns":  ["NEW_RECIPIENT", "HIGH_AMOUNT", "ODD_HOUR"],
  "pattern_details": [
    { "id": "ODD_HOUR", "name": "Odd Hour", "severity": "HIGH",
      "category": "TIMING", "user_message": "Transaction at an unusual hour (1-5 AM)." }
  ],
  "confidence":        87,
  "recommended_action":"NOTIFY_USER",
  "action_label":      "⚠️ Suspicious Payment Detected",
  "action_description":"...",
  "requires_otp":      false,
  "alert_level":       "HIGH",
  "score_breakdown":   { ... },
  "risk_level":        "HIGH",
}
"""
from __future__ import annotations
from typing import Any, Dict, List

from .fraud_rules   import RULES_BY_ID, Severity
from .pattern_matcher import match_patterns
from .fraud_scorer  import compute_fraud_score, score_breakdown
from .confidence    import compute_confidence
from .recommendations import recommend_action


# ── Risk-level bands (mirror frontend RISK_THRESHOLDS) ───────────────────────
def _risk_level(score: int) -> str:
    if score <= 30:  return "LOW"
    if score <= 60:  return "MEDIUM"
    if score <= 80:  return "HIGH"
    return "CRITICAL"


# ═══════════════════════════════════════════════════════════════════════════════
#  SIGNAL BUILDER
#  Normalises the raw request payload into a flat signal dict that all
#  pattern matchers and scorers can read without knowing the input schema.
# ═══════════════════════════════════════════════════════════════════════════════

def _build_signals(
    txn: Dict[str, Any],
    user_profile: Dict[str, Any],
) -> Dict[str, Any]:
    amount       = float(txn.get("amount", 0))
    bal_before   = float(txn.get("balance_before", 1)) or 1
    daily_avg    = float(user_profile.get("daily_avg_spend", 2000)) or 1
    daily_today  = float(txn.get("daily_spend_today", 0))

    return {
        # Amount
        "amount":                    amount,
        "user_avg_amount":           float(user_profile.get("avg_amount", 1000)) or 1,
        # Balance
        "balance_drain_pct":         min(amount / bal_before, 1.0),
        # Recipient
        "is_p2p":                    txn.get("recipient_type") == "individual",
        "recipient_frequency_score": float(txn.get("recipient_frequency_score", 1.0)),
        "days_since_recipient_seen": int(txn.get("days_since_recipient_seen", 0)),
        "recipient_report_count":    int(txn.get("recipient_report_count", 0)),
        "is_off_network":            bool(txn.get("is_off_network", False)),
        # Timing
        "hour_of_day":               int(txn.get("hour_of_day", 12)),
        # Velocity
        "txn_velocity_1h":           int(txn.get("txn_velocity_1h", 1)),
        "txn_velocity_5m":           int(txn.get("txn_velocity_5m", 1)),
        "unique_recipients_30m":     int(txn.get("unique_recipients_30m", 1)),
        # Device / location
        "device_familiarity":        float(txn.get("device_familiarity", 1.0)),
        "location_familiarity":      float(txn.get("location_familiarity", 1.0)),
        # Behavioural
        "recent_amounts":            list(txn.get("recent_amounts", [])),
        "urgency_score":             float(txn.get("urgency_score", 0.0)),
        "daily_spend_ratio":         min((daily_today + amount) / daily_avg, 1.0),
        # Merchant
        "merchant_frequency_score":  float(txn.get("merchant_frequency_score", 0.5)),
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

def run_fraud_intelligence(
    behavior_score: float,
    transaction:    Dict[str, Any],
    user_profile:   Dict[str, Any],
) -> Dict[str, Any]:
    """
    Full Stage 2 pipeline.

    Parameters
    ----------
    behavior_score  : float  0-100 from Isolation Forest
    transaction     : dict   raw transaction fields
    user_profile    : dict   user baseline (avg_amount, daily_avg_spend, user_id)

    Returns
    -------
    Structured fraud intelligence result dict.
    """
    # 1. Normalise signals
    signals = _build_signals(transaction, user_profile)

    # 2. Match patterns
    matched_rules = match_patterns(signals)
    matched_ids   = [r.id for r in matched_rules]

    # 3. Score
    fraud_score = compute_fraud_score(matched_rules, behavior_score)

    # 4. Confidence
    confidence  = compute_confidence(matched_rules, behavior_score, fraud_score)

    # 5. Recommendation
    rec = recommend_action(fraud_score, matched_rules, behavior_score, confidence)

    # 6. Score breakdown (for analyst / UI detail view)
    breakdown = score_breakdown(matched_rules, behavior_score)

    # 7. Pattern details for frontend rendering
    pattern_details = [
        {
            "id":           r.id,
            "name":         r.name,
            "severity":     r.severity.value,
            "category":     r.category.value,
            "user_message": r.user_message,
            "weight":       r.base_weight,
        }
        for r in matched_rules
    ]

    return {
        "fraud_score":        fraud_score,
        "matched_patterns":   matched_ids,
        "pattern_details":    pattern_details,
        "confidence":         confidence,
        "recommended_action": rec["action"],
        "action_label":       rec["label"],
        "action_description": rec["description"],
        "requires_otp":       rec["requires_otp"],
        "alert_level":        rec["alert_level"],
        "risk_level":         _risk_level(fraud_score),
        "score_breakdown":    breakdown,
        "signal_summary": {
            "patterns_fired":     len(matched_rules),
            "critical_count":     sum(1 for r in matched_rules if r.severity == Severity.CRITICAL),
            "high_count":         sum(1 for r in matched_rules if r.severity == Severity.HIGH),
            "categories_hit":     list({r.category.value for r in matched_rules}),
            "behavior_score":     behavior_score,
        },
    }
