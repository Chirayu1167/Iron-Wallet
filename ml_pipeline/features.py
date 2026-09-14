"""
ml_pipeline/features.py — Behavioural Feature Generation Layer (Phase 4C)

Centralized, explicit, stable 31-feature vector for Isolation Forest.

Flow:
    transaction dict
        ↓
    historical user data (iron_store.get_transactions_for_user)
        ↓
    user-specific baseline (mean/median/std/percentile/hour/recipient/velocity/device/location)
        ↓
    behavioural feature generator
        ↓
    31-feature vector (FEATURE_ORDER)
        ↓
    scaler → Isolation Forest → anomaly score → 0–100

All feature ordering is explicit in FEATURE_ORDER. No scattering across endpoints.

Only uses features that actually exist and are reliable. If history insufficient,
marks cold_start and falls back to profile, never invents fake history.

Version: iforest-v1  (must match scorer MODEL_VERSION)
"""
from __future__ import annotations
import math
import time
import calendar
from typing import Dict, Any, List, Tuple
import numpy as np

# ── Explicit stable ordering — MUST remain 31 and match scaler training ────
FEATURE_ORDER = [
    "amount",                    # 0
    "hour_of_day",               # 1
    "is_weekend",                # 2
    "is_salary_period",          # 3
    "merchant_frequency_score",   # 4
    "recipient_frequency_score",  # 5
    "days_since_recipient_seen", # 6
    "device_familiarity",        # 7
    "location_familiarity",      # 8
    "account_age_days",          # 9
    "amount_zscore",             # 10
    "amount_vs_user_avg",        # 11
    "amount_vs_user_median",     # 12
    "amount_percentile",         # 13
    "balance_drop_pct",          # 14
    "hour_sin",                  # 15
    "hour_cos",                  # 16
    "day_sin",                   # 17
    "day_cos",                   # 18
    "is_rare_merchant",          # 19
    "is_night_txn",              # 20
    "is_peak_hour",              # 21
    "hour_activity_score",       # 22
    "category_familiarity",      # 23
    "txn_velocity_1h",           # 24
    "txn_velocity_24h",          # 25
    "amount_velocity_24h",       # 26
    "weekend_deviation",         # 27
    "merchant_category_encoded", # 28
    "payment_method_encoded",    # 29
    "is_p2p",                    # 30
]

CAT_ORDER = {
    "Food Delivery":0,"Grocery":1,"Grocery Delivery":2,"E-Commerce":3,
    "Gaming":4,"Entertainment":5,"Fuel":6,"Utility":7,"Rent":8,
    "Pharmacy":9,"Telecom":10,"Transfer":11,
}
PM_ORDER = {
    "UPI":0,"Debit Card":1,"Credit Card":2,
    "Net Banking":3,"Google Pay":4,"Cash":5,
}
DAY_MAP = {
    "Monday":0,"Tuesday":1,"Wednesday":2,"Thursday":3,
    "Friday":4,"Saturday":5,"Sunday":6,
}

# Minimum history to consider baseline "reliable" (cold_start threshold)
COLD_START_THRESHOLD = 5

def _parse_history_timestamps(history: List[Dict[str, Any]]) -> List[float]:
    """Parse ISO8601 timestamps to epoch seconds, ignoring malformed."""
    out = []
    for h in history:
        ts = h.get("timestamp")
        if not ts:
            continue
        try:
            out.append(calendar.timegm(time.strptime(ts, "%Y-%m-%dT%H:%M:%SZ")))
        except Exception:
            continue
    return out

