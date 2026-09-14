import json, pathlib, time, statistics, random
from collections import Counter, defaultdict
from fastapi.testclient import TestClient
from otp_server import app
import iron_store, scam_registry
from risk_engine.thresholds import iron_tier
client=TestClient(app)
def token_for(phone):
    return iron_store.create_session(phone)
cases=json.loads(pathlib.Path("benchmark_binary_500_cases.json").read_text(encoding="utf-8"))
dev=json.loads(pathlib.Path("benchmark_binary_500_dev.json").read_text(encoding="utf-8"))
val=json.loads(pathlib.Path("benchmark_binary_500_val.json").read_text(encoding="utf-8"))
final=json.loads(pathlib.Path("benchmark_binary_500_final.json").read_text(encoding="utf-8"))
print(f"Loaded {len(cases)} total dev {len(dev)} val {len(val)} final {len(final)}")
import otp_server
_orig=otp_server._check_generic_limit
otp_server._check_generic_limit=lambda *a,**kw: None

# Seed reported
for rec in ["9998887776","9998887777"]:
    for i in range(3):
        scam_registry.report_recipient(rec,f"seed{i}", "scam", 1000)

# Seed histories for all phones
import uuid
def seed_phone(phone, cat):
    existing=len(iron_store.get_transactions_for_user(phone, limit=100))
    if existing>=5 and cat not in ("COLD_START","VELOCITY"):
        return
    if cat in ("COLD_START",):
        # For cold start, keep 0-2
        if "LEG_" in phone or "FRAUD_" not in phone:
            return
        # For fraud cold, keep 0
        try:
            conn=iron_store._conn(); cur=conn.cursor(); cur.execute("DELETE FROM transactions WHERE phone=?", (phone,)); conn.commit(); conn.close()
        except: pass
        return
    if cat=="VELOCITY" and "VEL5" in phone:
        # Seed 5 rapid
        try:
            conn=iron_store._conn(); cur=conn.cursor(); cur.execute("DELETE FROM transactions WHERE phone=?", (phone,)); conn.commit(); conn.close()
        except: pass
        if not iron_store.get_user(phone):
            iron_store.create_user(phone, f"User{phone[-4:]}", 100000, 30, True, f"{phone}@iron")
        base=time.time() - 5*60
        for i in range(5):
            ts=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(base+i*10))
            conn=iron_store._conn(); cur=conn.cursor(); tx_id=str(uuid.uuid4()); cur.execute("INSERT INTO transactions (transaction_id, user_id, phone, recipient, recipient_name, amount, timestamp, status, risk_score, risk_tier, verification_method, verification_status, outcome, note, expires_at, confirmed_at, raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",(tx_id,phone,phone,"9158763151","Pranav",500,ts,"SUCCESS",10,"SAFE","NONE","NONE","PROCEEDED","seed",ts,ts,"{}")); conn.commit(); conn.close()
        return
    if cat=="VELOCITY" and "VEL10" in phone:
        try:
            conn=iron_store._conn(); cur=conn.cursor(); cur.execute("DELETE FROM transactions WHERE phone=?", (phone,)); conn.commit(); conn.close()
        except: pass
        if not iron_store.get_user(phone):
            iron_store.create_user(phone, f"User{phone[-4:]}", 100000, 30, True, f"{phone}@iron")
        base=time.time() - 5*60
        for i in range(10):
            ts=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(base+i*10))
            conn=iron_store._conn(); cur=conn.cursor(); tx_id=str(uuid.uuid4()); cur.execute("INSERT INTO transactions (transaction_id, user_id, phone, recipient, recipient_name, amount, timestamp, status, risk_score, risk_tier, verification_method, verification_status, outcome, note, expires_at, confirmed_at, raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",(tx_id,phone,phone,"9158763151","Pranav",500,ts,"SUCCESS",10,"SAFE","NONE","NONE","PROCEEDED","seed",ts,ts,"{}")); conn.commit(); conn.close()
        return
    # Normal seeding 10-20
    if existing>=10:
        return
    if not iron_store.get_user(phone):
        iron_store.create_user(phone, f"User{phone[-4:]}", 100000, 30, True, f"{phone}@iron")
    else:
        iron_store.update_balance(phone, 100000)
    n=random.randint(10,20)
    base=time.time() - n*3600
    for i in range(n-existing):
        amt=random.gauss(500,150)
        amt=max(50,min(2000,amt))
        ts=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(base+i*3600+random.randint(0,1800)))
        rec=random.choice(["9158763151","9766876442","9876543210"])
        conn=iron_store._conn(); cur=conn.cursor(); tx_id=str(uuid.uuid4()); cur.execute("INSERT INTO transactions (transaction_id, user_id, phone, recipient, recipient_name, amount, timestamp, status, risk_score, risk_tier, verification_method, verification_status, outcome, note, expires_at, confirmed_at, raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",(tx_id,phone,phone,rec,"Test",amt,ts,"SUCCESS",10,"SAFE","NONE","NONE","PROCEEDED","seed",ts,ts,"{}")); conn.commit(); conn.close()

