"""
Binary fraud classifier — separate from tier severity.
LEGITIMATE vs FRAUDULENT based on independent fraud evidence, not just tier.
"""
from typing import Dict, Any

def is_fraudulent(behavior: Dict[str, Any], fraud: Dict[str, Any], recipient: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """
    Returns True if FRAUDULENT, False if LEGITIMATE.
    Uses evidence-aware independent signals, not tier.
    - Strong fraud indicator alone → FRAUDULENT
    - Multiple weak → FRAUDULENT
    - Single weak → LEGITIMATE
    """
    # Check for strong fraud signals
    # Fraud score >=35 is moderate
    fraud_score = fraud.get("fraud_score", fraud.get("score", 0))
    if isinstance(fraud_score, (int,float)) and fraud_score >= 45:
        return True
    # Recipient reported
    if recipient.get("report_count", 0) >= 1 or recipient.get("reported"):
        # But need to check if at least 1 report and not just 1 with small amount? For binary, any reported should be FRAUDULENT
        # Check if recipient has any report
        if recipient.get("report_count",0) >=1:
            return True
        if recipient.get("reputation") in ("HIGH_RISK","FLAGGED"):
            return True
    # Check for any HIGH/CRITICAL signal in fraud or recipient
    for sig in fraud.get("signals", []):
        if sig.get("severity") in ("HIGH","CRITICAL") and sig.get("score",0) >= 15:
            return True
    for sig in recipient.get("signals", []):
        if sig.get("severity") in ("HIGH","CRITICAL"):
            return True
    # Amount anomaly with new recipient
    # Check behavior signals
    for sig in behavior.get("signals", []):
        if sig.get("feature") == "amount_deviation" and sig.get("severity")=="high":
            # Check if also new recipient
            for r in recipient.get("signals", []):
                if "recipient_new" in r.get("id",""):
                    return True
    # Scam language + new recipient
    for sig in fraud.get("signals", []):
        if sig.get("id") in ("urgency_language","otp_request_language","impersonation_language") and sig.get("severity") in ("HIGH","CRITICAL"):
            # If also new recipient, then fraud
            for r in recipient.get("signals", []):
                if "recipient_new" in r.get("id",""):
                    return True
    # Velocity burst
    for sig in fraud.get("signals", []):
        if sig.get("id") in ("HIGH_VELOCITY_5M","rapid_velocity_5m","high_velocity_1h"):
            return True
    # Multiple weak signals (>=2 medium)
    medium_count = 0
    for sig in fraud.get("signals", []) + recipient.get("signals", []) + behavior.get("signals", []):
        if sig.get("severity") in ("MEDIUM","HIGH","CRITICAL"):
            medium_count += 1
    if medium_count >= 2:
        return True
    # Context unfamiliar + amount
    if context.get("score",0) >= 50 and behavior.get("behavior_score",0) >= 70:
        return True
    return False

def classify_binary(behavior, fraud, recipient, context):
    is_fraud = is_fraudulent(behavior, fraud, recipient, context)
    return "FRAUDULENT" if is_fraud else "LEGITIMATE"
