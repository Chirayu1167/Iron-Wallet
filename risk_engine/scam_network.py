"""
risk_engine/scam_network.py — Scam Network & Campaign Intelligence (Phase 18)

Lightweight layer identifying possible scam networks/campaigns from EXISTING
data (transactions, recipient profile, scam-registry, attack intelligence).
Creates no new fraud/risk score. Advisory only — never affects risk score,
tier, OTP flow, or blocking.

Network types (deterministic priority):
  REPORTED_RECIPIENT_NETWORK — recipient reported by multiple users + corroboration
  SHARED_HANDLE_CAMPAIGN     — suspicious UPI handle + corroboration
  REPEATED_ATTACK_CAMPAIGN   — repeated social-attack lure + corroboration
  RECIPIENT_REPEAT_CLUSTER   — same recipient reappearing + suspicious cluster
  NONE                       — no network pattern (incl. reputation-only)

Rules:
  - Only MEDIUM+ severity signals with score > 0 count (LOW = weak, ignored).
  - Benign familiarity signals never count.
  - Single suspicious transaction is NEVER a network: >= 2 independent
    evidence pieces required (multi-reporter / repeat / handle / lure / velocity).
  - report_count == 1 alone = recipient-level reputation only, not a network.

RiskEngine is the single source of truth: it calls detect_scam_network()
on its deduped signals + recipient/attack/transaction context.
otp_server only builds the context from existing stores and passes it through.
IRON NEVER BLOCKS A PAYMENT.
"""
from __future__ import annotations
from typing import Dict, Any, List, Optional

SCAM_NETWORK_VERSION = "v1"

NETWORK_TYPES: List[str] = [
    "REPORTED_RECIPIENT_NETWORK",
    "SHARED_HANDLE_CAMPAIGN",
    "REPEATED_ATTACK_CAMPAIGN",
    "RECIPIENT_REPEAT_CLUSTER",
    "NONE",
]

NETWORK_DESCRIPTIONS: Dict[str, str] = {
    "REPORTED_RECIPIENT_NETWORK": "Recipient reported by multiple users with corroborating campaign evidence.",
    "SHARED_HANDLE_CAMPAIGN": "Suspicious UPI handle pattern seen with corroborating scam evidence.",
    "REPEATED_ATTACK_CAMPAIGN": "Repeated scam lure pattern with corroborating network evidence.",
    "RECIPIENT_REPEAT_CLUSTER": "Same recipient reappearing with suspicious cluster activity.",
    "NONE": "No scam network or campaign pattern.",
}

# Social lures (Phase 16) indicating a reusable campaign message/pattern.
_SOCIAL_LURES = {
    "FAKE_KYC_SUSPENSION",
    "IMPERSONATION",
    "FAKE_REFUND_REWARD",
    "INVESTMENT_LOAN_SCAM",
    "REMOTE_ACCESS",
    "OTP_HARVESTING",
}

_HANDLE_IDS = {"suspicious_upi_handle", "impersonation_upi"}

_VELOCITY_IDS = {
    "rapid_velocity_5m", "high_velocity_5m", "high_velocity_1h",
    "recipient_switching", "amount_escalation_burst", "sequential_amounts",
    "velocity_1h", "velocity_24h", "high_velocity_5m_ctx", "high_velocity_1h_ctx",
}

_BENIGN_IDS = {
    "recipient_familiar", "recipient_frequent", "recipient_old_report",
    "device_low_familiarity",
}


def _normalize_recipient(recipient: str) -> str:
    try:
        import scam_registry as _sr
        if hasattr(_sr, "_normalize_recipient"):
            return _sr._normalize_recipient(recipient)
    except Exception:
        pass
    r = (recipient or "").strip()
    digits = "".join(c for c in r if c.isdigit())
    if digits and ("@" not in r):
        return digits[-10:] if len(digits) >= 10 else digits
    return r.lower()


def _extract_handle(recipient: str, signals: List[Dict[str, Any]]) -> str:
    # Prefer evidence.handle from suspicious_upi_handle signal (existing detection).
    for s in signals or []:
        try:
            if str(s.get("id", "")).lower() == "suspicious_upi_handle":
                h = str((s.get("evidence", {}) or {}).get("handle", "")).strip().lower()
                if h:
                    return h
        except Exception:
            continue
    r = (recipient or "").strip()
    if "@" in r:
        try:
            return r.split("@", 1)[1].strip().lower()
        except Exception:
            return ""
    return ""


