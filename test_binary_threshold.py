import json, pathlib, statistics
from fastapi.testclient import TestClient
from otp_server import app
import iron_store
client=TestClient(app)
def token_for(p): return iron_store.create_session(p)
cases=json.loads(pathlib.Path("benchmark_binary_500_final.json").read_text(encoding="utf-8"))
import otp_server
orig=otp_server._check_generic_limit
otp_server._check_generic_limit=lambda *a,**kw: None
# Test thresholds
for thresh in [60,65,70]:
    correct=0
    total=0
    tp=fp=fn=tn=0
    for case in cases:
        if case["expected_tier"]=="INVALID": continue
        feats=case["features"]
        if feats.get("direct_tier_test"):
            # For threshold cases, use iron_tier
            from risk_engine.thresholds import iron_tier
            pred_tier=iron_tier(feats["score"])
            # Binary from tier
            pred_bin="FRAUDULENT" if pred_tier in ("CAUTION","HIGH_RISK") else "LEGITIMATE"
            exp_bin=case["expected_binary"]
            # For threshold, also check binary mapping: SAFE->LEGIT, else FRAUD
            # But threshold cases have expected_tier not binary, we need to map
            # For threshold, expected_binary is based on tier: SAFE->LEGIT, else FRAUD
        else:
            phone=feats.get("user_id","9000000099")
            hdr={"Authorization": f"Bearer {token_for(phone)}"}
            txn={"user_id":phone,"amount":feats.get("amount",500),"hour_of_day":feats.get("hour_of_day",12),"day_of_week":"Monday","is_weekend":0,"is_salary_period":0,"merchant_name":feats.get("merchant_name","9158763151"),"merchant_category":"Transfer","recipient_type":"individual","payment_method":"UPI","device_familiarity":feats.get("device_familiarity",1.0),"location_familiarity":feats.get("location_familiarity",1.0),"balance_before":100000,"account_age_days":365,"recipient_frequency_score":0.0,"days_since_recipient_seen":999,"merchant_frequency_score":0.5,"recipient_report_count":0,"is_off_network":False,"urgency_score":0.0,"note":feats.get("note",""),"txn_velocity_1h":1,"txn_velocity_5m":1,"txn_velocity_24h":1,"unique_recipients_30m":1,"amount_velocity_24h":0,"recent_amounts":[],"daily_spend_today":0}
            import scam_registry
            txn["recipient_report_count"]=scam_registry.get_recipient_risk(feats.get("merchant_name","")).get("report_count",0)
            profile={"user_id":phone}
            r=client.post("/risk/assess", json={"transaction":txn,"user_profile":profile}, headers=hdr)
            if r.status_code!=200:
                continue
            j=r.json()
            score=j.get("score",0)
            # Binary with custom threshold
            pred_bin="FRAUDULENT" if score>=thresh else "LEGITIMATE"
            exp_bin=case["expected_binary"]
        # For threshold direct, handle separately
        if feats.get("direct_tier_test"):
            # Already handled
            pass
        else:
            if pred_bin==exp_bin:
                correct+=1
            total+=1
            if exp_bin=="FRAUDULENT" and pred_bin=="FRAUDULENT":
                tp+=1
            elif exp_bin=="LEGITIMATE" and pred_bin=="FRAUDULENT":
                fp+=1
            elif exp_bin=="FRAUDULENT" and pred_bin=="LEGITIMATE":
                fn+=1
            else:
                tn+=1
    acc=correct/total*100 if total else 0
    prec=tp/(tp+fp)*100 if (tp+fp)>0 else 0
    rec=tp/(tp+fn)*100 if (tp+fn)>0 else 0
    f1=2*prec*rec/(prec+rec) if (prec+rec)>0 else 0
    fpr=fp/(fp+tn)*100 if (fp+tn)>0 else 0
    print(f"Thresh {thresh}: acc {acc:.1f} P{prec:.1f} R{rec:.1f} F1{f1:.1f} FPR{fpr:.1f} correct {correct}/{total}")

otp_server._check_generic_limit=orig
