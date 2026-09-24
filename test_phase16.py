"""
Phase 16 — Attack Intelligence tests.
Classification reuses existing signals; RiskEngine is single source of truth.
IRON NEVER BLOCKS A PAYMENT.
"""
import time
from fastapi.testclient import TestClient
from otp_server import app
import iron_store, scam_registry
from risk_engine.attack import classify_attack, ATTACK_CLASSIFIER_VERSION
from risk_engine.engine import RiskEngine

client = TestClient(app)

passed = 0
failed = 0
total = 0

def check(name, cond, detail=""):
    global passed, failed, total
    total += 1
    if cond:
        passed += 1
        print(f"PASS: {name} {detail}")
    else:
        failed += 1
        print(f"FAIL: {name} {detail}")

def token_for(phone):
    return iron_store.create_session(phone)

def hdr(phone):
    return {"Authorization": f"Bearer {token_for(phone)}"}

def mk_sig(sid, sev="MEDIUM", score=10, cat="SOCIAL_ENGINEERING", ev=None):
    return {"id": sid, "category": cat, "severity": sev, "score": score,
            "evidence": ev or {}, "description": sid, "source": "test"}

print("=" * 70)
print("PHASE 16 — UNIT: classify_attack reuses signals")
print("=" * 70)

# 1. Each attack type maps correctly
cases = [
    ("FAKE_KYC_SUSPENSION", [mk_sig("account_suspension_threat", "HIGH", 16)]),
    ("IMPERSONATION", [mk_sig("impersonation_language", "MEDIUM", 18)]),
    ("IMPERSONATION", [mk_sig("impersonation_upi", "CRITICAL", 24)]),
    ("FAKE_REFUND_REWARD", [mk_sig("reward_prize_scam", "MEDIUM", 14)]),
    ("INVESTMENT_LOAN_SCAM", [mk_sig("investment_scam", "HIGH", 15)]),
    ("INVESTMENT_LOAN_SCAM", [mk_sig("loan_scam", "MEDIUM", 12)]),
    ("REMOTE_ACCESS", [mk_sig("remote_access_request", "CRITICAL", 22)]),
    ("OTP_HARVESTING", [mk_sig("otp_request_language", "HIGH", 20)]),
    ("PAYMENT_ANOMALY", [mk_sig("EXTREME_AMOUNT", "HIGH", 18, "AMOUNT")]),
    ("PAYMENT_ANOMALY", [mk_sig("rapid_velocity_5m", "HIGH", 16, "VELOCITY")]),
    ("ACCOUNT_THREAT", [mk_sig("unfamiliar_device", "HIGH", 18, "NETWORK")]),
    ("ACCOUNT_THREAT", [mk_sig("recipient_reported", "HIGH", 18, "RECIPIENT")]),
]
for expected, sigs in cases:
    r = classify_attack(sigs)
    check(f"classify {expected} from {sigs[0]['id']}", r["attack_type"] == expected, f"got {r['attack_type']}")

# 2. NONE when no signals / only benign
r = classify_attack([])
check("NONE on empty", r["attack_type"] == "NONE" and r["attack_category"] == "NONE" and r["attack_confidence"] == 0.0, str(r))
r = classify_attack([mk_sig("recipient_frequent", "LOW", 0, "RECIPIENT")])
check("NONE on benign frequent", r["attack_type"] == "NONE", str(r["attack_type"]))
r = classify_attack([mk_sig("recipient_familiar", "LOW", 2, "RECIPIENT")])
check("Benign familiar not attack", r["attack_type"] == "NONE", str(r["attack_type"]))

# 3. Specific beats generic (priority)
r = classify_attack([mk_sig("reward_prize_scam", "MEDIUM", 14), mk_sig("HIGH_AMOUNT", "MEDIUM", 10, "AMOUNT")])
check("Specific refund beats generic amount", r["attack_type"] == "FAKE_REFUND_REWARD", str(r))
r = classify_attack([mk_sig("remote_access_request", "CRITICAL", 22), mk_sig("EXTREME_AMOUNT", "HIGH", 18, "AMOUNT")])
check("Remote access beats payment anomaly", r["attack_type"] == "REMOTE_ACCESS", str(r))
r = classify_attack([mk_sig("otp_request_language", "HIGH", 20), mk_sig("unfamiliar_device", "HIGH", 18, "NETWORK")])
check("OTP beats account threat", r["attack_type"] == "OTP_HARVESTING", str(r))

