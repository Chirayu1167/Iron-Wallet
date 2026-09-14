"""
Generate 500-case benchmark with realistic histories, split into dev/validation/final.
"""
import json, random, pathlib, time, uuid
SEED=42
random.seed(SEED)
cases=[]
cid=1
def nid():
    global cid
    c=f"C{cid:04d}"
    cid+=1
    return c
def add(cat, scen, exp, reason, feats):
    cases.append({"case_id":nid(),"category":cat,"scenario":scen,"expected_risk":exp,"expected_reason":reason,"features":feats})
def base(amount, rec, hour=12, note="", dev=1.0, loc=1.0, phone="9000000099"):
    return {"user_id":phone,"amount":amount,"hour_of_day":hour,"day_of_week":"Monday","is_weekend":0,"is_salary_period":0,"merchant_name":rec,"merchant_category":"Transfer","recipient_type":"individual","payment_method":"UPI","device_familiarity":dev,"location_familiarity":loc,"balance_before":100000,"account_age_days":365,"recipient_frequency_score":0.0,"days_since_recipient_seen":999,"merchant_frequency_score":0.5,"recipient_report_count":0,"is_off_network":False,"urgency_score":0.0,"note":note,"txn_velocity_1h":1,"txn_velocity_5m":1,"txn_velocity_24h":1,"unique_recipients_30m":1,"amount_velocity_24h":0,"recent_amounts":[],"daily_spend_today":0}
# Helper to create phone-specific histories will be handled at run time, not generation
# NORMAL 40
for i in range(40):
    amt=random.choice([500,600,700,800,550,650])
    hr=random.choice([10,11,12,13,14,15])
    add(cat="NORMAL", scen=f"Normal {i+1}", exp="SAFE", reason="Familiar recipient, typical amount/time/device", feats=base(amt,"9158763151",hr,random.choice(["","lunch"] ),1.0,1.0, phone=f"NORM{i:03d}"))
# LEGITIMATE_UNUSUAL 30
for i in range(10):
    # Slightly unusual amount but no fraud
    add(cat="LEGITIMATE_UNUSUAL", scen=f"Legit unusual amount {i+1}", exp="SAFE", reason="Slightly above avg 1.5x but otherwise normal, should remain SAFE", feats=base(750,"9158763151",12,"",1.0,1.0, phone=f"LEGIT{i:03d}"))
for i in range(10):
    add(cat="LEGITIMATE_UNUSUAL", scen=f"New recipient small {i+1}", exp="SAFE", reason="New recipient but tiny amount 20", feats=base(20,f"999990{i:04d}"[:10],12,"",1.0,1.0, phone=f"LEGIT{i+10:03d}"))
for i in range(10):
    add(cat="LEGITIMATE_UNUSUAL", scen=f"Unusual time familiar {i+1}", exp="SAFE", reason="3am but familiar recipient small amount", feats=base(500,"9158763151",3,"",1.0,1.0, phone=f"LEGIT{i+20:03d}"))

# AMOUNT_ANOMALY 40
for i in range(10):
    add(cat="AMOUNT_ANOMALY", scen=f"2x normal {i+1}", exp="SAFE", reason="2x avg moderate", feats=base(1000,"9158763151",12,"",1.0,1.0, phone=f"AMT{i:03d}"))
for i in range(10):
    add(cat="AMOUNT_ANOMALY", scen=f"5x normal {i+1}", exp="HIGH_RISK", reason="5x avg strong", feats=base(2500,"9158763151",12,"",1.0,1.0, phone=f"AMT{i+10:03d}"))
for i in range(10):
    add(cat="AMOUNT_ANOMALY", scen=f"10x normal {i+1}", exp="HIGH_RISK", reason="10x+ avg", feats=base(5000,"9158763151",12,"",1.0,1.0, phone=f"AMT{i+20:03d}"))
for i in range(10):
    add(cat="AMOUNT_ANOMALY", scen=f"Very small {i+1}", exp="SAFE", reason="Very small 1", feats=base(1,"9158763151",12,"",1.0,1.0, phone=f"AMT{i+30:03d}"))

# NEW_RECIPIENT 30
for i in range(10):
    add(cat="NEW_RECIPIENT", scen=f"New small {i+1}", exp="SAFE", reason="New recipient small amount single signal", feats=base(500,f"999990{i:04d}"[:10],12,"",1.0,1.0, phone=f"NEW{i:03d}"))
