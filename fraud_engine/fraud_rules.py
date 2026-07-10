"""
IronWallet – Fraud Intelligence Layer
======================================
fraud_rules.py  –  Single source of truth for all 19 fraud patterns.

Adding a new rule = adding ONE entry to ALL_RULES.  No other file needs editing.

Pattern categories
------------------
AMOUNT      – transaction value anomalies
RECIPIENT   – recipient trust & history signals
TIMING      – temporal fraud signals
VELOCITY    – volume / rate-based attacks
BALANCE     – balance drain patterns
DEVICE      – device / session signals
LOCATION    – geographic / IP signals
BEHAVIOURAL – sequence & contextual patterns
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class PatternCategory(str, Enum):
    AMOUNT      = "AMOUNT"
    RECIPIENT   = "RECIPIENT"
    TIMING      = "TIMING"
    VELOCITY    = "VELOCITY"
    BALANCE     = "BALANCE"
    DEVICE      = "DEVICE"
    LOCATION    = "LOCATION"
    BEHAVIOURAL = "BEHAVIOURAL"


class Severity(str, Enum):
    LOW      = "LOW"
    MEDIUM   = "MEDIUM"
    HIGH     = "HIGH"
    CRITICAL = "CRITICAL"


@dataclass(frozen=True)
class FraudRule:
    """Immutable descriptor for a single fraud pattern."""
    id            : str
    name          : str
    category      : PatternCategory
    severity      : Severity
    base_weight   : float          # contribution to fraud_score  (0–25)
    description   : str            # analyst-facing technical note
    user_message  : str            # plain-English user-facing text
    # Optional match thresholds (pattern_matcher interprets these)
    amount_multiplier   : Optional[float] = None
    balance_drain_pct   : Optional[float] = None
    velocity_count      : Optional[int]   = None
    velocity_window_min : Optional[int]   = None
    hour_start          : Optional[int]   = None
    hour_end            : Optional[int]   = None
    round_amount_min    : Optional[float] = None
    days_since_seen     : Optional[int]   = None
    report_count        : Optional[int]   = None


# ─────────────────────────────────────────────────────────────────────────────
#  RULE REGISTRY  (19 patterns across 8 categories)
# ─────────────────────────────────────────────────────────────────────────────

ALL_RULES: list = [

    # ── AMOUNT ────────────────────────────────────────────────────────────────

    FraudRule(
        id="HIGH_AMOUNT", name="High Amount",
        category=PatternCategory.AMOUNT, severity=Severity.MEDIUM,
        base_weight=10.0, amount_multiplier=2.5,
        description="Amount exceeds 2.5× the user's historical average.",
        user_message="Amount is significantly above your typical spending.",
    ),
    FraudRule(
        id="EXTREME_AMOUNT", name="Extreme Amount",
        category=PatternCategory.AMOUNT, severity=Severity.HIGH,
        base_weight=18.0, amount_multiplier=6.0,
        description="Amount exceeds 6× the user's historical average — rare even for legitimate high-value payments.",
        user_message="This amount is far outside your normal transaction range.",
    ),
    FraudRule(
        id="ROUND_AMOUNT_LARGE", name="Suspiciously Round Amount",
        category=PatternCategory.AMOUNT, severity=Severity.LOW,
        base_weight=5.0, round_amount_min=10_000.0,
        description="Large round-number amounts (₹10k / ₹50k / ₹1L) are commonly dictated by social-engineering scammers.",
        user_message="Large round-number payment — commonly seen in scam requests.",
    ),

    # ── RECIPIENT ─────────────────────────────────────────────────────────────

    FraudRule(
        id="NEW_RECIPIENT", name="New Recipient",
        category=PatternCategory.RECIPIENT, severity=Severity.MEDIUM,
        base_weight=12.0, days_since_seen=999,
        description="Recipient has never received a transfer from this user.",
        user_message="You have never sent money to this recipient before.",
    ),
    FraudRule(
        id="RARE_RECIPIENT", name="Rarely Contacted Recipient",
        category=PatternCategory.RECIPIENT, severity=Severity.LOW,
        base_weight=6.0, days_since_seen=60,
        description="Recipient last seen 60+ days ago.",
        user_message="You haven't sent money to this person in a long time.",
    ),
    FraudRule(
        id="REPORTED_RECIPIENT", name="Reported Recipient",
        category=PatternCategory.RECIPIENT, severity=Severity.CRITICAL,
        base_weight=25.0, report_count=1,
        description="Recipient has ≥1 fraud report from other IronWallet users.",
        user_message="This recipient has been flagged by other users for suspicious activity.",
    ),
    FraudRule(
        id="HIGH_RISK_RECIPIENT", name="High-Risk Recipient",
        category=PatternCategory.RECIPIENT, severity=Severity.CRITICAL,
        base_weight=25.0, report_count=3,
        description="Recipient has 3+ fraud reports — strongly correlated with confirmed fraud.",
        user_message="Multiple users have reported this recipient for fraud.",
    ),
    FraudRule(
        id="OFF_NETWORK_RECIPIENT", name="Off-Network Recipient",
        category=PatternCategory.RECIPIENT, severity=Severity.MEDIUM,
        base_weight=8.0,
        description="Recipient UPI ID is not registered in the IronWallet network.",
        user_message="Recipient is outside the trusted UPI network — identity cannot be verified.",
    ),

    # ── TIMING ────────────────────────────────────────────────────────────────

    FraudRule(
        id="ODD_HOUR", name="Odd Hour",
        category=PatternCategory.TIMING, severity=Severity.HIGH,
        base_weight=14.0, hour_start=1, hour_end=5,
        description="Transaction between 1–5 AM — prime account-takeover window.",
        user_message="Transaction at an unusual hour (1–5 AM).",
    ),
    FraudRule(
        id="LATE_NIGHT", name="Late Night",
        category=PatternCategory.TIMING, severity=Severity.LOW,
        base_weight=5.0, hour_start=23, hour_end=1,
        description="Transaction after 11 PM. Mild alone; amplified with other signals.",
        user_message="Transaction after 11 PM — slightly outside normal hours.",
    ),

    # ── VELOCITY ──────────────────────────────────────────────────────────────

    FraudRule(
        id="HIGH_VELOCITY_5M", name="Rapid Transactions (5 min)",
        category=PatternCategory.VELOCITY, severity=Severity.HIGH,
        base_weight=16.0, velocity_count=3, velocity_window_min=5,
        description="3+ transactions in <5 minutes — automated attack signature.",
        user_message="Multiple transactions in a very short time — possible automated fraud.",
    ),
    FraudRule(
        id="HIGH_VELOCITY_1H", name="High Volume (1 hour)",
        category=PatternCategory.VELOCITY, severity=Severity.MEDIUM,
        base_weight=10.0, velocity_count=6, velocity_window_min=60,
        description="6+ transactions within one hour.",
        user_message="Unusually high number of transactions in the past hour.",
    ),
    FraudRule(
        id="RECIPIENT_SWITCHING", name="Rapid Recipient Switching",
        category=PatternCategory.VELOCITY, severity=Severity.HIGH,
        base_weight=15.0, velocity_count=3, velocity_window_min=30,
        description="3+ different recipients in 30 min — account-drain attack pattern.",
        user_message="Sending to multiple new recipients in quick succession.",
    ),

    # ── BALANCE ───────────────────────────────────────────────────────────────

    FraudRule(
        id="BALANCE_DRAIN_HIGH", name="High Balance Drain",
        category=PatternCategory.BALANCE, severity=Severity.MEDIUM,
        base_weight=10.0, balance_drain_pct=0.40,
        description="Transaction consumes 40–69% of available balance.",
        user_message="This payment uses a large portion of your available balance.",
    ),
    FraudRule(
        id="BALANCE_DRAIN_CRITICAL", name="Critical Balance Drain",
        category=PatternCategory.BALANCE, severity=Severity.CRITICAL,
        base_weight=22.0, balance_drain_pct=0.70,
        description="Transaction would consume 70%+ of balance — account-emptying signature.",
        user_message="This payment would drain most of your balance in one transaction.",
    ),

    # ── DEVICE ────────────────────────────────────────────────────────────────

    FraudRule(
        id="NEW_DEVICE", name="Unfamiliar Device",
        category=PatternCategory.DEVICE, severity=Severity.HIGH,
        base_weight=18.0,
        description="Transaction from a device not previously associated with this account.",
        user_message="This payment is coming from a device you don't normally use.",
    ),

    # ── LOCATION ──────────────────────────────────────────────────────────────

    FraudRule(
        id="LOCATION_ANOMALY", name="Unusual Location",
        category=PatternCategory.LOCATION, severity=Severity.HIGH,
        base_weight=15.0,
        description="Transaction origin differs significantly from user's known geographic pattern.",
        user_message="This payment is coming from an unusual location.",
    ),

    # ── BEHAVIOURAL ───────────────────────────────────────────────────────────

    FraudRule(
        id="SEQUENTIAL_AMOUNTS", name="Sequential Amount Pattern",
        category=PatternCategory.BEHAVIOURAL, severity=Severity.HIGH,
        base_weight=16.0,
        description="Recent transactions show incrementing amounts — classic card/wallet testing technique.",
        user_message="Recent transactions follow a suspicious incremental pattern.",
    ),
    FraudRule(
        id="URGENCY_LANGUAGE", name="Urgency Language",
        category=PatternCategory.BEHAVIOURAL, severity=Severity.MEDIUM,
        base_weight=8.0,
        description="Payment note contains urgency-loaded language used in social-engineering scams.",
        user_message="Payment note uses pressure language often seen in scam requests.",
    ),
    FraudRule(
        id="DAILY_LIMIT_APPROACH", name="Daily Limit Approach",
        category=PatternCategory.BEHAVIOURAL, severity=Severity.LOW,
        base_weight=6.0,
        description="Daily spend including this transaction exceeds 80% of user's typical daily budget.",
        user_message="Today's total spending is approaching your typical daily limit.",
    ),
]

RULES_BY_ID: dict = {r.id: r for r in ALL_RULES}
