import json, pathlib, itertools
from fastapi.testclient import TestClient
from otp_server import app
import iron_store
from risk_engine.thresholds import RISK_WEIGHTS

client = TestClient(app)
def token_for(phone):
    return iron_store.create_session(phone)

# Load cases
cases = json.loads(pathlib.Path("benchmark_300_cases.json").read_text(encoding="utf-8"))
# Filter tier cases
tier_cases = [c for c in cases if c["expected_risk"] != "INVALID"]

configs = [
    {"behavior":0.35,"fraud":0.40,"recipient":0.15,"context":0.10}, # current
    {"behavior":0.30,"fraud":0.35,"recipient":0.20,"context":0.15},
    {"behavior":0.25,"fraud":0.45,"recipient":0.15,"context":0.15},
    {"behavior":0.40,"fraud":0.30,"recipient":0.20,"context":0.10},
    {"behavior":0.30,"fraud":0.40,"recipient":0.15,"context":0.15},
    {"behavior":0.20,"fraud":0.40,"recipient":0.25,"context":0.15},
]

import otp_server, risk_engine.thresholds as thr
import risk_engine.engine as eng

for cfg in configs:
    # Patch weights
    thr.RISK_WEIGHTS = cfg
    eng.RISK_WEIGHTS = cfg
    # Need to also update otp_server's imported RISK_WEIGHTS? It imports from thresholds, but engine uses thresholds directly, so okay
    # Clear rate limits
    from otp_server import _assistant_attempts
    _assistant_attempts.clear()
    correct=0
    total=0
    for case in tier_cases:
        feats=case["features"]
        if feats.get("direct_tier_test"):
            from risk_engine.thresholds import iron_tier
            pred=iron_tier(feats["score"])
            exp=case["expected_risk"]
            if pred==exp:
                correct+=1
            total+=1
            continue
        phone=feats.get("user_id","9000000099")
        hdr={"Authorization": f"Bearer {token_for(phone)}"}
        txn={
            "user_id": phone,
            "amount": feats.get("amount",500),
            "hour_of_day": feats.get("hour_of_day",12),
            "day_of_week": "Monday",
            "is_weekend":0,
            "is_salary_period":0,
            "merchant_name": feats.get("merchant_name","9158763151"),
            "merchant_category":"Transfer",
            "recipient_type":"individual",
            "payment_method":"UPI",
            "device_familiarity": feats.get("device_familiarity",1.0),
            "location_familiarity": feats.get("location_familiarity",1.0),
            "balance_before": 100000,
            "account_age_days":365,
            "recipient_frequency_score":0.0,
            "days_since_recipient_seen":999,
            "merchant_frequency_score":0.5,
            "recipient_report_count":0,
            "is_off_network":False,
            "urgency_score":0.0,
            "note": feats.get("note",""),
            "txn_velocity_1h":1,"txn_velocity_5m":1,"txn_velocity_24h":1,"unique_recipients_30m":1,"amount_velocity_24h":0,"recent_amounts":[],"daily_spend_today":0
        }
        # Need to handle scam registry report count
        import scam_registry
        txn["recipient_report_count"]=scam_registry.get_recipient_risk(feats.get("merchant_name","")).get("report_count",0)
        profile={"user_id":phone}
        r=client.post("/risk/assess", json={"transaction":txn,"user_profile":profile}, headers=hdr)
        if r.status_code!=200:
            continue
        pred=r.json().get("tier")
        exp=case["expected_risk"]
        if pred==exp:
            correct+=1
        total+=1
    acc=correct/total*100 if total else 0
    print(f"Weights {cfg} -> accuracy {acc:.1f}% {correct}/{total}")

# Restore original
thr.RISK_WEIGHTS = {"behavior":0.35,"fraud":0.40,"recipient":0.15,"context":0.10}
eng.RISK_WEIGHTS = thr.RISK_WEIGHTS