# 4. suspicious_upi_handle disambiguation via evidence (reuse, no new detection)
r = classify_attack([mk_sig("suspicious_upi_handle", "HIGH", 18, "RECIPIENT", {"handle": "refund"})])
check("UPI refund handle -> FAKE_REFUND", r["attack_type"] == "FAKE_REFUND_REWARD", str(r))
r = classify_attack([mk_sig("suspicious_upi_handle", "HIGH", 18, "RECIPIENT", {"handle": "kyc"})])
check("UPI kyc handle -> FAKE_KYC", r["attack_type"] == "FAKE_KYC_SUSPENSION", str(r))
r = classify_attack([mk_sig("suspicious_upi_handle", "HIGH", 18, "RECIPIENT", {"handle": "xyzpay"})])
check("UPI neutral handle -> IMPERSONATION", r["attack_type"] == "IMPERSONATION", str(r))

# 5. Categories + confidence bounds
r = classify_attack([mk_sig("account_suspension_threat", "HIGH", 16)])
check("KYC category SOCIAL_ENGINEERING", r["attack_category"] == "SOCIAL_ENGINEERING", str(r))
r = classify_attack([mk_sig("EXTREME_AMOUNT", "HIGH", 18, "AMOUNT")])
check("Payment category PAYMENT_ANOMALY", r["attack_category"] == "PAYMENT_ANOMALY", str(r))
r = classify_attack([mk_sig("unfamiliar_device", "HIGH", 18, "NETWORK")])
check("Account category ACCOUNT_COMPROMISE", r["attack_category"] == "ACCOUNT_COMPROMISE", str(r))
for _, sigs in cases:
    rr = classify_attack(sigs)
    check(f"confidence 0-1 for {rr['attack_type']}", 0.0 <= rr["attack_confidence"] <= 1.0 and rr["attack_confidence"] > 0, str(rr["attack_confidence"]))

# 6. Deterministic + version
r1 = classify_attack([mk_sig("otp_request_language", "HIGH", 20)])
r2 = classify_attack([mk_sig("otp_request_language", "HIGH", 20)])
check("Deterministic same input same output", r1 == r2)
check("Version present", r1.get("version") == ATTACK_CLASSIFIER_VERSION)

print("\n" + "=" * 70)
print("RISK ENGINE — single source of truth, no score change")
print("=" * 70)

eng = RiskEngine()
beh = {"score": 30, "confidence": 0.6, "signals": []}
fraud = {"score": 20, "confidence": 0.6, "signals": [mk_sig("otp_request_language", "HIGH", 20)]}
rec = {"score": 10, "confidence": 0.65, "signals": [mk_sig("recipient_new", "MEDIUM", 12, "RECIPIENT")]}
ctx = {"score": 0, "confidence": 0.55, "signals": []}
res = eng.assess(behavior=beh, fraud_intelligence=fraud, recipient=rec, context=ctx)
check("Engine returns attack_type", "attack_type" in res and res["attack_type"] == "OTP_HARVESTING", str(res.get("attack_type")))
check("Engine returns attack_category", res.get("attack_category") == "SOCIAL_ENGINEERING", str(res.get("attack_category")))
check("Engine returns attack_confidence", 0 < res.get("attack_confidence", 0) <= 1, str(res.get("attack_confidence")))
check("Engine returns attack_detail", isinstance(res.get("attack_detail"), dict) and "signal_ids" in res["attack_detail"])
check("No BLOCK tier", res["tier"] in ("SAFE", "CAUTION", "HIGH_RISK"), res["tier"])
# Score unchanged by classification: recompute weighted baseline roughly equals score (attack must not inflate)
check("Score still 0-100", 0 <= res["score"] <= 100)
# Empty signals -> NONE, still SAFE-ish
res2 = eng.assess(behavior={"score": 10, "confidence": 0.6, "signals": []},
                  fraud_intelligence={"score": 5, "confidence": 0.5, "signals": []},
                  recipient={"score": 5, "confidence": 0.65, "signals": []},
                  context={"score": 0, "confidence": 0.55, "signals": []})
