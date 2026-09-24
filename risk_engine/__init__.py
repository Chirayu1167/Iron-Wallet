"""
IRON Wallet — Unified Risk Engine (Phase 6)
One authoritative backend service that combines behavioural, fraud, recipient and context signals.
"""
from .engine import RiskEngine, get_risk_engine
from .thresholds import RISK_WEIGHTS, iron_tier, RISK_TIRESHOLDS
from .explanation import build_explanation, build_breakdown
from .attack import classify_attack, ATTACK_CLASSIFIER_VERSION, ATTACK_LABELS, ATTACK_CATEGORIES
from .account_takeover import detect_account_takeover, ACCOUNT_TAKEOVER_VERSION, DIMENSIONS
from .scam_network import detect_scam_network, SCAM_NETWORK_VERSION, NETWORK_TYPES
__all__ = ["RiskEngine", "get_risk_engine", "RISK_WEIGHTS", "iron_tier", "RISK_TIRESHOLDS", "build_explanation", "build_breakdown", "classify_attack", "ATTACK_CLASSIFIER_VERSION", "ATTACK_LABELS", "ATTACK_CATEGORIES", "detect_account_takeover", "ACCOUNT_TAKEOVER_VERSION", "DIMENSIONS", "detect_scam_network", "SCAM_NETWORK_VERSION", "NETWORK_TYPES"]
