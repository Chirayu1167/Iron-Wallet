"""
Generate 300-case benchmark for Iron — deterministic, reproducible, independent expected labels.
"""
import json, random, pathlib, time
from datetime import datetime

SEED = 42
random.seed(SEED)

cases = []
case_id = 1
def next_id():
    global case_id
    cid = f"C{case_id:03d}"
    case_id += 1
    return cid

def add_case(category, scenario, expected, reason, features):
    cases.append({
        "case_id": next_id(),
        "category": category,
        "scenario": scenario,
        "expected_risk": expected,
        "expected_reason": reason,
        "features": features
    })

def base_features(amount, recipient, hour=12, note="", device=1.0, location=1.0, phone="9000000099"):
    return {
        "user_id": phone,
        "amount": amount,
        "hour_of_day": hour,
        "day_of_week": "Monday",
        "is_weekend": 0,
        "is_salary_period": 0,
        "merchant_name": recipient,
        "merchant_category": "Transfer",
        "recipient_type": "individual",
        "payment_method": "UPI",
        "device_familiarity": device,
        "location_familiarity": location,
        "balance_before": 100000,
        "account_age_days": 365,
        "recipient_frequency_score": 0.0,
        "days_since_recipient_seen": 999,
        "merchant_frequency_score": 0.5,
        "recipient_report_count": 0,
        "is_off_network": False,
        "urgency_score": 0.0,
        "note": note,
        "txn_velocity_1h": 1,
        "txn_velocity_5m": 1,
        "txn_velocity_24h": 1,
        "unique_recipients_30m": 1,
        "amount_velocity_24h": 0,
        "recent_amounts": [],
        "daily_spend_today": 0
    }

# 1. NORMAL — 30 SAFE
for i in range(30):
    amt = random.choice([500,600,700,800,900,450,550])
    hour = random.choice([10,11,12,13,14,15,16])
    add_case("NORMAL", f"Normal {i+1}", "SAFE", "Known recipient, typical amount/time/device", base_features(amt, "9158763151", hour, random.choice(["","lunch","coffee"]), 1.0, 1.0))

# 2. AMOUNT — 30 (10 SAFE,10 CAUTION,10 HIGH_RISK)
for i in range(10):
    amt = random.choice([650,800,950])
    add_case("AMOUNT", f"Slightly above {i+1}", "SAFE", "1.2-1.9x avg, known recipient", base_features(amt, "9158763151", 12, "", 1.0, 1.0))
for i in range(10):
    amt = random.choice([1000,1500,2000])
    add_case("AMOUNT", f"2-4x normal {i+1}", "CAUTION", "2-4x avg moderate anomaly", base_features(amt, "9158763151", 12, "", 1.0, 1.0))
for i in range(10):
    amt = random.choice([5000,10000,20000,50000])
    add_case("AMOUNT", f"10x+ normal {i+1}", "HIGH_RISK", "10x+ avg strong anomaly", base_features(amt, "9158763151", 12, "", 1.0, 1.0))

# 3. RECIPIENT — 30
for i in range(10):
    add_case("RECIPIENT", f"Frequent {i+1}", "SAFE", "Frequent recipient, small amount", base_features(500, "9158763151", 12, "", 1.0, 1.0))
for i in range(10):
    new_rec = f"999990{i:04d}"[:10]
    new_rec = (new_rec + "0"*10)[:10]
    add_case("RECIPIENT", f"New {i+1}", "CAUTION", "New recipient, small amount (single signal)", base_features(500, new_rec, 12, "", 1.0, 1.0))
for i in range(10):
    add_case("RECIPIENT", f"Reported {i+1}", "HIGH_RISK", "Reported 3 reports", base_features(500, "9998887776", 12, "", 1.0, 1.0))

# 4. TIME — 20
for i in range(10):
    hour = random.choice([10,11,12,13,14,15])
    add_case("TIME", f"Normal hour {i+1}", "SAFE", "Normal hour", base_features(500, "9158763151", hour, "", 1.0, 1.0))
for i in range(10):
    hour = random.choice([1,2,3,4])
    add_case("TIME", f"Unusual hour {i+1}", "CAUTION", "Very unusual hour 1-4am", base_features(500, "9158763151", hour, "", 1.0, 1.0))