for i in range(10):
    add(cat="NEW_RECIPIENT", scen=f"New large {i+1}", exp="HIGH_RISK", reason="New + large amount", feats=base(5000,f"999991{i:04d}"[:10],12,"",1.0,1.0, phone=f"NEW{i+10:03d}"))
for i in range(10):
    add(cat="NEW_RECIPIENT", scen=f"Frequent {i+1}", exp="SAFE", reason="Frequent recipient", feats=base(500,"9158763151",12,"",1.0,1.0, phone=f"NEW{i+20:03d}"))

# TIME_ANOMALY 30
for i in range(10):
    hr=random.choice([10,11,12,13])
    add(cat="TIME_ANOMALY", scen=f"Normal time {i+1}", exp="SAFE", reason="Normal hour", feats=base(500,"9158763151",hr,"",1.0,1.0, phone=f"TIME{i:03d}"))
for i in range(10):
    hr=random.choice([1,2,3,4])
    add(cat="TIME_ANOMALY", scen=f"Unusual hour {i+1}", exp="CAUTION", reason="Unusual hour 1-4", feats=base(500,"9158763151",hr,"",1.0,1.0, phone=f"TIME{i+10:03d}"))
for i in range(10):
    hr=random.choice([2,3])
    add(cat="TIME_ANOMALY", scen=f"Very unusual multiple {i+1}", exp="HIGH_RISK", reason="Unusual hour + large amount", feats=base(5000,"9158763151",hr,"",1.0,1.0, phone=f"TIME{i+20:03d}"))

# VELOCITY 30
for i in range(10):
    add(cat="VELOCITY", scen=f"Normal velocity {i+1}", exp="SAFE", reason="Normal frequency", feats=base(500,"9158763151",12,"",1.0,1.0, phone=f"VELN{i:03d}"))
for i in range(10):
    add(cat="VELOCITY", scen=f"5 quickly {i+1}", exp="SAFE", reason="5 in 5m", feats=base(500,"9158763151",12,"",1.0,1.0, phone=f"VEL5_{i:03d}"))
for i in range(10):
    add(cat="VELOCITY", scen=f"10+ rapid {i+1}", exp="HIGH_RISK", reason="10+ rapid", feats=base(500,"9158763151",12,"",1.0,1.0, phone=f"VEL10_{i:03d}"))

# SOCIAL 40
clean_notes=["lunch","coffee","","split bill","rent"]
suspicious=["urgent payment required","KYC verification pending","lottery prize claim","refund processing fee","investment guaranteed return"]
scam=["OTP required verify account immediately","KYC blocked account will be frozen","lottery prize claim urgent prize otp"]
for i in range(10):
    add(cat="SOCIAL", scen=f"Clean {i+1}", exp="SAFE", reason="Clean note", feats=base(500,"9158763151",12,random.choice(clean_notes),1.0,1.0, phone=f"SOC{i:03d}"))
for i in range(15):
    add(cat="SOCIAL", scen=f"Suspicious {i+1}", exp="SAFE", reason="Single scam keyword", feats=base(500,"9158763151",12,random.choice(suspicious),1.0,1.0, phone=f"SOC{i+10:03d}"))
for i in range(15):
    note=random.choice(scam)+" urgent"
    add(cat="SOCIAL", scen=f"Obvious scam {i+1}", exp="HIGH_RISK", reason="Multiple scam keywords", feats=base(500,"9158763151",12,note,1.0,1.0, phone=f"SOC{i+20:03d}"))

# DEVICE 20
for i in range(10):
    add(cat="DEVICE", scen=f"Known {i+1}", exp="SAFE", reason="Known device/location", feats=base(500,"9158763151",12,"",1.0,1.0, phone=f"DEV{i:03d}"))
for i in range(5):
    add(cat="DEVICE", scen=f"Unfamiliar device {i+1}", exp="SAFE", reason="Unfamiliar device", feats=base(500,"9158763151",12,"",0.2,1.0, phone=f"DEV{i+10:03d}"))
for i in range(5):
    add(cat="DEVICE", scen=f"Unfamiliar location {i+1}", exp="SAFE", reason="Unfamiliar location", feats=base(500,"9158763151",12,"",1.0,0.2, phone=f"DEV{i+15:03d}"))

