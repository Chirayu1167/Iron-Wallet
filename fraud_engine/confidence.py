"""
confidence.py  –  Computes how confident the engine is in its fraud_score.

Confidence reflects SIGNAL QUALITY, not score magnitude.
A score of 80 with 4 independent high-severity signals is more trustworthy
than the same score from a single CRITICAL pattern.

Factors that increase confidence
---------------------------------
• More matched patterns  (diversity = robustness)
• Higher severity patterns  (CRITICAL/HIGH are rarer false positives)
• Cross-category corroboration  (TIMING + AMOUNT + RECIPIENT together)
• Behaviour score agreement  (IF also found it anomalous)

Factors that decrease confidence
---------------------------------
• Single-pattern match  (could be a false positive)
• Only LOW severity signals
• Behaviour score disagrees strongly (IF says normal, rules say fraud)
"""
from __future__ import annotations
from typing import List
from .fraud_rules import FraudRule, Severity, PatternCategory

_SEVERITY_CONF = {
    Severity.CRITICAL: 25,
    Severity.HIGH:     18,
    Severity.MEDIUM:   10,
    Severity.LOW:       4,
}

def compute_confidence(
    matched_rules: List[FraudRule],
    behavior_score: float,
    fraud_score: int,
) -> int:
    """
    Returns confidence in [0, 100].
    """
    if not matched_rules:
        return max(10, int(behavior_score * 0.3))

    # 1. Severity-weighted pattern quality score
    pattern_quality = sum(_SEVERITY_CONF.get(r.severity, 0) for r in matched_rules)
    pattern_quality = min(pattern_quality, 60)   # cap contribution

    # 2. Category diversity bonus (up to 20 pts)
    categories_hit = len({r.category for r in matched_rules})
    diversity_bonus = min(categories_hit * 5, 20)

    # 3. Behaviour score agreement bonus (up to 15 pts)
    #    Max bonus when both behaviour_score and fraud_score are high
    agreement = min(behavior_score, fraud_score) / 100
    agreement_bonus = int(agreement * 15)

    # 4. Single-rule penalty (lone signal is less trustworthy)
    single_penalty = -10 if len(matched_rules) == 1 else 0

    raw_confidence = 10 + pattern_quality + diversity_bonus + agreement_bonus + single_penalty
    return max(5, min(99, int(raw_confidence)))