def _signal_present(signals: List[Dict[str, Any]], ids: set) -> List[str]:
    out: List[str] = []
    for s in signals or []:
        if not isinstance(s, dict):
            continue
        sid = str(s.get("id", "")).lower()
        if sid in _BENIGN_IDS:
            continue
        if str(s.get("severity", "MEDIUM")).upper() == "LOW":
            continue
        try:
            if float(s.get("score", 0)) <= 0:
                continue
        except Exception:
            continue
        if sid in ids:
            out.append(str(s.get("id", "")))
    return out


def _distinct_reporter_count(recipient_norm: str, fallback: int) -> int:
    """Cross-user proof: distinct reporters for this recipient (guarded, cached)."""
    try:
        import scam_registry as _sr
        loader = getattr(_sr, "_load", None)
        if loader is None:
            return int(fallback or 0)
        data = loader() or {}
        entry = data.get(recipient_norm)
        if not entry:
            return 0
        reporters = {str(r.get("reporter", "")).strip() for r in (entry.get("reports") or []) if str(r.get("reporter", "")).strip()}
        if reporters:
            return len(reporters)
        return int(entry.get("report_count", fallback or 0) or 0)
    except Exception:
        try:
            return int(fallback or 0)
        except Exception:
            return 0


def detect_scam_network(
    signals: List[Dict[str, Any]] | None = None,
    recipient_profile: Dict[str, Any] | None = None,
    attack: Dict[str, Any] | None = None,
    transaction: Dict[str, Any] | None = None,
    network_context: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """
    Detect scam network/campaign from EXISTING data (no new score).

    Returns:
      {
        "network_threat_detected": bool,
        "network_confidence": 0.0-0.9,
        "network_type": one of NETWORK_TYPES,
        "signal_ids": [...supporting ids, subset of input signals...],
        "explanation": "concise deterministic string",
        "evidence": {"recipient","report_count","reporter_count","reasons",
                     "handle","attack_type","user_tx_count","pieces"},
        "version": "v1",
      }
    """
    signals = signals or []
    recipient_profile = recipient_profile or {}
    attack = attack or {}
    transaction = transaction or {}
    network_context = network_context or {}

    recipient_raw = (
        network_context.get("recipient")
        or recipient_profile.get("recipient")
        or transaction.get("merchant_name")
        or transaction.get("recipient")
        or ""
    )
    recipient_norm = _normalize_recipient(str(recipient_raw))

    # Report counts (global, existing scam-registry data).
    try:
        report_count = int(network_context.get("report_count", recipient_profile.get("report_count", 0)) or 0)
    except Exception:
        report_count = 0
    if "reporter_count" in network_context:
        try:
            reporter_count = int(network_context.get("reporter_count") or 0)
        except Exception:
            reporter_count = report_count
    else:
        reporter_count = _distinct_reporter_count(recipient_norm, report_count) if recipient_norm else 0

    reasons: List[str] = list(
        network_context.get("reasons",
            ((recipient_profile.get("evidence", {}) or {}).get("reasons", [])
             if isinstance(recipient_profile.get("evidence"), dict)
             else recipient_profile.get("reasons", [])) or []) or []
    )
    # Deterministic reason ordering.
    try:
        reasons = sorted({str(x) for x in reasons if str(x).strip()})[:5]
    except Exception:
        reasons = []

    try:
        user_tx_count = int(network_context.get("user_tx_count", recipient_profile.get("transaction_count", 0)) or 0)
    except Exception:
        user_tx_count = 0

    attack_type = str(
        network_context.get("attack_type", attack.get("attack_type", "NONE")) or "NONE"
    ).upper()

    handle = str(network_context.get("handle") or _extract_handle(str(recipient_raw), signals) or "").lower()

    handle_ids = _signal_present(signals, _HANDLE_IDS)
    velocity_ids = _signal_present(signals, _VELOCITY_IDS)

    pieces: List[str] = []
    if report_count >= 2 and reporter_count >= 2:
        pieces.append("multi_reporter")
    if user_tx_count >= 1:
        pieces.append("recipient_repeat")
    if handle_ids:
        pieces.append("shared_handle")
    if attack_type in _SOCIAL_LURES:
        pieces.append("repeated_lure")
    if velocity_ids:
        pieces.append("velocity_cluster")

    detected = len(pieces) >= 2

    if detected:
        if "multi_reporter" in pieces:
            network_type = "REPORTED_RECIPIENT_NETWORK"
        elif "shared_handle" in pieces:
            network_type = "SHARED_HANDLE_CAMPAIGN"
        elif "repeated_lure" in pieces:
            network_type = "REPEATED_ATTACK_CAMPAIGN"
        else:
            network_type = "RECIPIENT_REPEAT_CLUSTER"
    else:
        network_type = "NONE"

    # Supporting signal ids in deterministic piece order.
    signal_ids: List[str] = []
    if detected:
        if "shared_handle" in pieces:
            signal_ids.extend(handle_ids)
        if "velocity_cluster" in pieces:
            signal_ids.extend(velocity_ids)
        # Recipient/report corroboration ids (existing signals only).
        for s in signals:
            if not isinstance(s, dict):
                continue
            sid = str(s.get("id", ""))
            low = sid.lower()
            if low in _BENIGN_IDS:
                continue
            if str(s.get("severity", "MEDIUM")).upper() == "LOW":
                continue
            try:
                if float(s.get("score", 0)) <= 0:
                    continue
            except Exception:
                continue
            if low in ("recipient_reported", "reported_recipient", "high_risk_recipient",
                       "recipient_high_report_count", "recipient_high_reports",
                       "reported_recipient_high", "recipient_recently_reported",
                       "recently_reported_recipient", "recipient_new", "new_recipient",
                       "unfamiliar_recipient", "recipient_novelty"):
                if sid not in signal_ids:
                    signal_ids.append(sid)

    if not detected:
        if len(pieces) == 0:
            confidence = 0.0
        else:
            # Single corroborating piece only — weak, below threshold.
            confidence = 0.3
        if report_count == 1 and len(pieces) <= 1:
            explanation = (
                "No scam network: recipient-level reputation only "
                f"(1 report for {recipient_norm or 'recipient'}) with no corroborating campaign evidence."
            )
        elif len(pieces) == 1:
            explanation = (
                f"No scam network: single piece ({pieces[0].replace('_', ' ')}) in isolation — "
                "network requires corroboration across reporters, handles, lures or velocity."
            )
        else:
            explanation = "No scam network or campaign pattern."
    else:
        base = 0.6 + 0.08 * (len(pieces) - 2)
        if report_count >= 5:
            base += 0.08
        elif report_count >= 3:
            base += 0.05
        if reporter_count >= 3:
            base += 0.03
        confidence = round(min(0.9, base), 2)
        bit_labels = {
            "multi_reporter": f"reported by {reporter_count} users ({report_count} reports)",
            "recipient_repeat": f"same recipient seen in {user_tx_count + 1} transactions",
            "shared_handle": f"shared handle '@{handle}'" if handle else "shared suspicious handle",
            "repeated_lure": f"repeated {attack_type.replace('_', ' ').title()} lure",
            "velocity_cluster": "burst/velocity cluster",
        }
        explanation = (
            "Possible scam network"
            + (f" ({network_type.replace('_', ' ').title()}): " if network_type != "NONE" else ": ")
            + " + ".join(bit_labels[p] for p in pieces if p in bit_labels)
            + "."
        )

    evidence = {
        "recipient": recipient_norm,
        "report_count": int(report_count),
        "reporter_count": int(reporter_count),
        "reasons": reasons,
        "handle": handle,
        "attack_type": attack_type,
        "user_tx_count": int(user_tx_count),
        "pieces": list(pieces),
    }

    return {
        "network_threat_detected": bool(detected),
        "network_confidence": float(confidence if detected else (confidence if len(pieces) else 0.0)),
        "network_type": network_type,
        "signal_ids": signal_ids,
        "explanation": explanation,
        "evidence": evidence,
        "description": NETWORK_DESCRIPTIONS.get(network_type, ""),
        "version": SCAM_NETWORK_VERSION,
    }
