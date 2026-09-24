"""
risk_engine/account_takeover.py — Account Takeover Intelligence (Phase 17)

Detects suspicious COMBINATIONS of existing signals. Reuses signals only;
creates no duplicate detection logic. Advisory only — never affects
risk score, tier, OTP flow, or blocking.

Takeover dimensions (7 — fixed order for deterministic output):
  device     — Unfamiliar/new device
  location   — Unusual location
  time       — Unusual transaction time
  amount     — Abnormal transaction amount
  recipient  — New/unfamiliar recipient
  velocity   — Abnormal transaction velocity
  behavior   — Significant behavioral deviation

Rules:
  - Only MEDIUM+ severity signals with score > 0 count (LOW = weak, ignored).
  - Benign familiarity signals never count.
  - Social-engineering scam lures (Phase 16) do NOT count — takeover is about
    access/context anomalies, not message wording.
  - Isolated single-dimension evidence -> NOT detected (combinations only).
  - >= 2 distinct dimensions -> detected.

RiskEngine is the single source of truth: it calls detect_account_takeover()
on its deduped signals. otp_server only passes the result through.
IRON NEVER BLOCKS A PAYMENT.
"""
from __future__ import annotations
from typing import Dict, Any, List

ACCOUNT_TAKEOVER_VERSION = "v1"

# Fixed dimension order — explanation order is deterministic.
DIMENSIONS: List[str] = [
    "device",
    "location",
    "time",
    "amount",
    "recipient",
    "velocity",
    "behavior",
]

DIMENSION_LABELS: Dict[str, str] = {
    "device": "unfamiliar device",
    "location": "unusual location",
    "time": "unusual time",
    "amount": "abnormal amount",
    "recipient": "new recipient",
    "velocity": "abnormal velocity",
    "behavior": "behavioral deviation",
}

# Direct signal-id (lowercased) -> takeover dimension.
# Only takeover-relevant IDs. Scam-lure IDs (otp_request, impersonation,
# reward, investment, remote_access, account_suspension, urgency text, UPI
# impersonation handles, reported-recipient reputation) intentionally absent.
_ID_TO_DIM: Dict[str, str] = {
    # device
    "unfamiliar_device": "device",
    "new_device": "device",
    "unfamiliar_device_ctx": "device",
    # location
    "unfamiliar_location": "location",
    "location_anomaly": "location",
    "unfamiliar_location_ctx": "location",
    # time
    "odd_hour": "time",
    "late_night": "time",
    "unusual_transaction_timing": "time",
    "unusual_hour": "time",
    # amount
    "high_amount": "amount",
    "extreme_amount": "amount",
    "round_amount_large": "amount",
    "balance_drain_high": "amount",
    "balance_drain_critical": "amount",
    "balance_impact": "amount",
    "high_value_transaction": "amount",
    "recipient_amount_anomaly": "amount",
    "daily_limit_approach": "amount",
    # recipient (new/unfamiliar only — familiarity signals are benign)
    "recipient_new": "recipient",
    "new_recipient": "recipient",
    "unfamiliar_recipient": "recipient",
    "recipient_novelty": "recipient",
    "rare_recipient": "recipient",
    "recipient_rarity": "recipient",
    "off_network_recipient": "recipient",
    # velocity
    "high_velocity_5m": "velocity",
    "high_velocity_1h": "velocity",
    "rapid_velocity_5m": "velocity",
    "high_velocity_1h_ctx": "velocity",
    "high_velocity_5m_ctx": "velocity",
    "recipient_switching": "velocity",
    "sequential_amounts": "velocity",
    "amount_escalation_burst": "velocity",
    "velocity_1h": "velocity",
    "velocity_24h": "velocity",
    # behavior (significant deviation only)
    "sudden_behaviour_change": "behavior",
    "unusual_amount_spike": "behavior",
    "amount_deviation": "behavior",
    "amount_anomaly": "behavior",
}

# Benign signals that must NEVER count toward takeover.
_BENIGN_IDS = {
    "recipient_familiar",
    "recipient_frequent",
    "recipient_old_report",
    "device_low_familiarity",  # LOW weak hint — handled by severity gate anyway
}

_SEV_ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}