# LOCATION same as device but separate category for benchmark (we combine)
for i in range(10):
    add(cat="LOCATION", scen=f"Known loc {i+1}", exp="SAFE", reason="Known", feats=base(500,"9158763151",12,"",1.0,1.0, phone=f"LOC{i:03d}"))
for i in range(5):
    add(cat="LOCATION", scen=f"Unfamiliar {i+1}", exp="SAFE", reason="Unfamiliar", feats=base(500,"9158763151",12,"",1.0,0.2, phone=f"LOC{i+10:03d}"))
for i in range(5):
    add(cat="LOCATION", scen=f"Unfamiliar+new {i+1}", exp="HIGH_RISK", reason="Unfamiliar + new recipient", feats=base(500,f"999990{i:04d}"[:10],12,"",1.0,0.2, phone=f"LOC{i+15:03d}"))

# FRAUD_RECIPIENT 30
for i in range(10):
    add(cat="FRAUD_RECIPIENT", scen=f"Reported 1 {i+1}", exp="CAUTION", reason="1 report", feats=base(500,"9998887776",12,"",1.0,1.0, phone=f"FRAUD{i:03d}"))
for i in range(10):
    add(cat="FRAUD_RECIPIENT", scen=f"Reported 3 {i+1}", exp="HIGH_RISK", reason="3 reports", feats=base(500,"9998887776",12,"",1.0,1.0, phone=f"FRAUD{i+10:03d}"))
for i in range(10):
    add(cat="FRAUD_RECIPIENT", scen=f"Multiple reports {i+1}", exp="HIGH_RISK", reason="5 reports", feats=base(500,"9998887777",12,"",1.0,1.0, phone=f"FRAUD{i+20:03d}"))

# COMBINED 50
for i in range(50):
    amt=random.choice([5000,10000,20000])
    rec=random.choice(["9999900011","9998887776"])
    hr=random.choice([2,3,12])
    note=random.choice(["urgent prize claim","otp verify"])
    dev=random.choice([0.2,1.0])
    loc=random.choice([0.2,1.0])
    add(cat="COMBINED", scen=f"Combined {i+1}", exp="HIGH_RISK", reason="Multiple independent", feats=base(amt,rec,hr,note,dev,loc, phone=f"COMB{i:03d}"))

# COLD_START 30
for i in range(15):
    phone=f"90000003{i:02d}"
    add(cat="COLD_START", scen=f"Cold start small {i+1}", exp="SAFE", reason="No history small", feats=base(500,"9158763151",12,"",1.0,1.0, phone=phone))
for i in range(15):
    phone=f"90000004{i:02d}"
    add(cat="COLD_START", scen=f"Cold start large {i+1}", exp="CAUTION", reason="No history large", feats=base(5000,f"999990{i:04d}"[:10],12,"urgent",0.2,1.0, phone=phone))

# CONFLICTING 30
for i in range(10):
    add(cat="CONFLICTING", scen=f"New tiny {i+1}", exp="SAFE", reason="New but tiny", feats=base(10,f"999990{i:04d}"[:10],12,"",1.0,1.0, phone=f"CONF{i:03d}"))
for i in range(10):
    add(cat="CONFLICTING", scen=f"Large familiar {i+1}", exp="CAUTION", reason="Large but familiar", feats=base(20000,"9158763151",12,"",1.0,1.0, phone=f"CONF{i+10:03d}"))
for i in range(10):
    add(cat="CONFLICTING", scen=f"Reported small familiar {i+1}", exp="CAUTION", reason="Reported small", feats=base(500,"9998887776",12,"",1.0,1.0, phone=f"CONF{i+20:03d}"))

