"""
risk_engine/attack.py — Attack Intelligence (Phase 16)

Classification layer that maps EXISTING fraud signals to clear attack types.
Reuses signals; does not duplicate detection logic. No blocking.

Attack types (8):
  FAKE_KYC_SUSPENSION  — Fake KYC / Account Suspension
  IMPERSONATION        — Impersonation (authority / brand / UPI)
  FAKE_REFUND_REWARD   — Fake Refund / Reward / Prize
  INVESTMENT_LOAN_SCAM — Investment / Loan Scam
  REMOTE_ACCESS        — Remote Access / screen-share / APK
  OTP_HARVESTING       — OTP Harvesting / credential phishing
  PAYMENT_ANOMALY      — Amount / velocity / balance / timing anomaly
  ACCOUNT_THREAT       — Account-related threats (device / location / recipient trust)
  NONE                 — No attack pattern detected

Categories:
  SOCIAL_ENGINEERING — first six types
  PAYMENT_ANOMALY    — payment anomaly
  ACCOUNT_COMPROMISE — account-related threats
  NONE               — benign

RiskEngine remains the single source of truth: it calls classify_attack()
on its deduped signals. otp_server only passes the result through.
IRON NEVER BLOCKS A PAYMENT — classification is advisory only.
"""
from __future__ import annotations
from typing import Dict, Any, List, Tuple

ATTACK_CLASSIFIER_VERSION = "v1"

# ── Human labels ─────────────────────────────────────────────────────────────
ATTACK_LABELS: Dict[str, str] = {
    "FAKE_KYC_SUSPENSION": "Fake KYC / Account Suspension",
    "IMPERSONATION": "Impersonation",
    "FAKE_REFUND_REWARD": "Fake Refund / Reward",
    "INVESTMENT_LOAN_SCAM": "Investment / Loan Scam",
    "REMOTE_ACCESS": "Remote Access",
    "OTP_HARVESTING": "OTP Harvesting",
    "PAYMENT_ANOMALY": "Payment Anomaly",
    "ACCOUNT_THREAT": "Account-related threats",
    "NONE": "No attack detected",
}

ATTACK_DESCRIPTIONS: Dict[str, str] = {
    "FAKE_KYC_SUSPENSION": "Message threatens account blocking/suspension or demands KYC verification.",
    "IMPERSONATION": "Message or UPI ID impersonates a bank, authority, brand or support desk.",
    "FAKE_REFUND_REWARD": "Prize, lottery, cashback, refund or reward lure.",
    "INVESTMENT_LOAN_SCAM": "Fake investment return promise or instant-loan offer.",
    "REMOTE_ACCESS": "Requests remote access, screen sharing or malicious app download.",
    "OTP_HARVESTING": "Requests OTP, PIN, CVV or other credentials.",
    "PAYMENT_ANOMALY": "Unusual amount, velocity, balance impact or timing for this account.",
    "ACCOUNT_THREAT": "Unfamiliar device/location or untrusted/flagged recipient.",
    "NONE": "No known attack pattern in the current signals.",
}

ATTACK_CATEGORIES: Dict[str, str] = {
    "FAKE_KYC_SUSPENSION": "SOCIAL_ENGINEERING",
    "IMPERSONATION": "SOCIAL_ENGINEERING",
    "FAKE_REFUND_REWARD": "SOCIAL_ENGINEERING",
    "INVESTMENT_LOAN_SCAM": "SOCIAL_ENGINEERING",
    "REMOTE_ACCESS": "SOCIAL_ENGINEERING",
    "OTP_HARVESTING": "SOCIAL_ENGINEERING",
    "PAYMENT_ANOMALY": "PAYMENT_ANOMALY",
    "ACCOUNT_THREAT": "ACCOUNT_COMPROMISE",
    "NONE": "NONE",
}

# Priority for tie-breaks: specific technical/social tactics first, generic last.
# Generic PAYMENT_ANOMALY / ACCOUNT_THREAT must not shadow a specific scam signal.
ATTACK_PRIORITY: List[str] = [
    "REMOTE_ACCESS",
    "OTP_HARVESTING",
    "FAKE_KYC_SUSPENSION",
    "FAKE_REFUND_REWARD",
    "INVESTMENT_LOAN_SCAM",
    "IMPERSONATION",
    "ACCOUNT_THREAT",
    "PAYMENT_ANOMALY",
]

