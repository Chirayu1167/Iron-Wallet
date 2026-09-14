import json, pathlib, random
random.seed(42)
cases=json.loads(pathlib.Path("benchmark_binary_500_cases.json").read_text(encoding="utf-8"))
# Count
from collections import Counter
print(Counter(c["expected_binary"] for c in cases))
# Need 24 more legit
def base(amount, rec, hour=12, note="", dev=1.0, loc=1.0, phone="9000000099"):
    return {"user_id":phone,"amount":amount,"hour_of_day":hour,"day_of_week":"Monday","is_weekend":0,"is_salary_period":0,"merchant_name":rec,"merchant_category":"Transfer","recipient_type":"individual","payment_method":"UPI","device_familiarity":dev,"location_familiarity":loc,"balance_before":100000,"account_age_days":365,"recipient_frequency_score":0.0,"days_since_recipient_seen":999,"merchant_frequency_score":0.5,"recipient_report_count":0,"is_off_network":False,"urgency_score":0.0,"note":note,"txn_velocity_1h":1,"txn_velocity_5m":1,"txn_velocity_24h":1,"unique_recipients_30m":1,"amount_velocity_24h":0,"recent_amounts":[],"daily_spend_today":0}
# Add 24 legit
start=len([c for c in cases if c["expected_binary"]=="LEGITIMATE"])
for i in range(24):
    phone=f"LEG_EXTRA{i:03d}"
    amt=random.choice([500,600,700])
    hr=random.choice([10,11,12,13])
    case={"case_id":f"B{len(cases)+i+1:04d}","category":"NORMAL","scenario":"Extra normal","expected_binary":"LEGITIMATE","expected_tier":"SAFE","expected_reason":"Extra to reach 250","features":base(amt,"9158763151",hr,"",1.0,1.0, phone=phone)}
    cases.append(case)

# Now trim to exactly 500 with 250 each
legit=[c for c in cases if c["expected_binary"]=="LEGITIMATE"]
fraud=[c for c in cases if c["expected_binary"]=="FRAUDULENT"]
print(f"Before: legit {len(legit)} fraud {len(fraud)}")
random.shuffle(legit)
random.shuffle(fraud)
legit=legit[:250]
fraud=fraud[:250]
cases=legit+fraud
random.shuffle(cases)
print(f"After: legit {len([c for c in cases if c['expected_binary']=='LEGITIMATE'])} fraud {len([c for c in cases if c['expected_binary']=='FRAUDULENT'])} total {len(cases)}")
pathlib.Path("benchmark_binary_500_cases.json").write_text(json.dumps(cases, indent=2), encoding="utf-8")
# Split
import random as rnd
rnd.seed(42)
rnd.shuffle(cases)
dev=cases[:300]
val=cases[300:400]
final=cases[400:500]
pathlib.Path("benchmark_binary_500_dev.json").write_text(json.dumps(dev, indent=2), encoding="utf-8")
pathlib.Path("benchmark_binary_500_val.json").write_text(json.dumps(val, indent=2), encoding="utf-8")
pathlib.Path("benchmark_binary_500_final.json").write_text(json.dumps(final, indent=2), encoding="utf-8")
print("Fixed")
