"""
pattern_matcher.py  –  Stateless rule evaluator.
Receives a normalised signal dict and returns the subset of FraudRules that fired.
"""
from __future__ import annotations
from typing import Callable, Dict, List
from .fraud_rules import ALL_RULES, FraudRule

Signals = Dict[str, object]
MatchFn = Callable[[FraudRule, Signals], bool]

def _match_high_amount(rule, s):
    avg = float(s.get("user_avg_amount", 1)) or 1
    return float(s.get("amount", 0)) / avg >= rule.amount_multiplier

def _match_round_amount(rule, s):
    a = float(s.get("amount", 0))
    return a >= rule.round_amount_min and a % 500 == 0

def _match_new_recipient(rule, s):
    if not s.get("is_p2p"): return False
    return int(s.get("days_since_recipient_seen", 0)) >= rule.days_since_seen \
        or float(s.get("recipient_frequency_score", 1)) < 0.05

def _match_rare_recipient(rule, s):
    if not s.get("is_p2p"): return False
    days = int(s.get("days_since_recipient_seen", 0))
    freq = float(s.get("recipient_frequency_score", 1))
    return rule.days_since_seen <= days < 999 and freq < 0.5

def _match_reported(rule, s):
    return int(s.get("recipient_report_count", 0)) >= rule.report_count

def _match_off_network(rule, s):
    return bool(s.get("is_off_network", False))

def _match_odd_hour(rule, s):
    h = int(s.get("hour_of_day", 12))
    return rule.hour_start <= h < rule.hour_end

def _match_late_night(rule, s):
    h = int(s.get("hour_of_day", 12))
    return h >= rule.hour_start or h < rule.hour_end

def _match_vel_5m(rule, s):
    return int(s.get("txn_velocity_5m", 0)) >= rule.velocity_count

def _match_vel_1h(rule, s):
    return int(s.get("txn_velocity_1h", 0)) >= rule.velocity_count

def _match_recip_switch(rule, s):
    return int(s.get("unique_recipients_30m", 0)) >= rule.velocity_count

def _match_drain_high(rule, s):
    d = float(s.get("balance_drain_pct", 0))
    return rule.balance_drain_pct <= d < 0.70

def _match_drain_critical(rule, s):
    return float(s.get("balance_drain_pct", 0)) >= rule.balance_drain_pct

def _match_new_device(rule, s):
    return float(s.get("device_familiarity", 1.0)) < 0.5

def _match_location(rule, s):
    return float(s.get("location_familiarity", 1.0)) < 0.5

def _match_sequential(rule, s):
    seq = s.get("recent_amounts", [])
    if len(seq) < 3: return False
    return all(seq[i] >= seq[i-1] * 1.5 for i in range(1, len(seq)))

def _match_urgency(rule, s):
    return float(s.get("urgency_score", 0)) > 0.2

def _match_daily_limit(rule, s):
    return float(s.get("daily_spend_ratio", 0)) >= 0.80

_MATCHERS: Dict[str, MatchFn] = {
    "HIGH_AMOUNT":           _match_high_amount,
    "EXTREME_AMOUNT":        _match_high_amount,
    "ROUND_AMOUNT_LARGE":    _match_round_amount,
    "NEW_RECIPIENT":         _match_new_recipient,
    "RARE_RECIPIENT":        _match_rare_recipient,
    "REPORTED_RECIPIENT":    _match_reported,
    "HIGH_RISK_RECIPIENT":   _match_reported,
    "OFF_NETWORK_RECIPIENT": _match_off_network,
    "ODD_HOUR":              _match_odd_hour,
    "LATE_NIGHT":            _match_late_night,
    "HIGH_VELOCITY_5M":      _match_vel_5m,
    "HIGH_VELOCITY_1H":      _match_vel_1h,
    "RECIPIENT_SWITCHING":   _match_recip_switch,
    "BALANCE_DRAIN_HIGH":    _match_drain_high,
    "BALANCE_DRAIN_CRITICAL":_match_drain_critical,
    "NEW_DEVICE":            _match_new_device,
    "LOCATION_ANOMALY":      _match_location,
    "SEQUENTIAL_AMOUNTS":    _match_sequential,
    "URGENCY_LANGUAGE":      _match_urgency,
    "DAILY_LIMIT_APPROACH":  _match_daily_limit,
}

def match_patterns(signals: Signals) -> List[FraudRule]:
    """Evaluate all rules. Return fired rules sorted by base_weight desc."""
    fired = []
    for rule in ALL_RULES:
        fn = _MATCHERS.get(rule.id)
        if fn is None: continue
        try:
            if fn(rule, signals): fired.append(rule)
        except Exception: pass
    fired.sort(key=lambda r: -r.base_weight)
    return fired