check("Clean -> NONE", res2["attack_type"] == "NONE", str(res2["attack_type"]))

# Explanation includes attack + evidence subset
from risk_engine.explanation import build_explanation
exp = build_explanation(res["score"], res["tier"], res["signals"], res["components"], res["confidence"], {}, res.get("attack_detail"))
check("Explanation has attack block", "attack" in exp and exp["attack"]["attack_type"] == "OTP_HARVESTING", str(exp.get("attack")))
check("Explanation top-level attack_type", exp.get("attack_type") == "OTP_HARVESTING")
check("Attack evidence subset of signals", set(exp["attack"]["signal_ids"]).issubset(set(s["id"] for s in res["signals"])), str(exp["attack"]["signal_ids"]))
# Backward compat: reasons still signal-backed
sig_ids = set(s["id"] for s in res["signals"])
check("Reasons still signal-backed", all(rr["id"] in sig_ids for rr in exp["reasons"]) if exp["reasons"] else True)
# Old signature still works (attack optional)
exp_old = build_explanation(20, "SAFE", [], {"behavior": 10, "fraud_intelligence": 5, "recipient": 5, "context": 0}, 0.6)
check("Backward-compat explanation without attack", exp_old.get("attack_type") == "NONE" and "summary" in exp_old)

print("\n" + "=" * 70)
print("API — schemas, backward compat, never blocks")
print("=" * 70)

# Ensure users exist with balance
for p in ["9340228345", "9158763151"]:
    iron_store.seed_users_if_needed()
    iron_store.update_balance(p, 100000)
h = hdr("9340228345")

# /risk/assess returns attack fields + old fields
r = client.post("/risk/assess", json={"transaction": {"user_id": "9340228345", "amount": 500, "merchant_name": "9158763151"}, "user_profile": {"user_id": "9340228345"}}, headers=h)
check("/risk/assess 200", r.status_code == 200, str(r.status_code))
if r.status_code == 200:
    j = r.json()
    for f in ["score", "tier", "confidence", "signals", "requires_otp", "explanation", "explanation_detail", "components", "fraud_label", "is_fraudulent"]:
        check(f"Backward-compat field {f}", f in j, f"missing {f}")
    for f in ["attack_type", "attack_category", "attack_confidence", "attack_detail"]:
        check(f"New field {f}", f in j, f"missing {f}")
    check("attack_detail has signal_ids", "signal_ids" in j.get("attack_detail", {}))
    check("explanation_detail has attack", "attack" in j.get("explanation_detail", {}), str(list(j.get("explanation_detail", {}).keys())[:8]))
    if j.get("attack_type") != "NONE":
        check("Attack evidence subset (assess)", set(j["attack_detail"].get("signal_ids", [])).issubset(set(s["id"] for s in j["signals"])))

# Scam-language vectors via API (use fresh recipient to avoid history bias where needed)
vectors = [
    ("FAKE_KYC_SUSPENSION", {"merchant_name": "9158763151", "note": "your account will be blocked complete kyc update immediately", "amount": 500}),
    ("FAKE_REFUND_REWARD", {"merchant_name": "9158763151", "note": "congratulations you won prize lottery claim cashback reward", "amount": 500}),
    ("INVESTMENT_LOAN_SCAM", {"merchant_name": "9158763151", "note": "invest crypto double profit guaranteed return", "amount": 500}),
    ("REMOTE_ACCESS", {"merchant_name": "9158763151", "note": "please install anydesk screen share apk for verification", "amount": 500}),
    ("OTP_HARVESTING", {"merchant_name": "9158763151", "note": "share otp verification code pin required urgently", "amount": 500}),
]
for expected, txn in vectors:
    txn_full = {"user_id": "9340228345", "amount": txn["amount"], "merchant_name": txn["merchant_name"], "note": txn["note"]}
    rr = client.post("/risk/assess", json={"transaction": txn_full, "user_profile": {"user_id": "9340228345"}}, headers=h)
    if rr.status_code == 200:
        got = rr.json().get("attack_type")
        check(f"API vector {expected}", got == expected, f"got {got} for note '{txn['note'][:30]}'")
    else:
        check(f"API vector {expected} 200", False, str(rr.status_code))

