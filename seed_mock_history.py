"""
Seed distinct mock transaction histories for demo accounts.

  Chirayu (9340228345) — student lifestyle: food, travel, friends, shopping.
  Admin   (1234567890) — ops pattern: payouts, vendors, bills, test transfers.

Each gets 120 confirmed transactions spread over the last 90 days
(newest is 2 days old so velocity-based risk tests are unaffected).

Run:  python seed_mock_history.py
Re-run any time (idempotent: wipes + recreates mock rows for these 2 phones).

NOTE: test_phase23.py deletes admin transactions on import for
deterministic tests — re-run this script after running that suite.
"""
import json
import random
import sqlite3
import time
import uuid
from datetime import datetime, timedelta, timezone

import iron_store

N_PER_USER = 120
DAYS_BACK_MAX = 90
DAYS_BACK_MIN = 2  # keep mock txs out of velocity windows (5m/1h/24h)

CHIRAYU = "9340228345"
ADMIN = "1234567890"

CHIRAYU_RECIPIENTS = [
    ("9158763151", "Pranav Chopade"), ("9766876442", "Farhan Farooqui"),
    ("9876543210", "Mehul Patil"), ("9699189866", "Vedant Deshmukh"),
    ("9988776655", "Rajesh Kumar"), ("9123456789", "Amit Sharma"),
    ("8899776655", "Sneha Reddy"), ("7778889990", "Vikram Singh"),
    ("9663355221", "Zara Sheikh"), ("8765432109", "Rohan Deshmukh"),
    ("7654321098", "Kavita Sharma"), ("9699624733", "Shivshree Shinde"),
    ("9012345678", "Priya Patel"), ("8901234567", "Neha Gupta"),
    ("9988112233", "Anjali Desai"),
]
CHIRAYU_SAFE_NOTES = ["Coffee", "Lunch", "Dinner", "Movie tickets", "Cab fare",
                      "Groceries", "Gym fees", "Books", "Mobile recharge",
                      "Snacks", "Petrol split", "Rent split", "Gift",
                      "Metro card", "Laundry", "Breakfast", "Chai"]
CHIRAYU_CAUTION_NOTES = ["Online shopping", "Electronics", "Concert tickets",
                         "Flight booking", "Hotel stay", "Gadget purchase"]
CHIRAYU_RISKY_NOTES = ["Crypto investment", "Unknown merchant",
                       "Lottery prize fee", "Urgent transfer"]

ADMIN_RECIPIENTS = [
    ("9340228345", "Chirayu Mahajan"), ("9158763151", "Pranav Chopade"),
    ("9988776655", "Rajesh Kumar"), ("9123456789", "Amit Sharma"),
    ("7778889990", "Vikram Singh"), ("9000000001", "Cloud Hosting Ltd"),
    ("9000000002", "Office Landlord"), ("9000000003", "Payroll Account"),
    ("9000000004", "Security Vendor"), ("9000000005", "Test Merchant"),
    ("9111111111", "Refund Claims Desk"),
]
ADMIN_SAFE_NOTES = ["Salary payout", "Vendor payment", "Server bill",
                    "Office rent", "Refund issued", "Bonus payout",
                    "Maintenance", "Audit fee", "Test transfer",
                    "Staff reimbursement"]
ADMIN_CAUTION_NOTES = ["Bulk payout", "New vendor advance",
                       "Overseas service", "Hardware purchase"]
ADMIN_RISKY_NOTES = ["Unknown claimant verification", "High-value test",
                     "Flagged merchant probe"]


def pick_tier(rng):
    r = rng.random()
    if r < 0.70:
        return "SAFE", rng.randint(5, 38)
    if r < 0.87:
        return "CAUTION", rng.randint(45, 80)
    return "HIGH_RISK", rng.randint(85, 97)