# ── Direct signal-id -> attack mapping (lowercased ids) ──────────────────────
# NOTE: suspicious_upi_handle is disambiguated via evidence.handle (see below).
_DIRECT_MAP: Dict[str, str] = {
    # Fake KYC
    "account_suspension_threat": "FAKE_KYC_SUSPENSION",
    # Impersonation
    "impersonation_language": "IMPERSONATION",
    "impersonation_upi": "IMPERSONATION",
    # Refund / reward
    "reward_prize_scam": "FAKE_REFUND_REWARD",
    # Investment / loan
    "investment_scam": "INVESTMENT_LOAN_SCAM",
    "loan_scam": "INVESTMENT_LOAN_SCAM",
    # Remote access
    "remote_access_request": "REMOTE_ACCESS",
    # OTP
    "otp_request_language": "OTP_HARVESTING",
}

# Payment-anomaly signal ids (amount / velocity / balance / timing / behaviour).
_PAYMENT_IDS = {
    "high_amount", "extreme_amount", "round_amount_large",
    "high_velocity_5m", "high_velocity_1h", "recipient_switching",
    "balance_drain_high", "balance_drain_critical",
    "sequential_amounts", "urgency_language", "daily_limit_approach",
    "odd_hour", "late_night",
    "rapid_velocity_5m", "high_velocity_1h", "recipient_switching",
    "amount_escalation_burst",
    "sudden_behaviour_change", "unusual_amount_spike", "unusual_transaction_timing",
    "velocity_1h", "velocity_24h", "balance_impact",
    "high_value_transaction", "high_velocity_5m_ctx", "high_velocity_1h_ctx",
    "urgency_language", "daily_limit_approach",
    "round_amount_large",
}

# Account-threat signal ids (device / location / recipient trust).
_ACCOUNT_IDS = {
    "unfamiliar_device", "new_device", "unfamiliar_device_ctx",
    "unfamiliar_location", "location_anomaly", "unfamiliar_location_ctx",
    "device_low_familiarity",
    "recipient_reported", "reported_recipient", "high_risk_recipient",
    "recipient_high_report_count", "recipient_high_reports",
    "reported_recipient_high",
    "recipient_recently_reported", "recently_reported_recipient",
    "recipient_new", "new_recipient", "unfamiliar_recipient",
    "rare_recipient", "off_network_recipient",
    "recipient_amount_anomaly",
    "suspicious_upi_handle",  # fallback when handle is neutral (see disambiguation)
}

# Benign signals that must NEVER trigger an attack (personal familiarity).
_BENIGN_IDS = {
    "recipient_familiar", "recipient_frequent", "recipient_old_report",
}

_SEV_MULT = {"LOW": 0.75, "MEDIUM": 1.0, "HIGH": 1.2, "CRITICAL": 1.4}
_SEV_CONF = {"LOW": 0.0, "MEDIUM": 0.05, "HIGH": 0.15, "CRITICAL": 0.25}

_REFUND_HANDLES = {"refund", "claim", "prize", "winner", "lucky", "cashback", "reward", "lottery"}
_KYC_HANDLES = {"kyc", "verify", "verification", "alert", "blocked", "suspend"}


def _map_signal_to_attack(sig: Dict[str, Any]) -> str | None:
    """Map a single existing signal to an attack type. Returns None if benign."""
    raw_id = str(sig.get("id", ""))
    sid = raw_id.lower()
    if sid in _BENIGN_IDS:
        return None
    # Direct social-engineering mapping first (most specific).
    if sid in _DIRECT_MAP:
        return _DIRECT_MAP[sid]
    # Disambiguate suspicious_upi_handle via evidence.handle.
    if sid == "suspicious_upi_handle":
        try:
            ev = sig.get("evidence", {}) or {}
            handle = str(ev.get("handle", "")).lower()
            if handle in _REFUND_HANDLES:
                return "FAKE_REFUND_REWARD"
            if handle in _KYC_HANDLES:
                return "FAKE_KYC_SUSPENSION"
        except Exception:
            pass
        return "IMPERSONATION"
    if sid in _PAYMENT_IDS:
        return "PAYMENT_ANOMALY"
    if sid in _ACCOUNT_IDS:
        return "ACCOUNT_THREAT"
    # Fallback by category for forward-compatible / ML feature signals.
    cat = str(sig.get("category", "")).upper()
    if cat in ("AMOUNT", "VELOCITY", "BALANCE", "TIMING", "BEHAVIOURAL",
               "TRANSACTION_PATTERNS", "ACCOUNT_BEHAVIOUR"):
        # Ignore zero-score benign signals.
        try:
            if float(sig.get("score", 0)) <= 0:
                return None
        except Exception:
            pass
        return "PAYMENT_ANOMALY"
    if cat in ("RECIPIENT", "NETWORK", "DEVICE", "LOCATION"):
        try:
            if float(sig.get("score", 0)) <= 0:
                return None
        except Exception:
            pass
        return "ACCOUNT_THREAT"
    if cat == "SOCIAL_ENGINEERING":
        # Unknown social signal -> generic impersonation bucket is misleading;
        # treat as payment anomaly only if it carries weight, else ignore.
        try:
            if float(sig.get("score", 0)) <= 0:
                return None
        except Exception:
            pass
        return "PAYMENT_ANOMALY"
    return None


