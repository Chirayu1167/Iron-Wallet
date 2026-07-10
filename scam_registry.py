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
    except Exception:
        return {}


def _save(data: Dict[str, Any]) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _tier(count: int) -> str:
    if count >= 5:
        return "network_blocked"
    if count >= 3:
        return "high_risk"
    if count >= 1:
        return "flagged"
    return "clean"


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