def _map_signal_to_dimension(sig: Dict[str, Any]) -> str | None:
    """Map one existing signal to a takeover dimension. None = not takeover-relevant."""
    raw_id = str(sig.get("id", ""))
    sid = raw_id.lower()
    if sid in _BENIGN_IDS:
        return None
    # Weak signals never count (weak-signal cases stay negative).
    if str(sig.get("severity", "MEDIUM")).upper() == "LOW":
        return None
    try:
        if float(sig.get("score", 0)) <= 0:
            return None
    except Exception:
        return None
    if sid in _ID_TO_DIM:
        return _ID_TO_DIM[sid]
    # Category fallback for forward-compatible / ML feature signals.
    cat = str(sig.get("category", "")).upper()
    if cat == "DEVICE":
        return "device"
    if cat == "LOCATION":
        return "location"
    if cat == "TIMING":
        return "time"
    if cat in ("AMOUNT", "BALANCE"):
        return "amount"
    if cat == "RECIPIENT":
        # recipient_reported / recently_reported = reputation, not takeover novelty
        if "report" in sid:
            return None
        return "recipient"
    if cat == "VELOCITY":
        return "velocity"
    if cat in ("BEHAVIOURAL", "ACCOUNT_BEHAVIOUR"):
        return "behavior"
    if cat == "TRANSACTION_PATTERNS":
        return "velocity"
    return None


def detect_account_takeover(signals: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Detect account-takeover from EXISTING RiskEngine signals (already deduped).

    Returns:
      {
        "account_threat_detected": bool,
        "account_threat_confidence": 0.0-0.95,
        "signal_ids": [...supporting ids...],
        "explanation": "concise deterministic string",
        "dimensions": {"device": [...ids...], ...} (only hit dims),
        "dimension_count": int,
        "version": "v1",
      }
    Deterministic, advisory only (never blocks, never changes score).
    """
    signals = signals or []
    dim_to_ids: Dict[str, List[str]] = {}
    dim_to_sigs: Dict[str, List[Dict[str, Any]]] = {}

    for sig in signals:
        if not isinstance(sig, dict):
            continue
        dim = _map_signal_to_dimension(sig)
        if not dim:
            continue
        sid = str(sig.get("id", ""))
        dim_to_ids.setdefault(dim, []).append(sid)
        dim_to_sigs.setdefault(dim, []).append(sig)

    # Deterministic ordering of supporting ids by DIMENSIONS order.
    ordered_dims = [d for d in DIMENSIONS if d in dim_to_ids]
    signal_ids: List[str] = []
    for d in ordered_dims:
        signal_ids.extend(dim_to_ids[d])

    dim_count = len(ordered_dims)
    detected = dim_count >= 2

    # Confidence: confidence that a takeover is occurring.
    if not ordered_dims:
        confidence = 0.0
    elif not detected:
        # Single isolated dimension — weak evidence only, capped below 0.5.
        only = dim_to_sigs[ordered_dims[0]][0]
        sev = str(only.get("severity", "MEDIUM")).upper()
        confidence = {"MEDIUM": 0.25, "HIGH": 0.35, "CRITICAL": 0.4}.get(sev, 0.25)
    else:
        # Combination: base by dimension count + strongest severity + breadth bonus.
        order = _SEV_ORDER
        max_sev = "MEDIUM"
        for d in ordered_dims:
            for s in dim_to_sigs[d]:
                sev = str(s.get("severity", "MEDIUM")).upper()
                if order.get(sev, 1) > order.get(max_sev, 1):
                    max_sev = sev
        base = {2: 0.6, 3: 0.75, 4: 0.82}.get(dim_count, 0.88) if dim_count >= 2 else 0.0
        if dim_count > 4:
            base = 0.88
        sev_bonus = {"MEDIUM": 0.0, "HIGH": 0.05, "CRITICAL": 0.08}.get(max_sev, 0.0)
        # Extra signals beyond one-per-dimension add small corroboration.
        extra = max(0, len(signal_ids) - dim_count)
        breadth = min(0.04, 0.02 * extra)
        confidence = round(min(0.95, base + sev_bonus + breadth), 2)

    if detected:
        parts = [DIMENSION_LABELS[d] for d in ordered_dims]
        explanation = (
            "Account takeover suspected: "
            + " + ".join(parts)
            + f" ({dim_count} independent signals)."
        )
    else:
        if not ordered_dims:
            explanation = "No account-takeover pattern: no device, location, time, amount, recipient, velocity or behavior anomaly."
        else:
            explanation = (
                "No account-takeover pattern: only "
                + DIMENSION_LABELS[ordered_dims[0]]
                + " in isolation — combination required."
            )

    return {
        "account_threat_detected": bool(detected),
        "account_threat_confidence": float(confidence),
        "signal_ids": signal_ids,
        "explanation": explanation,
        "dimensions": {d: list(dim_to_ids[d]) for d in ordered_dims},
        "dimension_count": dim_count,
        "version": ACCOUNT_TAKEOVER_VERSION,
    }