def _signal_weight(sig: Dict[str, Any]) -> float:
    try:
        base = float(sig.get("score", 0))
    except Exception:
        base = 0.0
    sev = str(sig.get("severity", "MEDIUM")).upper()
    return base * _SEV_MULT.get(sev, 1.0)


def classify_attack(signals: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Classify attack from EXISTING RiskEngine signals (already deduped).

    Returns:
      {
        "attack_type": "FAKE_REFUND_REWARD" | ... | "NONE",
        "attack_category": "SOCIAL_ENGINEERING" | "PAYMENT_ANOMALY" | "ACCOUNT_COMPROMISE" | "NONE",
        "attack_confidence": 0.0-0.95,
        "signal_ids": [...supporting signal ids...],
        "description": "...",
        "scores": {attack: weighted_score},
        "version": "v1",
      }
    Deterministic, no new detection, advisory only (never blocks).
    """
    signals = signals or []
    per_attack: Dict[str, float] = {}
    per_attack_ids: Dict[str, List[str]] = {}
    per_attack_sigs: Dict[str, List[Dict[str, Any]]] = {}

    for sig in signals:
        if not isinstance(sig, dict):
            continue
        atk = _map_signal_to_attack(sig)
        if not atk:
            continue
        w = _signal_weight(sig)
        if w <= 0:
            continue
        per_attack[atk] = per_attack.get(atk, 0.0) + w
        per_attack_ids.setdefault(atk, []).append(str(sig.get("id", "")))
        per_attack_sigs.setdefault(atk, []).append(sig)

    if not per_attack:
        return {
            "attack_type": "NONE",
            "attack_category": "NONE",
            "attack_confidence": 0.0,
            "signal_ids": [],
            "description": ATTACK_DESCRIPTIONS["NONE"],
            "scores": {},
            "version": ATTACK_CLASSIFIER_VERSION,
        }

    # Winner selection.
    # Specific scam tactics (SOCIAL_ENGINEERING) are more actionable than generic
    # PAYMENT_ANOMALY / ACCOUNT_THREAT buckets, which aggregate many velocity /
    # amount / device signals and would otherwise out-sum a single strong scam
    # signal under history pollution. So: if any specific social attack is
    # present, pick the best among social attacks; else pick best generic.
    _SOCIAL = {"FAKE_KYC_SUSPENSION", "IMPERSONATION", "FAKE_REFUND_REWARD",
               "INVESTMENT_LOAN_SCAM", "REMOTE_ACCESS", "OTP_HARVESTING"}
    _prio = {a: i for i, a in enumerate(ATTACK_PRIORITY)}

    def _best_among(cands: List[str]) -> str:
        best = max(per_attack[k] for k in cands)
        tied = [k for k in cands if abs(per_attack[k] - best) < 1e-9]
        if len(tied) == 1:
            return tied[0]
        tied.sort(key=lambda a: _prio.get(a, 99))
        return tied[0]

    social_present = [k for k in per_attack if k in _SOCIAL]
    if social_present:
        winner = _best_among(social_present)
    else:
        winner = _best_among(list(per_attack.keys()))

    sup = per_attack_sigs.get(winner, [])
    # Confidence: base 0.55 + severity of strongest + 0.05 per extra signal, cap 0.95.
    # Single MEDIUM -> 0.60, HIGH -> 0.70, CRITICAL -> 0.80, multiple -> higher.
    order = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
    max_sev = "LOW"
    for s in sup:
        sev = str(s.get("severity", "MEDIUM")).upper()
        if order.get(sev, 1) > order.get(max_sev, 0):
            max_sev = sev
    conf = 0.55 + _SEV_CONF.get(max_sev, 0.05)
    if len(sup) > 1:
        conf += min(0.15, 0.05 * (len(sup) - 1))
    # Reported-recipient corroboration boosts account-threat confidence.
    if winner == "ACCOUNT_THREAT" and any(
        "report" in str(s.get("id", "")).lower() for s in sup
    ):
        conf += 0.05
    conf = round(max(0.0, min(0.95, conf)), 2)

    return {
        "attack_type": winner,
        "attack_category": ATTACK_CATEGORIES.get(winner, "NONE"),
        "attack_confidence": conf,
        "signal_ids": per_attack_ids.get(winner, []),
        "description": ATTACK_DESCRIPTIONS.get(winner, ""),
        "scores": {k: round(v, 2) for k, v in per_attack.items()},
        "version": ATTACK_CLASSIFIER_VERSION,
    }
