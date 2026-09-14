import json, pathlib
from fastapi.testclient import TestClient
from otp_server import app
import iron_store
client=TestClient(app)
def token_for(phone):
    return iron_store.create_session(phone)

import risk_engine.thresholds as thr
import risk_engine.engine as eng
import otp_server

# Load dev
cases=json.loads(pathlib.Path("benchmark_500_cases.json").read_text(encoding="utf-8"))
dev=json.loads(pathlib.Path("benchmark_500_dev.json").read_text(encoding="utf-8"))

# Disable rate limits
orig=otp_server._check_generic_limit
otp_server._check_generic_limit=lambda *a,**kw: None

configs=[
    {"behavior":0.35,"fraud":0.40,"recipient":0.15,"context":0.10},
    {"behavior":0.30,"fraud":0.35,"recipient":0.20,"context":0.15},
    {"behavior":0.25,"fraud":0.45,"recipient":0.15,"context":0.15},
    {"behavior":0.40,"fraud":0.30,"recipient":0.20,"context":0.10},
    {"behavior":0.30,"fraud":0.40,"recipient":0.20,"context":0.10},
    {"behavior":0.20,"fraud":0.50,"recipient":0.20,"context":0.10},
]

thresholds=[
    (69,85),
    (65,85),
    (68,82),
    (70,84),
    (65,80),
]

best=None
for cfg in configs:
    for th_low, th_high in thresholds:
        # Patch thresholds
        orig_low, orig_high = thr.RISK_TIRESHOLDS["CAUTION"][0], thr.RISK_TIRESHOLDS["HIGH_RISK"][0]
        # Actually thresholds are defined as SAFE 0-69, CAUTION 70-84, HIGH_RISK 85-100
        # We need to patch iron_tier function? Instead we can monkey-patch thr.iron_tier
        # Simpler: patch thr.RISK_TIRESHOLDS and redefine iron_tier
        def make_tier(low, high):
            def iron_tier(s):
                s=int(round(max(0,min(100,float(s)))))
                if s>=high:
                    return "HIGH_RISK"
                if s>=low:
                    return "CAUTION"
                return "SAFE"
            return iron_tier
        thr.iron_tier=make_tier(th_low, th_high)
        eng.iron_tier=thr.iron_tier
        # Also patch otp_server's iron_tier
        import otp_server as osrv
        osrv._iron_tier=thr.iron_tier
        # Patch weights
        thr.RISK_WEIGHTS=cfg
        eng.RISK_WEIGHTS=cfg
        # Test on dev
        correct=0
        total=0
        for case in dev:
            if case["expected_risk"]=="INVALID" or case["features"].get("direct_tier_test"):
                continue
            feats=case["features"]
            phone=feats.get("user_id","9000000099")
            hdr={"Authorization": f"Bearer {token_for(phone)}"}
            txn={
                "user_id": phone,
                "amount": feats.get("amount",500),
                "hour_of_day": feats.get("hour_of_day",12),
                "day_of_week":"Monday","is_weekend":0,"is_salary_period":0,
                "merchant_name": feats.get("merchant_name","9158763151"),
                "merchant_category":"Transfer","recipient_type":"individual","payment_method":"UPI",
                "device_familiarity": feats.get("device_familiarity",1.0),
                "location_familiarity": feats.get("location_familiarity",1.0),
                "balance_before":100000,"account_age_days":365,
                "recipient_frequency_score":0.0,"days_since_recipient_seen":999,"merchant_frequency_score":0.5,
                "recipient_report_count":0,"is_off_network":False,"urgency_score":0.0,"note":feats.get("note",""),
                "txn_velocity_1h":1,"txn_velocity_5m":1,"txn_velocity_24h":1,"unique_recipients_30m":1,"amount_velocity_24h":0,"recent_amounts":[],"daily_spend_today":0
            }
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
        print(f"Weights {cfg} thresholds {th_low}/{th_high} -> {acc:.1f}% {correct}/{total}")
        if best is None or acc>best[0]:
            best=(acc, cfg, (th_low,th_high))
# Restore
thr.RISK_WEIGHTS={"behavior":0.35,"fraud":0.40,"recipient":0.15,"context":0.10}
thr.iron_tier=lambda s: "HIGH_RISK" if int(round(max(0,min(100,float(s)))))>=85 else "CAUTION" if int(round(max(0,min(100,float(s)))))>=70 else "SAFE"
eng.RISK_WEIGHTS=thr.RISK_WEIGHTS
eng.iron_tier=thr.iron_tier
otp_server._check_generic_limit=orig
print(f"Best: {best}")
