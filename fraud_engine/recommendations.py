"""
recommendations.py  –  Maps fraud_score + pattern context → recommended action.

IMPORTANT:  IronWallet NEVER blocks payments.
The engine only RECOMMENDS — the final decision belongs to the user.

Actions (in order of escalating urgency)
-----------------------------------------
ALLOW               – proceed normally; no friction added
MONITOR             – log with elevated priority; no user-facing friction
NOTIFY_USER         – show clear in-app warning; require explicit confirmation
ESCALATE_FOR_REVIEW – require OTP + strong in-app warning + analyst queue entry
"""
from __future__ import annotations
from typing import List
from .fraud_rules import FraudRule, Severity, PatternCategory

_CRITICAL_CATEGORIES = {PatternCategory.DEVICE, PatternCategory.LOCATION, PatternCategory.VELOCITY}

def recommend_action(
    fraud_score: int,
    matched_rules: List[FraudRule],
    behavior_score: float,
    confidence: int,
) -> dict:
    """
    Returns a recommendation dict:
    {
        "action":       "NOTIFY_USER",
        "label":        "Fraud Risk Detected",
        "description":  "...",
        "requires_otp": True,
        "alert_level":  "HIGH",
    }
    """
    has_critical_rule  = any(r.severity == Severity.CRITICAL   for r in matched_rules)
    has_high_rule      = any(r.severity == Severity.HIGH        for r in matched_rules)
    has_critical_cat   = any(r.category in _CRITICAL_CATEGORIES for r in matched_rules)
    multi_category     = len({r.category for r in matched_rules}) >= 3

    # ── ESCALATE ──────────────────────────────────────────────────────────────
    if fraud_score >= 81 or has_critical_rule or (fraud_score >= 65 and multi_category):
        return {
            "action":      "ESCALATE_FOR_REVIEW",
            "label":       "🚨 High Fraud Risk — Review Required",
            "description": (
                "Multiple fraud patterns detected. We strongly recommend verifying "
                "this payment before proceeding. An OTP has been triggered."
            ),
            "requires_otp": True,
            "alert_level":  "CRITICAL" if fraud_score >= 81 else "HIGH",
        }

    # ── NOTIFY ────────────────────────────────────────────────────────────────
    if fraud_score >= 61 or has_high_rule or has_critical_cat:
        return {
            "action":      "NOTIFY_USER",
            "label":       "⚠️ Suspicious Payment Detected",
            "description": (
                "This payment has characteristics matching known fraud patterns. "
                "Please review all details carefully before confirming."
            ),
            "requires_otp": fraud_score >= 70,
            "alert_level":  "HIGH",
        }

    # ── MONITOR ───────────────────────────────────────────────────────────────
    if fraud_score >= 31:
        return {
            "action":      "MONITOR",
            "label":       "🟡 Mild Risk Signals Detected",
            "description": "Some unusual signals detected. Logged for monitoring.",
            "requires_otp": False,
            "alert_level":  "MEDIUM",
        }

    # ── ALLOW ─────────────────────────────────────────────────────────────────
    return {
        "action":      "ALLOW",
        "label":       "✅ Payment Looks Normal",
        "description": "No significant fraud patterns detected.",
        "requires_otp": False,
        "alert_level":  "LOW",
    }
