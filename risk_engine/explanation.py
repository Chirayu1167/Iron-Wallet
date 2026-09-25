"""
risk_engine/explanation.py — Explainable Risk (Phase 7)

Human-readable, evidence-backed explanations. No fabrication.
Ranks by contribution/severity/confidence. Provides breakdown and audit.

7A model: summary + reasons [{id,title,description,severity,evidence}]
7B prioritization top 3–5
7C human language
7E breakdown
7F confidence explanation
7G audit/version
"""
from __future__ import annotations
from typing import Dict, Any, List
from .thresholds import EXPLANATION_VERSION, iron_tier
try:
    from .attack import ATTACK_LABELS, ATTACK_CLASSIFIER_VERSION
except ImportError:
    ATTACK_LABELS = {}
    ATTACK_CLASSIFIER_VERSION = "v1"
try:
    from .account_takeover import ACCOUNT_TAKEOVER_VERSION
except ImportError:
    ACCOUNT_TAKEOVER_VERSION = "v1"
try:
    from .scam_network import SCAM_NETWORK_VERSION
except ImportError:
    SCAM_NETWORK_VERSION = "v1"

# Map signal ids to human-friendly titles (7C)
TITLE_MAP: Dict[str, str] = {
    "amount_deviation": "Unusual amount",
    "amount_anomaly": "Unusual amount",
    "recipient_novelty": "New recipient",
    "recipient_new": "New recipient",
    "recipient_rarity": "Rarely contacted recipient",
    "recipient_familiar": "Familiar recipient",
    "recipient_frequent": "Frequent recipient",
    "recipient_reported": "Recipient has fraud reports",
    "recipient_high_report_count": "Recipient has multiple fraud reports",
    "recently_reported_recipient": "Recently reported recipient",
    "recipient_recently_reported": "Recently reported recipient",
    "recipient_old_report": "Previously reported recipient",
    "recipient_amount_anomaly": "Unusual amount for this recipient",
    "user_amount_above_average": "Above your usual payment pattern",
    "urgency_language": "Urgency in message",
    "otp_request_language": "OTP request detected",
    "impersonation_language": "Impersonation language",
    "account_suspension_threat": "Account threat language",
    "reward_prize_scam": "Prize/reward lure",
    "investment_scam": "Investment promise",
    "loan_scam": "Loan offer",
    "remote_access_request": "Remote access request",
    "suspicious_upi_handle": "Suspicious UPI handle",
    "impersonation_upi": "UPI impersonation",
    "rapid_velocity_5m": "Rapid transactions (5 min)",
    "high_velocity_1h": "High transaction volume (1 hour)",
    "recipient_switching": "Multiple recipients quickly",
    "amount_escalation_burst": "Escalating amounts",
    "HIGH_VELOCITY_5M": "Rapid transactions (5 min)",
    "HIGH_VELOCITY_1H": "High volume (1 hour)",
    "RECIPIENT_SWITCHING": "Multiple recipients quickly",
    "NEW_DEVICE": "New device",
    "unfamiliar_device": "Unfamiliar device",
    "LOCATION_ANOMALY": "Unusual location",
    "unfamiliar_location": "Unusual location",
    "sudden_behaviour_change": "Sudden behaviour change",
    "unusual_amount_spike": "Amount spike",
    "unusual_transaction_timing": "Unusual time",
    "velocity_1h": "High velocity",
    "velocity_24h": "High daily velocity",
    "balance_impact": "Large portion of balance",
    "BALANCE_DRAIN_CRITICAL": "Large balance drain",
    "BALANCE_DRAIN_HIGH": "Significant balance use",
    "EXTREME_AMOUNT": "Very large amount",
    "HIGH_AMOUNT": "Large amount",
    "SEQUENTIAL_AMOUNTS": "Sequential amounts",
    "DAILY_LIMIT_APPROACH": "Approaching daily limit",
    "ODD_HOUR": "Late night transaction",
    "ROUND_AMOUNT_LARGE": "Large round amount",
}

def _human_title(sig_id: str) -> str:
    return TITLE_MAP.get(sig_id, sig_id.replace("_"," ").title())

def _severity_priority(sev: str) -> int:
    return {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}.get(str(sev).upper(), 2)

