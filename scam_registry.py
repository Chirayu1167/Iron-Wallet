"""
IronWallet -- Scam Contact Database
=====================================
Persistent, network-wide registry of reported recipients.

Stored as a simple JSON file on disk so reports survive server
restarts and are visible to EVERY user, not just the reporter.

Escalation tiers (mirrors fraud_engine REPORTED_RECIPIENT /
HIGH_RISK_RECIPIENT rules):
  1 report     -> flagged          (REPORTED_RECIPIENT fires)
  3+ reports   -> high_risk        (HIGH_RISK_RECIPIENT fires)
  5+ reports   -> network_blocked  (shown with a hard warning banner)
"""

import json
import os
import time
from pathlib import Path
from typing import Dict, Any, List, Optional

DB_PATH = Path(__file__).parent / "data" / "scam_registry.json"


def _load() -> Dict[str, Any]:
    if not DB_PATH.exists():
        return {}
    try:
        with open(DB_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        # Log corruption instead of silently returning empty — helps debug race writes
        import logging
        logging.getLogger("ironwallet.scam_registry").warning("scam_registry.json corrupted (%s), returning empty", e)
        return {}
    except Exception as e:
        import logging
        logging.getLogger("ironwallet.scam_registry").warning("Failed to load scam_registry.json: %s", e)
        return {}


def _save(data: Dict[str, Any]) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    # Atomic write via temp file to avoid corruption on concurrent writes
    import tempfile
    tmp_fd, tmp_path = tempfile.mkstemp(dir=str(DB_PATH.parent), prefix=".scam_tmp_")
    try:
        with open(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, DB_PATH)
    except Exception:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        # Fallback direct write
        with open(DB_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)


def _tier(count: int) -> str:
    # IRON never blocks — 5+ reports is HIGH_RISK (warning + OTP), not network_blocked
    if count >= 5:
        return "high_risk"
    if count >= 3:
        return "high_risk"
    if count >= 1:
        return "flagged"
    return "clean"


def _normalize_recipient(recipient: str) -> str:
    """Normalize to digits-only 10-digit or lowercased UPI ID for consistent lookups."""
    r = (recipient or "").strip()
    # If it looks like a phone number, keep only digits and take last 10
    digits = "".join(c for c in r if c.isdigit())
    if digits and ("@" not in r):
        # phone number - normalize to 10 digits
        if len(digits) >= 10:
            return digits[-10:]
        return digits
    # UPI ID or other - lowercased, stripped
    return r.lower()

def report_recipient(
    recipient: str,
    reporter: str,
    reason: str,
    amount: float = 0.0,
) -> Dict[str, Any]:
    """
    Add a fraud report for a recipient. Prevents the same reporter from
    inflating the count by reporting the same recipient multiple times
    within a short window (uses reporter+recipient as a dedup key per day).
    """
    # Validate recipient - reject empty
    if not recipient or not recipient.strip():
        return {
            "recipient":     recipient,
            "report_count":  0,
            "tier":          "clean",
            "deduplicated":  False,
            "error":         "Recipient cannot be empty",
        }
    recipient = _normalize_recipient(recipient)
    reporter = (reporter or "").strip()
    if not reporter:
        reporter = "anonymous"
    data = _load()
    entry = data.get(recipient, {
        "reports": [],
        "report_count": 0,
        "first_reported": time.time(),
    })

    # Dedup: same reporter can't report same recipient twice in 24h
    cutoff = time.time() - 86400
    already_reported_today = any(
        r["reporter"] == reporter and r["time"] > cutoff
        for r in entry["reports"]
    )
    if not already_reported_today:
        entry["reports"].append({
            "reporter": reporter,
            "reason":   reason,
            "amount":   amount,
            "time":     time.time(),
        })
        entry["report_count"] = len(entry["reports"])

    entry["tier"] = _tier(entry["report_count"])
    entry["last_reported"] = time.time()

    data[recipient] = entry
    _save(data)

    return {
        "recipient":     recipient,
        "report_count":  entry["report_count"],
        "tier":          entry["tier"],
        "deduplicated":  already_reported_today,
    }


def get_recipient_risk(recipient: str) -> Dict[str, Any]:
    """Returns risk info for a single recipient, or a clean record if unknown."""
    if not recipient or not recipient.strip():
        return {
            "recipient": recipient, "report_count": 0,
            "tier": "clean", "reasons": [],
        }
    recipient = _normalize_recipient(recipient)
    data = _load()
    entry = data.get(recipient)
    if not entry:
        return {
            "recipient": recipient, "report_count": 0,
            "tier": "clean", "reasons": [],
        }
    reasons = list({r["reason"] for r in entry["reports"]})
    return {
        "recipient":     recipient,
        "report_count":  entry["report_count"],
        "tier":          entry.get("tier", _tier(entry["report_count"])),
        "reasons":       reasons,
        "first_reported": entry.get("first_reported"),
        "last_reported":  entry.get("last_reported"),
    }


def get_all_flagged(min_count: int = 1) -> List[Dict[str, Any]]:
    """Returns every recipient with at least min_count reports, sorted by severity."""
    data = _load()
    results = []
    for recipient, entry in data.items():
        if entry["report_count"] >= min_count:
            reasons = list({r["reason"] for r in entry["reports"]})
            results.append({
                "recipient":      recipient,
                "report_count":   entry["report_count"],
                "tier":           entry.get("tier", _tier(entry["report_count"])),
                "reasons":        reasons,
                "first_reported": entry.get("first_reported"),
                "last_reported":  entry.get("last_reported"),
            })
    results.sort(key=lambda r: -r["report_count"])
    return results


def get_stats() -> Dict[str, Any]:
    """Network-wide summary stats for the scam database dashboard."""
    data = _load()
    total_recipients = len(data)
    total_reports     = sum(e["report_count"] for e in data.values())
    high_risk_count   = sum(1 for e in data.values() if e["report_count"] >= 3)
    blocked_count     = sum(1 for e in data.values() if e["report_count"] >= 5)
    return {
        "total_flagged_recipients": total_recipients,
        "total_reports":            total_reports,
        "high_risk_count":          high_risk_count,
        "network_blocked_count":    blocked_count,
    }

# ── Phase 5 enhancements — reputation, caching, evidence ──────────────────
# Simple in-memory cache with TTL and invalidation
_scam_cache: Dict[str, Dict[str, Any]] = {}
_scam_cache_ts: Dict[str, float] = {}
_scam_cache_ttl = 30.0
_data_mtime_cache = 0.0

def _is_cache_valid(recipient_norm: str) -> bool:
    ts = _scam_cache_ts.get(recipient_norm, 0)
    if time.time() - ts > _scam_cache_ttl:
        return False
    # Also check file mtime to invalidate if file changed externally
    try:
        mtime = os.path.getmtime(DB_PATH) if DB_PATH.exists() else 0
        global _data_mtime_cache
        if mtime > _data_mtime_cache:
            # file changed, invalidate all
            _scam_cache.clear()
            _scam_cache_ts.clear()
            _data_mtime_cache = mtime
            return False
    except Exception:
        pass
    return recipient_norm in _scam_cache

def _set_cache(recipient_norm: str, data: Dict[str, Any]):
    _scam_cache[recipient_norm] = data
    _scam_cache_ts[recipient_norm] = time.time()
    try:
        global _data_mtime_cache
        if DB_PATH.exists():
            _data_mtime_cache = os.path.getmtime(DB_PATH)
    except Exception:
        pass

def _invalidate_cache(recipient_norm: str | None = None):
    if recipient_norm:
        _scam_cache.pop(recipient_norm, None)
        _scam_cache_ts.pop(recipient_norm, None)
    else:
        _scam_cache.clear()
        _scam_cache_ts.clear()

# Patch _save to invalidate cache
_orig_save = _save
def _save_with_invalidate(data: Dict[str, Any]) -> None:
    _orig_save(data)
    _invalidate_cache()

# Replace _save with invalidating version
_save = _save_with_invalidate  # type: ignore

def get_recipient_reputation(recipient: str) -> Dict[str, Any]:
    """
    Phase 5F — clean recipient intelligence result.
    Returns:
      {
        "recipient": "...",
        "known": true/false,            # exists in registry
        "reported": true/false,         # report_count >=1
        "report_count": 7,
        "reputation": "CLEAN"|"FLAGGED"|"HIGH_RISK",
        "confidence": 0.0-1.0,          # based on report_count and recency
        "recency_days": int | None,
        "category": "RECIPIENT",
        "evidence": {"report_count":7, "reasons":[...], "first_reported":..., "last_reported":...},
        "source": "scam_registry",
        "tier": "clean"|"flagged"|"high_risk",
        "signals": [...]                # empty if clean, else structured signal ids
      }
    """
    norm = _normalize_recipient(recipient) if recipient and recipient.strip() else ""
    if not norm:
        return {
            "recipient": recipient,
            "known": False,
            "reported": False,
            "report_count": 0,
            "reputation": "CLEAN",
            "confidence": 0.95,
            "recency_days": None,
            "category": "RECIPIENT",
            "evidence": {"report_count": 0},
            "source": "scam_registry",
            "tier": "clean",
            "signals": []
        }
    # Use cache if valid
    if _is_cache_valid(norm):
        cached = _scam_cache[norm]
        # return copy
        return dict(cached)

    risk = get_recipient_risk(recipient)
    count = int(risk.get("report_count", 0))
    tier = risk.get("tier", "clean")
    reported = count >= 1
    known = count >= 1
    if tier == "high_risk":
        reputation = "HIGH_RISK"
    elif tier == "flagged":
        reputation = "FLAGGED"
    else:
        reputation = "CLEAN"

    # Confidence based on report count + recency
    # Multiple reports + recent → higher confidence fraud
    if count == 0:
        confidence = 0.92  # confident clean when no reports (but not absolute)
    elif count >= 5:
        confidence = 0.96
    elif count >= 3:
        confidence = 0.85
    else:
        confidence = 0.70

    # Recency penalty/boost: very recent report adds confidence
    recency_days = None
    last = risk.get("last_reported")
    first = risk.get("first_reported")
    if last:
        try:
            recency_days = int((time.time() - float(last)) / 86400)
            # Recent (0-2 days) boost confidence
            if recency_days <= 2 and count >= 1:
                confidence = min(0.98, confidence + 0.08)
            elif recency_days > 180 and count <= 1:
                confidence = max(0.5, confidence - 0.1)
        except Exception:
            pass

    # Evidence
    evidence = {
        "report_count": count,
        "reasons": risk.get("reasons", []),
        "first_reported": first,
        "last_reported": last,
        "tier": tier,
    }
    # Signals for deduplication
    signals = []
    if reported:
        signals.append({
            "id": "recipient_reported" if count < 3 else "recipient_high_reports",
            "category": "RECIPIENT",
            "severity": "HIGH" if count < 3 else "CRITICAL",
            "score": 12 if count == 1 else (22 if count < 3 else 30),
            "evidence": {"report_count": count, "tier": tier},
            "description": f"Recipient has {count} fraud report(s)" + (f" — last reported {recency_days} days ago" if recency_days is not None else ""),
            "source": "scam_registry"
        })

    result = {
        "recipient": norm,
        "known": known,
        "reported": reported,
        "report_count": count,
        "reputation": reputation,
        "confidence": round(float(confidence), 2),
        "recency_days": recency_days,
        "category": "RECIPIENT",
        "evidence": evidence,
        "source": "scam_registry",
        "tier": tier,
        "signals": signals,
        "reasons": risk.get("reasons", []),
    }
    _set_cache(norm, result)
    return dict(result)