# 5. VELOCITY — 20
for i in range(10):
    add_case("VELOCITY", f"Normal velocity {i+1}", "SAFE", "Normal frequency", base_features(500, "9158763151", 12, "", 1.0, 1.0, phone="9000000099"))
for i in range(5):
    add_case("VELOCITY", f"5 quickly {i+1}", "CAUTION", "5 transactions quickly", base_features(500, "9158763151", 12, "", 1.0, 1.0, phone="VELOCITY_BURST_5"))
for i in range(5):
    add_case("VELOCITY", f"10+ rapid {i+1}", "HIGH_RISK", "10+ rapid", base_features(500, "9158763151", 12, "", 1.0, 1.0, phone="VELOCITY_BURST_10"))

# 6. SOCIAL — 30
clean_notes = ["lunch", "coffee", "rent", "", "split bill"]
suspicious_notes = ["urgent payment required","KYC verification pending","lottery prize claim","impersonation RBI please verify","refund processing fee","investment opportunity guaranteed return","job offer send money","customer support please share otp","send money to receive money","credential update required"]
scam_notes = ["OTP required verify account immediately","KYC blocked account will be frozen","lottery prize claim urgent","impersonation CBI account verification","refund scam urgent prize"]
for i in range(10):
    note = random.choice(clean_notes)
    add_case("SOCIAL", f"Clean note {i+1}", "SAFE", "Clean note", base_features(500, "9158763151", 12, note, 1.0, 1.0))
for i in range(10):
    note = random.choice(suspicious_notes)
    add_case("SOCIAL", f"Suspicious note {i+1}", "CAUTION", "Single scam keyword", base_features(500, "9158763151", 12, note, 1.0, 1.0))
for i in range(10):
    note = random.choice(scam_notes) + " urgent prize claim otp"
    add_case("SOCIAL", f"Obvious scam {i+1}", "HIGH_RISK", "Multiple scam keywords", base_features(500, "9158763151", 12, note, 1.0, 1.0))

# 7. DEVICE — 20
for i in range(10):
    add_case("DEVICE", f"Known device {i+1}", "SAFE", "Familiar device/location", base_features(500, "9158763151", 12, "", 1.0, 1.0))
for i in range(5):
    add_case("DEVICE", f"Unfamiliar device {i+1}", "CAUTION", "Unfamiliar device", base_features(500, "9158763151", 12, "", 0.2, 1.0))
for i in range(5):
    add_case("DEVICE", f"Unfamiliar location {i+1}", "CAUTION", "Unfamiliar location", base_features(500, "9158763151", 12, "", 1.0, 0.2))

# 8. COMBINED — 30 (all HIGH_RISK)
for i in range(30):
    amt = random.choice([5000,10000,20000,40000])
    rec = random.choice(["9999900011","9999900012","9998887776"])
    hour = random.choice([2,3,12])
    note = random.choice(["urgent prize claim","otp verify","","lottery prize"])
    dev = random.choice([0.2,1.0])
    loc = random.choice([0.2,1.0])
    add_case("COMBINED", f"Combined {i+1}", "HIGH_RISK", "Multiple independent signals", base_features(amt, rec, hour, note, dev, loc))

# 9. COLD START — 20
for i in range(10):
    phone = f"90000001{i:02d}"
    add_case("COLD_START", f"Cold start small {i+1}", "SAFE", "No history, small amount known recipient", base_features(500, "9158763151", 12, "", 1.0, 1.0, phone=phone))
for i in range(10):
    phone = f"90000002{i:02d}"
    amt = random.choice([5000,10000])
    add_case("COLD_START", f"Cold start large {i+1}", "CAUTION", "No history, large amount", base_features(amt, "9999900001", 12, "urgent", 0.2, 1.0, phone=phone))

# 10. CONFLICTING — 30
for i in range(10):
    add_case("CONFLICTING", f"New tiny {i+1}", "SAFE", "New recipient but very small amount", base_features(random.choice([10,20,50]), f"999990{i:04d}"[:10], 12, "", 1.0, 1.0))
for i in range(10):
    add_case("CONFLICTING", f"Large familiar {i+1}", "CAUTION", "Large amount but familiar recipient", base_features(20000, "9158763151", 12, "", 1.0, 1.0))