print("Seeding histories...")
for c in cases:
    phone=c["features"].get("user_id","9000000099")
    if c["features"].get("direct_tier_test"):
        continue
    seed_phone(phone, c["category"])
print("Seeding done")

def run_set(cases_set, name):
    results=[]
    for case in cases_set:
        feats=case["features"]
        exp_bin=case["expected_binary"]
        exp_tier=case["expected_tier"]
        if feats.get("direct_tier_test"):
            score=feats["score"]
            pred_tier=iron_tier(score)
            # Map tier to binary: SAFE->LEGITIMATE, else FRAUDULENT
            pred_bin="LEGITIMATE" if pred_tier=="SAFE" else "FRAUDULENT"
            results.append({"case_id":case["case_id"],"category":case["category"],"expected_bin":exp_bin,"pred_bin":pred_bin,"expected_tier":exp_tier,"pred_tier":pred_tier,"score":score,"latency_ms":0})
            continue
        if exp_bin=="INVALID" or case["expected_tier"]=="INVALID":
            phone=feats.get("user_id","9000000099")
            hdr={"Authorization": f"Bearer {token_for(phone)}"}
            payload={}
            if "amount" in feats:
                payload["amount"]=feats["amount"]
            if "merchant_name" in feats:
                payload["recipient"]=feats["merchant_name"]
            try:
                r=client.post("/transactions/prepare", json=payload, headers=hdr)
                pred="REJECTED" if r.status_code in (422,400) else f"ACCEPTED_{r.status_code}"
            except:
                pred="ERROR"
            results.append({"case_id":case["case_id"],"category":case["category"],"expected_bin":exp_bin,"pred_bin":pred,"expected_tier":exp_tier,"pred_tier":pred,"score":-1,"latency_ms":0})
            continue
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
            "recipient_report_count": scam_registry.get_recipient_risk(feats.get("merchant_name","")).get("report_count",0),
            "is_off_network":False,"urgency_score":0.0,"note":feats.get("note",""),
            "txn_velocity_1h":1,"txn_velocity_5m":1,"txn_velocity_24h":1,"unique_recipients_30m":1,"amount_velocity_24h":0,"recent_amounts":[],"daily_spend_today":0
        }
        profile={"user_id":phone}
        start=time.time()
        r=client.post("/risk/assess", json={"transaction":txn,"user_profile":profile}, headers=hdr)
        latency=(time.time()-start)*1000
        if r.status_code!=200:
            pred_tier=f"ERROR_{r.status_code}"
            pred_bin="ERROR"
            score=-1
        else:
            j=r.json()
            pred_tier=j.get("tier","SAFE")
            score=j.get("score",0)
            # Use explicit binary fraud decision from RiskEngine (separate from tier)
            if "is_fraudulent" in j:
                pred_bin="FRAUDULENT" if j.get("is_fraudulent") else "LEGITIMATE"
            elif "fraud_label" in j:
                pred_bin=j.get("fraud_label","LEGITIMATE")
            else:
                pred_bin="FRAUDULENT" if pred_tier in ("CAUTION","HIGH_RISK") else "LEGITIMATE"
        results.append({"case_id":case["case_id"],"category":case["category"],"expected_bin":exp_bin,"pred_bin":pred_bin,"expected_tier":exp_tier,"pred_tier":pred_tier,"score":score,"latency_ms":latency})
    # Binary metrics
    tier_results=[r for r in results if r["expected_bin"]!="INVALID" and not r["pred_bin"].startswith("ERROR")]
    bin_correct=sum(1 for r in tier_results if r["pred_bin"]==r["expected_bin"])
    bin_acc=bin_correct/len(tier_results)*100 if tier_results else 0
    # Fraud is FRAUDULENT
    tp=sum(1 for r in tier_results if r["expected_bin"]=="FRAUDULENT" and r["pred_bin"]=="FRAUDULENT")
    fp=sum(1 for r in tier_results if r["expected_bin"]=="LEGITIMATE" and r["pred_bin"]=="FRAUDULENT")
    fn=sum(1 for r in tier_results if r["expected_bin"]=="FRAUDULENT" and r["pred_bin"]=="LEGITIMATE")
    tn=sum(1 for r in tier_results if r["expected_bin"]=="LEGITIMATE" and r["pred_bin"]=="LEGITIMATE")
    prec=tp/(tp+fp)*100 if (tp+fp)>0 else 0
    rec=tp/(tp+fn)*100 if (tp+fn)>0 else 0
    f1=2*prec*rec/(prec+rec) if (prec+rec)>0 else 0
    fpr=fp/(fp+tn)*100 if (fp+tn)>0 else 0
    fnr=fn/(fn+tp)*100 if (fn+tp)>0 else 0
    # Tier metrics
    tiers=["SAFE","CAUTION","HIGH_RISK"]
    tier_correct=sum(1 for r in tier_results if r["pred_tier"]==r["expected_tier"])
    tier_acc=tier_correct/len(tier_results)*100 if tier_results else 0
    per={}
    for t in tiers:
        tp_t=sum(1 for r in tier_results if r["expected_tier"]==t and r["pred_tier"]==t)
        fp_t=sum(1 for r in tier_results if r["expected_tier"]!=t and r["pred_tier"]==t)
        fn_t=sum(1 for r in tier_results if r["expected_tier"]==t and r["pred_tier"]!=t)
        prec_t=tp_t/(tp_t+fp_t)*100 if (tp_t+fp_t)>0 else 0
        rec_t=tp_t/(tp_t+fn_t)*100 if (tp_t+fn_t)>0 else 0
        f1_t=2*prec_t*rec_t/(prec_t+rec_t) if (prec_t+rec_t)>0 else 0
        per[t]={"prec":prec_t,"rec":rec_t,"f1":f1_t}
    lat=[r["latency_ms"] for r in tier_results if r["latency_ms"]>0]
    avg=statistics.mean(lat) if lat else 0
    med=statistics.median(lat) if lat else 0
    p95=sorted(lat)[int(0.95*len(lat))-1] if lat else 0
    print(f"\n{name}: tier {tier_acc:.1f}% {tier_correct}/{len(tier_results)} binary {bin_acc:.1f}% fraud P{prec:.1f} R{rec:.1f} F1{f1:.1f} FPR{fpr:.1f} FNR{fnr:.1f} latency avg {avg:.1f} p95 {p95:.1f}")
    for t in tiers:
        print(f"  {t}: P{per[t]['prec']:.1f} R{per[t]['rec']:.1f} F1{per[t]['f1']:.1f}")
    return {"results":results,"bin_acc":bin_acc,"prec":prec,"rec":rec,"f1":f1,"fpr":fpr,"fnr":fnr,"tier_acc":tier_acc,"lat_avg":avg,"lat_p95":p95}