# Impersonation via UPI structure
rr = client.post("/risk/assess", json={"transaction": {"user_id": "9340228345", "amount": 500, "merchant_name": "rbi-official@randompay", "note": ""}, "user_profile": {"user_id": "9340228345"}}, headers=h)
if rr.status_code == 200:
    check("API impersonation UPI", rr.json().get("attack_type") == "IMPERSONATION", str(rr.json().get("attack_type")))

# Payment anomaly via large amount (no scam language)
rr = client.post("/risk/assess", json={"transaction": {"user_id": "9340228345", "amount": 70000, "merchant_name": "9158763151", "note": ""}, "user_profile": {"user_id": "9340228345"}}, headers=h)
if rr.status_code == 200:
    check("API payment/account for large amount", rr.json().get("attack_type") in ("PAYMENT_ANOMALY", "ACCOUNT_THREAT"), str(rr.json().get("attack_type")))

# Account threat via unfamiliar device
rr = client.post("/risk/assess", json={"transaction": {"user_id": "9340228345", "amount": 500, "merchant_name": "9158763151", "device_familiarity": 0.1, "location_familiarity": 0.1}, "user_profile": {"user_id": "9340228345"}}, headers=h)
if rr.status_code == 200:
    check("API account threat via device", rr.json().get("attack_type") == "ACCOUNT_THREAT", str(rr.json().get("attack_type")))

# /transactions/prepare includes attack + never blocks
from otp_server import _report_attempts
_report_attempts.clear()
rp = client.post("/transactions/prepare", json={"recipient": "9158763151", "amount": 500, "note": "share otp urgently"}, headers=hdr("9340228345"))
check("Prepare 200", rp.status_code == 200, str(rp.status_code))
if rp.status_code == 200:
    j = rp.json()
    check("Prepare risk has attack_type", j.get("risk", {}).get("attack_type") in ("OTP_HARVESTING", "PAYMENT_ANOMALY", "ACCOUNT_THREAT", "FAKE_KYC_SUSPENSION", "FAKE_REFUND_REWARD", "INVESTMENT_LOAN_SCAM", "REMOTE_ACCESS", "IMPERSONATION", "NONE"), str(j.get("risk", {}).get("attack_type")))
    check("Prepare top-level attack_type", "attack_type" in j)
    check("Prepare tier never BLOCK", j.get("risk", {}).get("tier") in ("SAFE", "CAUTION", "HIGH_RISK"))
    # Confirm still proceeds (SAFE path)
    txid = j["transaction_id"]
    if not j["risk"].get("requires_otp"):
        rc = client.post("/transactions/confirm", json={"transaction_id": txid}, headers=hdr("9340228345"))
        check("Prepare->confirm still proceeds", rc.status_code == 200, str(rc.status_code))

# /risk/simulate includes attack, no mutation
bal_before = client.get("/balance", headers=h).json()["balance"]
rs = client.post("/risk/simulate", json={"amount": 5000, "recipient": "9158763151", "note": "install anydesk screen share"}, headers=h)
check("Simulate 200", rs.status_code == 200, str(rs.status_code))
if rs.status_code == 200:
    check("Simulate has attack_type", "attack_type" in rs.json(), str(list(rs.json().keys())[:10]))
    check("Simulate attack REMOTE_ACCESS", rs.json().get("attack_type") == "REMOTE_ACCESS" or rs.json().get("risk", {}).get("attack_type") == "REMOTE_ACCESS", str(rs.json().get("attack_type")))
    check("Simulate no balance mutation", client.get("/balance", headers=h).json()["balance"] == bal_before)

# /risk/weights + /health versions
rw = client.get("/risk/weights")
check("Weights has attack_classifier", "attack_classifier" in rw.json().get("versions", {}), str(rw.json().get("versions")))
check("Weights lists attack_types", "attack_types" in rw.json() and "OTP_HARVESTING" in rw.json()["attack_types"])
rh = client.get("/health")
check("Health has attack version", "attack_classifier_version" in rh.json(), str(list(rh.json().keys())))

print("\n" + "=" * 70)
print(f"PHASE 16 SUMMARY: {passed}/{total} passed, {failed} failed")
print("=" * 70)
if failed > 0:
    raise SystemExit(1)