def row_for(phone, rng, recipients, safe_notes, caution_notes, risky_notes,
            amt_ranges):
    recipient, recipient_name = rng.choice(recipients)
    tier, score = pick_tier(rng)
    if tier == "SAFE":
        note = rng.choice(safe_notes)
        amount = round(rng.uniform(*amt_ranges["safe"]), 2)
        status, vm, vs, outcome = "SUCCESS", "NONE", "NONE", "PROCEEDED"
    elif tier == "CAUTION":
        note = rng.choice(caution_notes)
        amount = round(rng.uniform(*amt_ranges["caution"]), 2)
        if score >= 65:
            status, vm, vs, outcome = ("VERIFIED", "OTP", "OTP_SUCCESS",
                                       "PROCEEDED_AFTER_OTP")
        else:
            status, vm, vs, outcome = ("VERIFIED", "NONE", "NONE", "PROCEEDED")
    else:
        note = rng.choice(risky_notes)
        amount = round(rng.uniform(*amt_ranges["risky"]), 2)
        status, vm, vs, outcome = ("HIGH_RISK", "OTP", "OTP_SUCCESS",
                                   "PROCEEDED_AFTER_OTP")
    days_ago = rng.uniform(DAYS_BACK_MIN, DAYS_BACK_MAX)
    ts = datetime.now(timezone.utc) - timedelta(days=days_ago)
    # daytime-weighted clock time
    ts = ts.replace(hour=rng.choice([9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
                                     19, 20, 21, 22, 8, 23]),
                    minute=rng.randint(0, 59), second=rng.randint(0, 59),
                    microsecond=0)
    ts_s = ts.strftime("%Y-%m-%dT%H:%M:%SZ")
    exp_s = (ts + timedelta(seconds=600)).strftime("%Y-%m-%dT%H:%M:%SZ")
    conf_s = (ts + timedelta(seconds=rng.randint(60, 240))).strftime(
        "%Y-%m-%dT%H:%M:%SZ")
    raw = json.dumps({"recipient": recipient, "amount": amount, "note": note,
                      "mock": True})
    return (str(uuid.uuid4()), phone, phone, recipient, recipient_name,
            float(amount), ts_s, status, int(score), tier, vm, vs, outcome,
            note, exp_s, conf_s, raw)


def seed_phone(phone, seed, recipients, safe_notes, caution_notes,
               risky_notes, amt_ranges):
    rng = random.Random(seed)
    rows = [row_for(phone, rng, recipients, safe_notes, caution_notes,
                    risky_notes, amt_ranges) for _ in range(N_PER_USER)]
    rows.sort(key=lambda r: r[6], reverse=True)  # newest first
    conn = iron_store._conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM transactions WHERE phone=?", (phone,))
    cur.executemany(
        "INSERT INTO transactions (transaction_id, user_id, phone, recipient,"
        " recipient_name, amount, timestamp, status, risk_score, risk_tier,"
        " verification_method, verification_status, outcome, note,"
        " expires_at, confirmed_at, raw_json)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    conn.commit()
    conn.close()
    tiers = {}
    for r in rows:
        tiers[r[9]] = tiers.get(r[9], 0) + 1
    otps = sum(1 for r in rows if r[10] == "OTP")
    print(f"[seed] {phone}: {len(rows)} txs {tiers} OTP={otps} "
          f"range {rows[-1][6][:10]}..{rows[0][6][:10]}")
    return rows


def main():
    iron_store.init_db()
    iron_store.seed_users_if_needed()
    for phone in (CHIRAYU, ADMIN):
        assert iron_store.get_user(phone), f"missing user {phone}"
    seed_phone(CHIRAYU, 42, CHIRAYU_RECIPIENTS, CHIRAYU_SAFE_NOTES,
               CHIRAYU_CAUTION_NOTES, CHIRAYU_RISKY_NOTES,
               {"safe": (80, 4000), "caution": (3000, 25000),
                "risky": (15000, 60000)})
    seed_phone(ADMIN, 1234, ADMIN_RECIPIENTS, ADMIN_SAFE_NOTES,
               ADMIN_CAUTION_NOTES, ADMIN_RISKY_NOTES,
               {"safe": (1000, 60000), "caution": (25000, 150000),
                "risky": (80000, 250000)})
    for phone in (CHIRAYU, ADMIN):
        txs = iron_store.get_transactions_for_user(phone, limit=200)
        print(f"[verify] {phone}: {len(txs)} in DB")
        assert len(txs) >= 100, f"only {len(txs)} for {phone}"
    print("[seed] OK — 100+ mock transactions each for Chirayu + Admin")


if __name__ == "__main__":
    main()
