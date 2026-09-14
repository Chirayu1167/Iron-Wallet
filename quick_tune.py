import json, pathlib, time
from fastapi.testclient import TestClient
from otp_server import app
import iron_store
client=TestClient(app)
def token_for(p): return iron_store.create_session(p)
import risk_engine.thresholds as thr
import risk_engine.engine as eng
import otp_server
# Load final
cases=json.loads(pathlib.Path("benchmark_binary_500_final.json").read_text(encoding="utf-8"))
# Disable rate limit
orig=otp_server._check_generic_limit
otp_server._check_generic_limit=lambda *a,**kw: None
# Test thresholds
for low, high in [(70,85),(65,80),(65,85),(68,82),(60,80)]:
    def make_tier(l,h):
        def iron_tier(s):
            s=int(round(max(0,min(100,float(s)))))
            if s>=h:
                return "HIGH_RISK"
            if s>=l:
                return "CAUTION"
            return "SAFE"
        return iron_tier
    thr.iron_tier=make_tier(low,high)
    eng.iron_tier=thr.iron_tier
    otp_server._iron_tier=thr.iron_tier
    correct=0
    total=0
    for case in cases:
        if case["expected_tier"]=="INVALID": continue
        feats=case["features"]
        if feats.get("direct_tier_test"):
            pred=thr.iron_tier(feats["score"])
            exp=case["expected_tier"]
            if pred==exp:
                correct+=1
            total+=1
            continue
        phone=feats.get("user_id","9000000099")
        hdr={"Authorization": f"Bearer {token_for(phone)}"}
        txn={"user_id":phone,"amount":feats.get("amount",500),"hour_of_day":feats.get("hour_of_day",12),"day_of_week":"Monday","is_weekend":0,"is_salary_period":0,"merchant_name":feats.get("merchant_name","9158763151"),"merchant_category":"Transfer","recipient_type":"individual","payment_method":"UPI","device_familiarity":feats.get("device_familiarity",1.0),"location_familiarity":feats.get("location_familiarity",1.0),"balance_before":100000,"account_age_days":365,"recipient_frequency_score":0.0,"days_since_recipient_seen":999,"merchant_frequency_score":0.5,"recipient_report_count":0,"is_off_network":False,"urgency_score":0.0,"note":feats.get("note",""),"txn_velocity_1h":1,"txn_velocity_5m":1,"txn_velocity_24h":1,"unique_recipients_30m":1,"amount_velocity_24h":0,"recent_amounts":[],"daily_spend_today":0}
        import scam_registry
        txn["recipient_report_count"]=scam_registry.get_recipient_risk(feats.get("merchant_name","")).get("report_count",0)
        profile={"user_id":phone}
        r=client.post("/risk/assess", json={"transaction":txn,"user_profile":profile}, headers=hdr)
        if r.status_code!=200: continue
        pred=r.json().get("tier")
        exp=case["expected_tier"]
        if pred==exp:
            correct+=1
        total+=1
    print(f"Threshold {low}/{high} -> {correct}/{total} {correct/total*100:.1f}%")
# Restore
thr.iron_tier=lambda s: "HIGH_RISK" if int(round(max(0,min(100,float(s)))))>=85 else "CAUTION" if int(round(max(0,min(100,float(s)))))>=70 else "SAFE"
eng.iron_tier=thr.iron_tier
otp_server._iron_tier=thr.iron_tier
otp_server._check_generic_limit=orig