def build_explanation(
    final_score: int,
    tier: str,
    signals: List[Dict[str, Any]],
    components: Dict[str, int] | None = None,
    confidence: float = 0.5,
    behavior_meta: Dict[str, Any] | None = None,
    attack: Dict[str, Any] | None = None,
    account_takeover: Dict[str, Any] | None = None,
    scam_network: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """
    7A–7B: Build structured explanation. Every reason backed by actual signal.
    Phase 16: includes detected attack + supporting evidence (advisory only).
    Phase 17: includes account-takeover combination + explanation (advisory only).
    Phase 18: includes scam-network/campaign + evidence (advisory only).

    Returns:
      {
        "summary": "High risk transaction.",
        "reasons": [ {id,title,description,severity,evidence,contribution,source}, ... top 3–5 ],
        "confidence_explanation": "...",
        "breakdown": {...},
        "tier_message": {"SAFE":...},
        "attack": {"attack_type","attack_category","attack_confidence","signal_ids","description"},
        "attack_type","attack_category","attack_confidence" (top-level convenience),
        "account_takeover": {"account_threat_detected","account_threat_confidence","signal_ids","explanation"},
        "account_threat_detected","account_threat_confidence","account_threat_signal_ids" (top-level convenience),
        "scam_network": {"network_threat_detected","network_confidence","network_type","signal_ids","explanation"},
        "network_threat_detected","network_confidence","network_type","network_signal_ids" (top-level convenience),
      }
    """
    tier = tier.upper()
    if tier == "SAFE":
        summary = "Looks normal."
    elif tier == "CAUTION":
        summary = "Review this payment before proceeding."
    else:
        summary = "This payment has multiple risk signals. Verify before proceeding."

    # Prioritize signals: contribution desc, severity, evidence confidence
    sorted_sigs = sorted(
        signals,
        key=lambda s: (-float(s.get("contribution", s.get("score",0))), -_severity_priority(s.get("severity","MEDIUM")), s.get("id","")),
    )
    # Take top 5 meaningful (contribution>0 or severity>=MEDIUM)
    top: List[Dict[str, Any]] = []
    for s in sorted_sigs:
        if len(top) >= 5:
            break
        # Only include if actually backed by evidence (always true for our signals)
        # Skip very low contribution (<1) unless high severity
        if float(s.get("contribution",0)) < 1 and _severity_priority(s.get("severity","MEDIUM")) < 3 and len(top) >= 3:
            continue
        top.append(s)

    reasons: List[Dict[str, Any]] = []
    for s in top:
        sig_id = s.get("id","unknown")
        reasons.append({
            "id": sig_id,
            "title": _human_title(sig_id),
            "description": s.get("description", ""),
            "severity": str(s.get("severity","MEDIUM")).upper(),
            "evidence": s.get("evidence", {}),
            "contribution": s.get("contribution", s.get("score",0)),
            "category": s.get("category",""),
            "source": s.get("source",""),
        })

    # 7F Confidence explanation
    if behavior_meta and behavior_meta.get("cold_start"):
        confidence_explanation = "This assessment has lower confidence because there is limited transaction history."
    elif confidence < 0.6:
        confidence_explanation = "Confidence is moderate — limited evidence or conflicting signals."
    elif len(signals) >= 3 and confidence >= 0.8:
        confidence_explanation = "Multiple independent signals support this assessment."
    elif confidence >= 0.75:
        confidence_explanation = "High confidence — strong evidence from multiple sources."
    else:
        confidence_explanation = "Confidence reflects the quality of available evidence."

    # 7E Breakdown
    breakdown = {
        "behavior": components.get("behavior") if components else None,
        "fraud_intelligence": components.get("fraud_intelligence") if components else None,
        "recipient": components.get("recipient") if components else None,
        "context": components.get("context") if components else None,
        "final": final_score,
    }

    # Tier message for frontend (7H)
    tier_messages = {
        "SAFE": "Looks normal.",
        "CAUTION": "Review this payment before proceeding.",
        "HIGH_RISK": "This payment has multiple risk signals. Verify before proceeding. You can still proceed.",
    }

    # Phase 16 — attack intelligence (advisory, evidence-backed, backward-compatible).
    # `attack` is produced by RiskEngine.classify_attack over the same signals.
    # Every signal_id in attack["signal_ids"] is a subset of signals passed here.
    atk = attack or {}
    attack_type = str(atk.get("attack_type", "NONE") or "NONE").upper()
    attack_category = str(atk.get("attack_category", "NONE") or "NONE").upper()
    try:
        attack_confidence = round(max(0.0, min(1.0, float(atk.get("attack_confidence", 0.0)))), 2)
    except Exception:
        attack_confidence = 0.0
    attack_signal_ids = list(atk.get("signal_ids", []) or [])
    attack_description = str(atk.get("description", "") or "")
    attack_label = ATTACK_LABELS.get(attack_type, attack_type.replace("_", " ").title())
    attack_block = {
        "attack_type": attack_type,
        "attack_category": attack_category,
        "attack_confidence": attack_confidence,
        "signal_ids": attack_signal_ids,
        "description": attack_description,
        "label": attack_label,
        "version": atk.get("version", ATTACK_CLASSIFIER_VERSION),
    }

    # Phase 17 — account-takeover intelligence (advisory, combination-based,
    # backward-compatible). `account_takeover` is produced by
    # RiskEngine.detect_account_takeover over the same signals.
    ato = account_takeover or {}
    account_threat_detected = bool(ato.get("account_threat_detected", False))
    try:
        account_threat_confidence = round(max(0.0, min(1.0, float(ato.get("account_threat_confidence", 0.0)))), 2)
    except Exception:
        account_threat_confidence = 0.0
    account_threat_signal_ids = list(ato.get("signal_ids", ato.get("account_threat_signal_ids", [])) or [])
    account_takeover_block = {
        "account_threat_detected": account_threat_detected,
        "account_threat_confidence": account_threat_confidence,
        "signal_ids": account_threat_signal_ids,
        "explanation": str(ato.get("explanation", "") or ""),
        "dimensions": dict(ato.get("dimensions", {}) or {}),
        "dimension_count": int(ato.get("dimension_count", 0) or 0),
        "version": ato.get("version", ACCOUNT_TAKEOVER_VERSION),
    }

    # Phase 18 — scam-network intelligence (advisory, existing-data only,
    # backward-compatible). `scam_network` is produced by
    # RiskEngine.detect_scam_network over signals + recipient/attack context.
    net = scam_network or {}
    network_threat_detected = bool(net.get("network_threat_detected", False))
    try:
        network_confidence = round(max(0.0, min(1.0, float(net.get("network_confidence", 0.0)))), 2)
    except Exception:
        network_confidence = 0.0
    network_type = str(net.get("network_type", "NONE") or "NONE").upper()
    network_signal_ids = list(net.get("signal_ids", net.get("network_signal_ids", [])) or [])
    scam_network_block = {
        "network_threat_detected": network_threat_detected,
        "network_confidence": network_confidence,
        "network_type": network_type,
        "signal_ids": network_signal_ids,
        "explanation": str(net.get("explanation", "") or ""),
        "evidence": dict(net.get("evidence", {}) or {}),
        "description": str(net.get("description", "") or ""),
        "version": net.get("version", SCAM_NETWORK_VERSION),
    }

    return {
        "summary": summary,
        "reasons": reasons,
        "confidence_explanation": confidence_explanation,
        "breakdown": breakdown,
        "tier_message": tier_messages.get(tier, summary),
        "version": EXPLANATION_VERSION,
        "total_signals": len(signals),
        "attack": attack_block,
        "attack_type": attack_type,
        "attack_category": attack_category,
        "attack_confidence": attack_confidence,
        "account_takeover": account_takeover_block,
        "account_threat_detected": account_threat_detected,
        "account_threat_confidence": account_threat_confidence,
        "account_threat_signal_ids": account_threat_signal_ids,
        "scam_network": scam_network_block,
        "network_threat_detected": network_threat_detected,
        "network_confidence": network_confidence,
        "network_type": network_type,
        "network_signal_ids": network_signal_ids,
    }

def build_breakdown(components: Dict[str, int]) -> Dict[str, int]:
    """7E — internal/user-safe breakdown."""
    return {
        "behavior": int(components.get("behavior",0)),
        "fraud_intelligence": int(components.get("fraud_intelligence",0)),
        "recipient": int(components.get("recipient",0)),
        "context": int(components.get("context",0)),
        "final": int(components.get("final",0)),
    }