for i in range(10):
    add_case("CONFLICTING", f"Reported small {i+1}", "CAUTION", "Reported but small amount familiar", base_features(500, "9998887776", 12, "", 1.0, 1.0))

# 11. INPUT EDGE — 20 (14 INVALID, 6 SAFE)
edge_cases = [
    (1, "9999900001", "zero amount edge"),
    (0, "9158763151", "zero amount"),
    (-100, "9158763151", "negative amount"),
    (500, "", "empty recipient"),
    (500, "abc", "invalid recipient"),
    (500, "123", "short recipient"),
    (500, "9158763151@", "invalid UPI"),
    (1000000, "9158763151", "max reasonable"),
    (1000001, "9158763151", "over limit 1M"),
    (1, "9158763151", "minimum 1"),
    (500, None, "missing recipient"),
    (None, "9158763151", "missing amount"),
    (500, "9158763151", "duplicate attempt"),
    (500, "9158763151", "missing optional context"),
]
for i, (amt, rec, desc) in enumerate(edge_cases):
    features = base_features(amt if amt is not None else 500, rec if rec is not None else "9158763151", 12, "", 1.0, 1.0)
    if amt is None:
        features.pop("amount", None)
    if rec is None:
        features.pop("merchant_name", None)
    exp = "INVALID" if desc in ["zero amount","negative amount","empty recipient","invalid recipient","short recipient","invalid UPI","over limit 1M","missing recipient","missing amount"] else "SAFE"
    # For our list, first 9 are invalid, rest safe
    if i < 9:
        exp = "INVALID"
    elif i in [9,13]:
        exp = "SAFE"
    else:
        exp = "INVALID" if i in [10,11] else "SAFE"
    # Simplify: use INVALID for clearly invalid, else SAFE
    add_case("INPUT_EDGE", f"Edge {desc} {i+1}", exp, f"Input edge: {desc}", features)
for i in range(len(edge_cases), 20):
    add_case("INPUT_EDGE", f"Edge small {i+1}", "SAFE", "Small legitimate edge", base_features(1, "9158763151", 12, "", 1.0, 1.0))

# 12. THRESHOLD — 20
threshold_cases = [
    (69, "SAFE", "Score 69 → SAFE"),
    (70, "CAUTION", "Score 70 → CAUTION"),
    (84, "CAUTION", "Score 84 → CAUTION"),
    (85, "HIGH_RISK", "Score 85 → HIGH_RISK"),
    (0, "SAFE", "Score 0 → SAFE"),
    (100, "HIGH_RISK", "Score 100 → HIGH_RISK"),
    (68, "SAFE", "Score 68 → SAFE"),
    (71, "CAUTION", "Score 71 → CAUTION"),
    (83, "CAUTION", "Score 83 → CAUTION"),
    (86, "HIGH_RISK", "Score 86 → HIGH_RISK"),
    (69, "SAFE", "Duplicate 69"),
    (70, "CAUTION", "Duplicate 70"),
    (84, "CAUTION", "Duplicate 84"),
    (85, "HIGH_RISK", "Duplicate 85"),
    (50, "SAFE", "Score 50 → SAFE"),
    (75, "CAUTION", "Score 75 → CAUTION"),
    (90, "HIGH_RISK", "Score 90 → HIGH_RISK"),
    (30, "SAFE", "Score 30 → SAFE"),
    (95, "HIGH_RISK", "Score 95 → HIGH_RISK"),
    (80, "CAUTION", "Score 80 → CAUTION"),
]
for score, exp, desc in threshold_cases:
    add_case("THRESHOLD", f"Threshold {desc}", exp, desc, {"direct_tier_test": True, "score": score, "amount": 500, "merchant_name": "9158763151"})

random.shuffle(cases)

from collections import Counter
cat_counts = Counter(c["category"] for c in cases)
label_counts = Counter(c["expected_risk"] for c in cases)
print(f"Generated {len(cases)} cases")
print(f"Categories: {cat_counts}")
print(f"Labels: {label_counts}")
print(f"Seed: {SEED}")

path = pathlib.Path("benchmark_300_cases.json")
path.write_text(json.dumps(cases, indent=2), encoding="utf-8")
pathlib.Path("benchmark_seed.txt").write_text(str(SEED), encoding="utf-8")
print(f"Saved to {path}")