def compute_baseline_from_history(
    history: List[Dict[str, Any]],
    profile: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """
    Compute user-specific baseline statistics from persisted history.
    Falls back to profile when history insufficient; never fabricates.

    Returns dict with keys:
        history_count, cold_start (bool),
        amount_mean, amount_median, amount_std, amount_p95, amount_p99,
        weekend_ratio, peak_hours (set), hour_freq (dict),
        recipient_freq (dict), recipient_set (set),
        velocity_1h_avg, velocity_24h_avg, etc.
    """
    history_count = len(history)
    cold_start = history_count < COLD_START_THRESHOLD

    baseline: Dict[str, Any] = {
        "history_count": history_count,
        "cold_start": cold_start,
    }

    amounts = []
    for h in history:
        try:
            amounts.append(float(h.get("amount", 0)))
        except Exception:
            continue

    if amounts:
        arr = np.array(amounts, dtype=np.float64)
        baseline["amount_mean"] = float(np.mean(arr))
        baseline["amount_median"] = float(np.median(arr))
        # std with ddof for sample
        baseline["amount_std"] = float(np.std(arr)) if len(arr) > 1 else float((arr[0] * 0.5) if arr[0] else 500)
        # ensure non-zero std
        if baseline["amount_std"] < 1:
            baseline["amount_std"] = max(baseline["amount_mean"] * 0.3, 100)
        baseline["amount_p95"] = float(np.percentile(arr, 95)) if len(arr) >= 2 else baseline["amount_mean"] * 1.8
        baseline["amount_p99"] = float(np.percentile(arr, 99)) if len(arr) >= 2 else baseline["amount_mean"] * 2.5
        baseline["amount_min"] = float(np.min(arr))
        baseline["amount_max"] = float(np.max(arr))
    else:
        # No history amounts — defer to profile, mark cold_start
        if profile:
            baseline["amount_mean"] = float(profile.get("amount_mean", 1000))
            baseline["amount_median"] = float(profile.get("amount_median", baseline["amount_mean"] * 0.8))
            baseline["amount_std"] = float(profile.get("amount_std", baseline["amount_mean"] * 0.6) or baseline["amount_mean"] * 0.6)
            baseline["amount_p95"] = float(profile.get("amount_p95", baseline["amount_mean"] * 2))
            baseline["amount_p99"] = float(profile.get("amount_p99", baseline["amount_mean"] * 3))
        else:
            # No profile and no history — truly cold, use neutral but mark
            baseline["amount_mean"] = None
            baseline["amount_median"] = None
            baseline["amount_std"] = None
            baseline["amount_p95"] = None
            baseline["amount_p99"] = None

    # Hour frequency from history timestamps
    hours = []
    weekend_cnt = 0
    for h in history:
        ts = h.get("timestamp")
        try:
            tm = time.strptime(ts, "%Y-%m-%dT%H:%M:%SZ")
            hours.append(tm.tm_hour)
            # weekday: 0 Monday … 6 Sunday — time.strptime wday is different, use gmtime from epoch
            epoch = calendar.timegm(tm)
            wday = time.gmtime(epoch).tm_wday
            if wday >= 5:
                weekend_cnt += 1
        except Exception:
            continue

    if hours:
        from collections import Counter
        cnt = Counter(hours)
        total = len(hours)
        baseline["hour_freq"] = {h: c / total for h, c in cnt.items()}
        # peak_hours = top 3 most frequent
        baseline["peak_hours"] = set([h for h, _ in cnt.most_common(3)])
        baseline["weekend_ratio"] = float(weekend_cnt / total) if total else 0.3
        baseline["txn_per_day_avg"] = float(total / max(30, total))  # rough
    else:
        # fallback to profile
        if profile:
            baseline["hour_freq"] = dict(profile.get("hour_freq", {}))
            baseline["peak_hours"] = set(profile.get("peak_hours", set()))
            baseline["weekend_ratio"] = float(profile.get("weekend_ratio", 0.3))
        else:
            baseline["hour_freq"] = {}
            baseline["peak_hours"] = set()
            baseline["weekend_ratio"] = 0.3

    # Recipient familiarity
    recipients = {}
    recipient_set = set()
    last_seen_map: Dict[str, float] = {}
    now_epoch = time.time()
    for h in history:
        r = h.get("recipient", "")
        if not r:
            continue
        recipient_set.add(r)
        recipients[r] = recipients.get(r, 0) + 1
        # track latest timestamp for days_since
        ts = h.get("timestamp")
        try:
            epoch = calendar.timegm(time.strptime(ts, "%Y-%m-%dT%H:%M:%SZ"))
            if r not in last_seen_map or epoch > last_seen_map[r]:
                last_seen_map[r] = epoch
        except Exception:
            pass
    baseline["recipient_freq"] = {k: v / history_count for k, v in recipients.items()} if history_count else {}
    baseline["recipient_set"] = recipient_set
    baseline["recipient_last_seen"] = last_seen_map

    # Velocity stats — needed for features 24/25/26 but computed per-transaction
    # Here we store overall recent activity windows for baseline reference
    history_epochs = _parse_history_timestamps(history)
    # counts in last 1h/24h
    if history_epochs:
        last_1h = sum(1 for e in history_epochs if now_epoch - e < 3600)
        last_24h = sum(1 for e in history_epochs if now_epoch - e < 86400)
        baseline["recent_1h"] = last_1h
        baseline["recent_24h"] = last_24h
        baseline["amount_24h"] = sum(float(h.get("amount", 0)) for h in history if any(abs(calendar.timegm(time.strptime(h.get("timestamp",""), "%Y-%m-%dT%H:%M:%SZ")) - e) < 1 for e in history_epochs if now_epoch - e < 86400))
        # simpler amount velocity
        baseline["amount_24h"] = sum(float(h.get("amount",0)) for h in history if (lambda: True)())
        # Recompute correctly for amount_24h window
        baseline["amount_24h"] = 0
        for h in history:
            try:
                e = calendar.timegm(time.strptime(h["timestamp"], "%Y-%m-%dT%H:%M:%SZ"))
                if now_epoch - e < 86400:
                    baseline["amount_24h"] += float(h.get("amount",0))
            except Exception:
                continue
    else:
        baseline["recent_1h"] = 0
        baseline["recent_24h"] = 0
        baseline["amount_24h"] = 0

    return baseline

def _recipient_metrics(txn_recipient: str, baseline: Dict[str, Any]) -> Tuple[float, int]:
    """Return (frequency_score 0-1, days_since_seen)."""
    if not txn_recipient:
        return 0.0, 999
    freq = baseline.get("recipient_freq", {}).get(txn_recipient, 0.0)
    # Check also normalized phone suffix matching (last 10 digits)
    if freq == 0 and txn_recipient.isdigit():
        suffix = txn_recipient[-10:]
        for k, v in baseline.get("recipient_freq", {}).items():
            if k[-10:] == suffix:
                freq = v
                break
    last_seen = baseline.get("recipient_last_seen", {}).get(txn_recipient)
    if last_seen is None and txn_recipient.isdigit():
        suffix = txn_recipient[-10:]
        for k, e in baseline.get("recipient_last_seen", {}).items():
            if k[-10:] == suffix:
                last_seen = e
                break
    if last_seen is None:
        return float(freq), 999
    days = int((time.time() - last_seen) / 86400)
    return float(freq), int(days)

def generate_feature_vector(
    txn: Dict[str, Any],
    history: List[Dict[str, Any]],
    profile: Dict[str, Any] | None,
    baseline: Dict[str, Any] | None = None,
    device_familiarity: float | None = None,
    location_familiarity: float | None = None,
) -> Tuple[np.ndarray, Dict[str, float], Dict[str, Any]]:
    """
    Generate stable 31-feature vector from transaction + history + profile.

    Returns: (vector np[1,31], features_dict, diagnostics)
    features_dict maps FEATURE_ORDER names → float values (for explainability)
    diagnostics includes baseline used, cold_start, etc.

    Does NOT call scaler or model — pure feature layer.
    """
    if baseline is None:
        baseline = compute_baseline_from_history(history, profile)

    amount = float(txn.get("amount", 0))
    hour = int(txn.get("hour_of_day", 12))
    dow_name = txn.get("day_of_week", "Monday")
    dow = DAY_MAP.get(dow_name, 0)
    is_weekend = int(txn.get("is_weekend", 0))
    is_salary = int(txn.get("is_salary_period", 0))
    bal_before = float(txn.get("balance_before", 1)) or 1

    # Amount baseline selection — prefer history-derived if sufficient
    if baseline.get("amount_mean") is not None:
        avg = float(baseline["amount_mean"])
        std = float(baseline["amount_std"] or avg * 0.5 or 500)
        median = float(baseline["amount_median"] or avg * 0.8)
        p95 = float(baseline["amount_p95"] or avg * 2)
        p99 = float(baseline["amount_p99"] or avg * 3)
        baseline_source = "history" if baseline["history_count"] >= COLD_START_THRESHOLD else "profile_history_fallback"
    elif profile:
        avg = float(profile.get("amount_mean", amount) or amount or 1000)
        std = float(profile.get("amount_std", avg) or avg or 500)
        median = float(profile.get("amount_median", avg) or avg)
        p95 = float(profile.get("amount_p95", avg * 2))
        p99 = float(profile.get("amount_p99", avg * 3))
        baseline_source = "profile"
    else:
        # Truly no baseline — neutral but flag cold_start
        avg = amount or 1000
        std = avg or 500
        median = avg * 0.8
        p95 = avg * 2
        p99 = avg * 3
        baseline_source = "none_neutral"

    # Ensure std not zero
    if std < 1:
        std = max(avg * 0.3, 100)
    # Use 1 for division safety
    avg_safe = avg or 1
    median_safe = median or 1

    zscore = float(np.clip((amount - avg) / std, -10, 10))
    vs_avg = amount / avg_safe
    vs_med = amount / median_safe
    bal_drop = amount / bal_before

    if amount >= p99:
        pct = 0.99
    elif amount >= p95:
        pct = 0.95
    elif amount >= avg + std:
        pct = 0.84
    elif amount >= median:
        pct = 0.50
    else:
        pct = 0.25

    # Merchant / category familiarity — from profile, fallback to txn
    merch_freq = float(txn.get("merchant_frequency_score", 0.5))
    if profile and "merch_freq" in profile:
        # try to use actual merchant name freq
        merch_name = txn.get("merchant_name", "") or txn.get("merchant_category", "")
        # simplistic: if merch in profile, use that
        pf = profile.get("merch_freq", {})
        if merch_name in pf:
            merch_freq = float(pf[merch_name])
    cat_fam = 0.0
    if profile:
        cat_fam = float(profile.get("cat_freq", {}).get(txn.get("merchant_category", ""), 0.0))
    # fallback to txn's category_familiarity if provided
    if "category_familiarity" in txn:
        cat_fam = float(txn.get("category_familiarity", cat_fam))

    # Hour-derived
    peak_hours = baseline.get("peak_hours", set())
    if not peak_hours and profile:
        peak_hours = set(profile.get("peak_hours", set()))
    hour_freq = baseline.get("hour_freq", {}).get(hour, 0.0)
    if hour_freq == 0 and profile:
        hour_freq = float(profile.get("hour_freq", {}).get(hour, 0.0))
    wknd_ratio = float(baseline.get("weekend_ratio", 0.3))

    # Recipient
    recipient = txn.get("merchant_name", "") or txn.get("recipient", "") or txn.get("recipient_name", "")
    # txn may have explicit recipient_frequency_score — prefer computed from history
    txn_recip_freq = txn.get("recipient_frequency_score")
    if baseline["history_count"] >= 2:
        recip_freq, days_since = _recipient_metrics(recipient or txn.get("merchant_name",""), baseline)
        # if explicit score provided and history is cold, blend?
        if txn_recip_freq is not None and baseline["history_count"] < COLD_START_THRESHOLD:
            # average
            recip_freq = (float(recip_freq) + float(txn_recip_freq)) / 2
    else:
        recip_freq = float(txn_recip_freq) if txn_recip_freq is not None else 0.0
        days_since = int(txn.get("days_since_recipient_seen", 999))

    # Device/location familiarity — explicit or from txn
    dev_fam = float(device_familiarity if device_familiarity is not None else txn.get("device_familiarity", 1.0))
    loc_fam = float(location_familiarity if location_familiarity is not None else txn.get("location_familiarity", 1.0))

    # Account age
    acc_age = float(txn.get("account_age_days", 365))

    # Velocity from history timestamps (bounded windows)
    # Use provided txn velocity if history not available, else compute from DB
    now_epoch = time.time()
    history_epochs = _parse_history_timestamps(history)
    if history_epochs:
        v1h = sum(1 for e in history_epochs if now_epoch - e < 3600) + 1
        v24h = sum(1 for e in history_epochs if now_epoch - e < 86400) + 1
        # amount velocity 24h = sum of amounts in 24h + current amount
        amt_24h = amount
        for h in history:
            try:
                e = calendar.timegm(time.strptime(h["timestamp"], "%Y-%m-%dT%H:%M:%SZ"))
                if now_epoch - e < 86400:
                    amt_24h += float(h.get("amount", 0))
            except Exception:
                continue
    else:
        v1h = int(txn.get("txn_velocity_1h", 1))
        v24h = int(txn.get("txn_velocity_24h", 1))
        amt_24h = float(txn.get("amount_velocity_24h", amount))

    # weekend deviation: absolute difference between is_weekend and user's weekend_ratio
    weekend_dev = abs(float(is_weekend) - wknd_ratio)

    # Encoded categoricals
    merch_encoded = CAT_ORDER.get(txn.get("merchant_category", ""), len(CAT_ORDER))
    pm_encoded = PM_ORDER.get(txn.get("payment_method", ""), len(PM_ORDER))
    is_p2p = 1 if txn.get("recipient_type") == "individual" else 0

    # Cyclical encodings
    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)
    day_sin = math.sin(2 * math.pi * dow / 7)
    day_cos = math.cos(2 * math.pi * dow / 7)

    is_rare = 1 if merch_freq < 0.05 else 0
    is_night = 1 if 0 <= hour <= 5 else 0
    is_peak = 1 if hour in peak_hours else 0

    vec_list = [
        amount,                # 0
        hour,                  # 1
        is_weekend,            # 2
        is_salary,             # 3
        merch_freq,            # 4
        float(recip_freq),     # 5
        float(days_since),     # 6
        dev_fam,               # 7
        loc_fam,               # 8
        acc_age,               # 9
        zscore,                # 10
        vs_avg,                # 11
        vs_med,                # 12
        pct,                   # 13
        bal_drop,              # 14
        hour_sin,              # 15
        hour_cos,              # 16
        day_sin,               # 17
        day_cos,               # 18
        is_rare,               # 19
        is_night,              # 20
        is_peak,               # 21
        hour_freq,             # 22
        cat_fam,               # 23
        float(v1h),            # 24
        float(v24h),           # 25
        float(amt_24h),        # 26
        weekend_dev,           # 27
        merch_encoded,         # 28
        pm_encoded,            # 29
        is_p2p,                # 30
    ]

    features_dict = {name: float(val) for name, val in zip(FEATURE_ORDER, vec_list)}
    diagnostics = {
        "baseline_source": baseline_source,
        "history_count": baseline["history_count"],
        "cold_start": baseline["cold_start"],
        "profile_used": bool(profile),
        "amount_baseline": {"mean": avg, "median": median, "std": std, "p95": p95, "p99": p99},
    }

    vec = np.array(vec_list, dtype=np.float64).reshape(1, -1)
    return vec, features_dict, diagnostics