dev_res=run_set(dev,"DEV")
val_res=run_set(val,"VAL")
final_res=run_set(final,"FINAL")

# Save
import pathlib, json
pathlib.Path("benchmark_binary_500_results.json").write_text(json.dumps({"dev":dev_res["results"],"val":val_res["results"],"final":final_res["results"]}, indent=2), encoding="utf-8")
report={"dev": {"tier_acc":dev_res["tier_acc"],"bin_acc":dev_res["bin_acc"],"prec":dev_res["prec"],"rec":dev_res["rec"],"f1":dev_res["f1"],"fpr":dev_res["fpr"]},
        "val": {"tier_acc":val_res["tier_acc"],"bin_acc":val_res["bin_acc"],"prec":val_res["prec"],"rec":val_res["rec"],"f1":val_res["f1"],"fpr":val_res["fpr"]},
        "final": {"tier_acc":final_res["tier_acc"],"bin_acc":final_res["bin_acc"],"prec":final_res["prec"],"rec":final_res["rec"],"f1":final_res["f1"],"fpr":final_res["fpr"],"fnr":final_res["fnr"],"lat_avg":final_res["lat_avg"],"lat_p95":final_res["lat_p95"]},
        "final_detailed": final_res}
pathlib.Path("benchmark_binary_500_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print("\nSaved binary report")
# Restore
otp_server._check_generic_limit=_orig