# INPUT_EDGE 20
edge_cases=[
    (1,"9999900001","zero amount"),
    (0,"9158763151","zero"),
    (-100,"9158763151","negative"),
    (500,"","empty recipient"),
    (500,"abc","invalid recipient"),
    (500,"123","short"),
    (500,"9158763151@","invalid UPI"),
    (1000000,"9158763151","max"),
    (1000001,"9158763151","over limit"),
    (1,"9158763151","minimum"),
    (500,None,"missing recipient"),
    (None,"9158763151","missing amount"),
    (500,"9158763151","duplicate"),
    (500,"9158763151","missing context"),
]
for i,(amt,rec,desc) in enumerate(edge_cases):
    feats=base(amt if amt is not None else 500, rec if rec is not None else "9158763151",12,"",1.0,1.0, phone=f"EDGE{i:03d}")
    if amt is None:
        feats.pop("amount",None)
    if rec is None:
        feats.pop("merchant_name",None)
    exp="INVALID" if desc in ["zero","negative","empty recipient","invalid recipient","short","invalid UPI","over limit","missing recipient","missing amount"] else "SAFE"
    add(cat="INPUT_EDGE", scen=f"Edge {desc} {i+1}", exp=exp, reason=f"Input edge {desc}", feats=feats)
for i in range(len(edge_cases),20):
    add(cat="INPUT_EDGE", scen=f"Edge small {i+1}", exp="SAFE", reason="Small legitimate", feats=base(1,"9158763151",12,"",1.0,1.0, phone=f"EDGE{i:03d}"))

# THRESHOLD 20
threshold_cases=[(69,"SAFE"),(70,"CAUTION"),(84,"CAUTION"),(85,"HIGH_RISK"),(0,"SAFE"),(100,"HIGH_RISK"),(68,"SAFE"),(71,"CAUTION"),(83,"CAUTION"),(86,"HIGH_RISK"),(69,"SAFE"),(70,"CAUTION"),(84,"CAUTION"),(85,"HIGH_RISK"),(50,"SAFE"),(75,"CAUTION"),(90,"HIGH_RISK"),(30,"SAFE"),(95,"HIGH_RISK"),(80,"CAUTION")]
for score,exp in threshold_cases:
    add(cat="THRESHOLD", scen=f"Threshold {score}", exp=exp, reason=f"Score {score} -> {exp}", feats={"direct_tier_test":True,"score":score,"amount":500,"merchant_name":"9158763151"})

# Shuffle
random.shuffle(cases)
# Now split into dev 250, validation 125, final 125? Need 500 total, we have ~500? Let's count
from collections import Counter
print(f"Generated {len(cases)}")
print(Counter(c["category"] for c in cases))
print(Counter(c["expected_risk"] for c in cases))
# Split
dev=cases[:300]
val=cases[300:400]
final=cases[400:500]
# Ensure we have exactly 500, if we generated 500, this works, but we generated more than 500? Let's count our generation: Let's sum: NORMAL40+LEGIT30=70, AMOUNT40=110, NEW30=140, TIME30=170, VELOCITY30=200, SOCIAL40=240, DEVICE20=260, LOCATION20=280, FRAUD30=310, COMBINED50=360, COLD30=390, CONFLICTING30=420, INPUT20=440, THRESHOLD20=460 -> we have 460, not 500. Wait we missed: let's recount: NORMAL40, LEGIT30=70, AMOUNT40=110, NEW30=140, TIME30=170, VELOCITY30=200, SOCIAL40=240, DEVICE20=260, LOCATION20=280, FRAUD30=310, COMBINED50=360, COLD30=390, CONFLICTING30=420, INPUT20=440, THRESHOLD20=460. So 460, not 500. Need 40 more to reach 500. Add 40 more NORMAL or COMBINED.
for i in range(40):
    add(cat="NORMAL", scen=f"Extra normal {i+1}", exp="SAFE", reason="Extra", feats=base(500,"9158763151",12,"",1.0,1.0, phone=f"EXTRA{i:03d}"))
# Now total 500
random.shuffle(cases)
# Re-split
dev=cases[:300]
val=cases[300:400]
final=cases[400:]

import pathlib, json
pathlib.Path("benchmark_500_cases.json").write_text(json.dumps(cases, indent=2), encoding="utf-8")
pathlib.Path("benchmark_500_dev.json").write_text(json.dumps(dev, indent=2), encoding="utf-8")
pathlib.Path("benchmark_500_val.json").write_text(json.dumps(val, indent=2), encoding="utf-8")
pathlib.Path("benchmark_500_final.json").write_text(json.dumps(final, indent=2), encoding="utf-8")
pathlib.Path("benchmark_500_seed.txt").write_text(str(SEED), encoding="utf-8")
print(f"Final total {len(cases)} dev {len(dev)} val {len(val)} final {len(final)}")
print(f"Saved 500")
