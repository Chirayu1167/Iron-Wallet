"""
risk_engine/thresholds.py — Centralized IRON risk thresholds and weights (Phase 6C/6F)

Single source of truth — do not duplicate thresholds elsewhere.
"""
from typing import Dict, Tuple

# ── IRON Tiers — 0–69 SAFE, 70–84 CAUTION, 85–100 HIGH_RISK. No BLOCK. ──────
RISK_TIRESHOLDS: Dict[str, Tuple[int, int]] = {
    "SAFE": (0, 69),
    "CAUTION": (70, 84),
    "HIGH_RISK": (85, 100),
}

def iron_tier(score: int | float) -> str:
    """
    Centralized tier mapping. Clamps score 0–100 first.
    Use everywhere — never create different thresholds in different files.
    """
    s = int(round(max(0, min(100, float(score)))))
    if s >= 85:
        return "HIGH_RISK"
    if s >= 70:
        return "CAUTION"
    return "SAFE"

def risk_level(score: int | float) -> str:
    """Legacy LOW/MEDIUM/HIGH/CRITICAL mapping (for detail, not tier)."""
    s = int(round(max(0, min(100, float(score)))))
    if s <= 30:
        return "LOW"
    if s <= 60:
        return "MEDIUM"
    if s <= 80:
        return "HIGH"
    return "CRITICAL"

# ── Combination Weights — must sum to 1.0 ────────────────────────────────────
# Inspected Phase 4/5 outputs: behaviour and fraud are primary, recipient significant,
# context modest. Baseline matches spec suggestion; justified because:
# - behaviour (35%): personalized IF with history, moderate confidence when cold-start
# - fraud (40%): strongest deterministic evidence (velocity, keyword, device) — highest weight
# - recipient (15%): scam registry + personal familiarity — secondary but important
# - context (10%): device/location/velocity déjà vu in other components, so lower to avoid double-count
RISK_WEIGHTS: Dict[str, float] = {
    "behavior": 0.35,
    "fraud": 0.40,
    "recipient": 0.15,
    "context": 0.10,
}
assert abs(sum(RISK_WEIGHTS.values()) - 1.0) < 1e-9, "RISK_WEIGHTS must sum to 1.0"

# ── Versioning ────────────────────────────────────────────────────────────────
RISK_ENGINE_VERSION = "v1"
EXPLANATION_VERSION = "v1"
RECIPIENT_INTELLIGENCE_VERSION = "v1"
