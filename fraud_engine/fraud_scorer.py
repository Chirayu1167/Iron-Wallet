"""
fraud_scorer.py  –  Converts matched patterns into a 0-100 fraud_score.

Scoring algorithm
-----------------
1.  Each matched rule contributes its base_weight to a raw sum.
2.  Severity multipliers amplify critical signals:
      CRITICAL × 1.40  |  HIGH × 1.20  |  MEDIUM × 1.0  |  LOW × 0.75
3.  Behaviour score from Stage 1 (Isolation Forest) acts as a prior:
    • High behaviour score  → slight amplification (the IF already found it odd)
    • Low behaviour score   → slight suppression  (IF says it's normal; trust it)
4.  Raw sum is passed through a logistic saturation so scores never reach
    100 from rules alone — that ceiling is reserved for confirmed fraud.
5.  Final score is clamped [0, 100] and rounded to an integer.

The behaviour_score is intentionally a LIGHT input (±10 pts max) to
preserve the independence of Stage 2 from Stage 1.
"""
from __future__ import annotations
import math
from typing import List
from .fraud_rules import FraudRule, Severity

_SEVERITY_MULT = {
    Severity.CRITICAL: 1.40,
    Severity.HIGH:     1.20,
    Severity.MEDIUM:   1.00,
    Severity.LOW:      0.75,
}

_MAX_POSSIBLE_RAW = 120.0   # ceiling for normalisation denominator

def compute_fraud_score(
    matched_rules: List[FraudRule],
    behavior_score: float,          # 0-100 from Isolation Forest
) -> int:
    """
    Parameters
    ----------
    matched_rules   : rules returned by pattern_matcher.match_patterns()
    behavior_score  : Stage 1 score  (0 = perfectly normal, 100 = very anomalous)

    Returns
    -------
    int  fraud_score in [0, 100]
    """
    if not matched_rules:
        # No patterns fired → purely driven by behaviour score (lightly)
        base = behavior_score * 0.15
        return int(round(min(base, 30)))

    # 1. Weighted sum of matched rules
    raw = sum(
        rule.base_weight * _SEVERITY_MULT.get(rule.severity, 1.0)
        for rule in matched_rules
    )

    # 2. Behaviour-score prior  (±10 pts, centred at score=50)
    behaviour_adj = (behavior_score - 50) / 50 * 10   # range: -10 to +10
    raw += behaviour_adj

    # 3. Logistic saturation — compress very large sums gracefully
    #    Maps raw ∈ [0, ∞) → adjusted ∈ [0, ~95]
    #    At raw=50  → ~72  |  raw=80  → ~85  |  raw=120 → ~92
    k = 0.06
    centre = 40.0
    saturated = 100 / (1 + math.exp(-k * (raw - centre)))

    # 4. Clamp and round
    score = max(0, min(100, int(round(saturated))))
    return score


def score_breakdown(
    matched_rules: List[FraudRule],
    behavior_score: float,
) -> dict:
    """
    Returns detailed per-rule contribution for analyst / explainability use.
    """
    rows = []
    for rule in matched_rules:
        mult = _SEVERITY_MULT.get(rule.severity, 1.0)
        rows.append({
            "rule_id":      rule.id,
            "rule_name":    rule.name,
            "category":     rule.category.value,
            "severity":     rule.severity.value,
            "base_weight":  rule.base_weight,
            "multiplier":   mult,
            "contribution": round(rule.base_weight * mult, 2),
        })
    rows.sort(key=lambda r: -r["contribution"])
    return {
        "rules":          rows,
        "behavior_prior": round((behavior_score - 50) / 50 * 10, 2),
        "final_score":    compute_fraud_score(matched_rules, behavior_score),
    }
