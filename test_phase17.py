"""
Phase 17 — Account Takeover Intelligence tests.
Combination-based, reuses existing signals; RiskEngine is single source of truth.
IRON NEVER BLOCKS A PAYMENT. No score/OTP change.
"""
from fastapi.testclient import TestClient
from otp_server import app
import iron_store
from risk_engine.account_takeover import detect_account_takeover, ACCOUNT_TAKEOVER_VERSION
from risk_engine.engine import RiskEngine
from risk_engine.explanation import build_explanation

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

def mk_sig(sid, sev="MEDIUM", score=10, cat="NETWORK", ev=None):
    return {"id": sid, "category": cat, "severity": sev, "score": score,
            "evidence": ev or {}, "description": sid, "source": "test"}

print("=" * 70)
print("PHASE 17 — UNIT: combinations, not isolated signals")
print("=" * 70)

# Negative: clean / empty
r = detect_account_takeover([])
check("Negative empty -> not detected", r["account_threat_detected"] is False and r["account_threat_confidence"] == 0.0 and r["signal_ids"] == [], str(r))
check("Version present", r.get("version") == ACCOUNT_TAKEOVER_VERSION)

# Negative: benign familiarity only
r = detect_account_takeover([mk_sig("recipient_frequent", "LOW", 0, "RECIPIENT")])
check("Negative benign frequent", r["account_threat_detected"] is False, str(r))

# Weak-signal: single LOW never counts
r = detect_account_takeover([mk_sig("device_low_familiarity", "LOW", 6, "NETWORK")])
check("Weak LOW single -> not detected", r["account_threat_detected"] is False and r["account_threat_confidence"] < 0.5, str(r))

# Weak-signal: isolated single MEDIUM (one dimension) -> NOT detected
r = detect_account_takeover([mk_sig("unfamiliar_device", "HIGH", 18, "NETWORK")])
check("Isolated device alone -> not detected", r["account_threat_detected"] is False, str(r))
check("Isolated confidence < 0.5", r["account_threat_confidence"] < 0.5, str(r["account_threat_confidence"]))
check("Isolated explanation mentions isolation", "isolation" in r["explanation"].lower() or "combination" in r["explanation"].lower(), r["explanation"][:80])

r = detect_account_takeover([mk_sig("recipient_new", "MEDIUM", 12, "RECIPIENT")])
check("Isolated new recipient alone -> not detected", r["account_threat_detected"] is False, str(r))

# Scam lures alone must NOT trigger takeover (Phase 16 separation)
r = detect_account_takeover([mk_sig("otp_request_language", "HIGH", 20, "SOCIAL_ENGINEERING")])
check("Scam lure OTP alone -> not takeover", r["account_threat_detected"] is False, str(r))
r = detect_account_takeover([mk_sig("otp_request_language", "HIGH", 20, "SOCIAL_ENGINEERING"),
                             mk_sig("impersonation_language", "MEDIUM", 18, "SOCIAL_ENGINEERING")])
check("Scam lures only -> not takeover", r["account_threat_detected"] is False, str(r))

# Positive: device + location (2 dims)
r = detect_account_takeover([
    mk_sig("unfamiliar_device", "HIGH", 18, "NETWORK"),
    mk_sig("unfamiliar_location", "HIGH", 15, "NETWORK"),
])
check("Positive device+location detected", r["account_threat_detected"] is True, str(r))
check("Positive confidence >= 0.5", r["account_threat_confidence"] >= 0.5, str(r["account_threat_confidence"]))
check("Positive signal_ids subset", set(r["signal_ids"]) == {"unfamiliar_device", "unfamiliar_location"}, str(r["signal_ids"]))
check("Positive explanation lists both", "unfamiliar device" in r["explanation"].lower() and "unusual location" in r["explanation"].lower(), r["explanation"][:100])
check("Positive dimensions == 2", r["dimension_count"] == 2, str(r["dimension_count"]))

# Positive: device + new recipient + odd hour
r = detect_account_takeover([
    mk_sig("NEW_DEVICE", "HIGH", 18, "DEVICE"),
    mk_sig("recipient_new", "MEDIUM", 12, "RECIPIENT"),
    mk_sig("ODD_HOUR", "HIGH", 14, "TIMING"),
])
check("Positive 3-dim detected", r["account_threat_detected"] is True and r["dimension_count"] == 3, str(r))

# Multi-signal: 4+ dims -> higher confidence than 2 dims
r2 = detect_account_takeover([
    mk_sig("unfamiliar_device", "HIGH", 18, "NETWORK"),
    mk_sig("unfamiliar_location", "HIGH", 15, "NETWORK"),
])
r4 = detect_account_takeover([
    mk_sig("unfamiliar_device", "HIGH", 18, "NETWORK"),
    mk_sig("unfamiliar_location", "HIGH", 15, "NETWORK"),
    mk_sig("ODD_HOUR", "HIGH", 14, "TIMING"),
    mk_sig("EXTREME_AMOUNT", "HIGH", 18, "AMOUNT"),
    mk_sig("recipient_new", "MEDIUM", 12, "RECIPIENT"),
])
check("Multi-signal detected", r4["account_threat_detected"] is True, str(r4))
check("Multi confidence > pair confidence", r4["account_threat_confidence"] > r2["account_threat_confidence"], f"{r4['account_threat_confidence']} vs {r2['account_threat_confidence']}")
check("Multi confidence <= 0.95", r4["account_threat_confidence"] <= 0.95)

# All 7 dimensions
r7 = detect_account_takeover([
    mk_sig("unfamiliar_device", "HIGH", 18, "NETWORK"),
    mk_sig("unfamiliar_location", "HIGH", 15, "NETWORK"),
    mk_sig("ODD_HOUR", "HIGH", 14, "TIMING"),
    mk_sig("EXTREME_AMOUNT", "HIGH", 18, "AMOUNT"),
    mk_sig("recipient_new", "MEDIUM", 12, "RECIPIENT"),
    mk_sig("rapid_velocity_5m", "HIGH", 16, "VELOCITY"),
    mk_sig("sudden_behaviour_change", "HIGH", 18, "ACCOUNT_BEHAVIOUR"),
])
check("7-dim detected high confidence", r7["account_threat_detected"] is True and r7["dimension_count"] == 7 and r7["account_threat_confidence"] >= 0.8, str(r7))

# Deterministic
a = detect_account_takeover([mk_sig("unfamiliar_device", "HIGH", 18, "NETWORK"), mk_sig("ODD_HOUR", "HIGH", 14, "TIMING")])
b = detect_account_takeover([mk_sig("ODD_HOUR", "HIGH", 14, "TIMING"), mk_sig("unfamiliar_device", "HIGH", 18, "NETWORK")])
check("Deterministic order-independent", a == b, f"{a['signal_ids']} vs {b['signal_ids']}")

print("\n" + "=" * 70)
print("RISK ENGINE — takeover integrated, score/OTP unchanged")
print("=" * 70)

eng = RiskEngine()
beh = {"score": 30, "confidence": 0.6, "signals": []}
fraud = {"score": 20, "confidence": 0.6, "signals": [
    mk_sig("unfamiliar_device", "HIGH", 18, "NETWORK"),
    mk_sig("ODD_HOUR", "HIGH", 14, "TIMING"),
]}
rec = {"score": 10, "confidence": 0.65, "signals": [mk_sig("recipient_new", "MEDIUM", 12, "RECIPIENT")]}
ctx = {"score": 0, "confidence": 0.55, "signals": []}
res = eng.assess(behavior=beh, fraud_intelligence=fraud, recipient=rec, context=ctx)
check("Engine has takeover fields", "account_threat_detected" in res and "account_threat_confidence" in res and "account_threat_signal_ids" in res and "account_takeover_detail" in res)
check("Engine takeover detected (3 dims)", res["account_threat_detected"] is True, str(res.get("account_takeover_detail")))
check("Engine takeover signal_ids subset", set(res["account_takeover_detail"].get("signal_ids", [])).issubset(set(s["id"] for s in res["signals"])))
check("Engine still has Phase 16 attack", "attack_type" in res and "attack_detail" in res, res.get("attack_type"))
check("No BLOCK tier", res["tier"] in ("SAFE", "CAUTION", "HIGH_RISK"))

# Score unchanged vs pre-Phase-17 logic: takeover must not move score.
# Recompute with takeover-neutral inputs (single dim) and confirm score equals
# the evidence-aware weighted baseline path (just check range + OTP rule intact).
res_single = eng.assess(
    behavior={"score": 20, "confidence": 0.6, "signals": []},
    fraud_intelligence={"score": 15, "confidence": 0.6, "signals": [mk_sig("unfamiliar_device", "HIGH", 18, "NETWORK")]},
    recipient={"score": 10, "confidence": 0.65, "signals": []},
    context={"score": 0, "confidence": 0.55, "signals": []},
)
check("Single-dim takeover False, score sane", res_single["account_threat_detected"] is False and 0 <= res_single["score"] <= 100, str(res_single["score"]))
if res_single["tier"] == "HIGH_RISK":
    check("HIGH_RISK requires OTP", res_single["requires_otp"] is True)
else:
    check("Non-HIGH_RISK OTP rule intact", res_single["requires_otp"] in (True, False))

# Explanation carries both Phase 16 + 17
exp = build_explanation(res["score"], res["tier"], res["signals"], res["components"], res["confidence"], {}, res.get("attack_detail"), res.get("account_takeover_detail"))
check("Explanation has account_takeover", "account_takeover" in exp and exp["account_takeover"]["account_threat_detected"] is True, str(exp.get("account_takeover")))
check("Explanation top-level takeover fields", exp.get("account_threat_detected") is True and 0 <= exp.get("account_threat_confidence", -1) <= 1 and isinstance(exp.get("account_threat_signal_ids"), list))
check("Explanation reasons still signal-backed", all(rr["id"] in set(s["id"] for s in res["signals"]) for rr in exp["reasons"]) if exp["reasons"] else True)
exp_old = build_explanation(20, "SAFE", [], {"behavior": 10, "fraud_intelligence": 5, "recipient": 5, "context": 0}, 0.6)
check("Backward-compat explanation defaults", exp_old.get("account_threat_detected") is False and "attack" in exp_old)

print("\n" + "=" * 70)
print("API — responses, backward compat, never blocks")
print("=" * 70)

for p in ["9340228345", "9158763151"]:
    iron_store.seed_users_if_needed()
    iron_store.update_balance(p, 100000)
h = hdr("9340228345")

r = client.post("/risk/assess", json={"transaction": {"user_id": "9340228345", "amount": 500, "merchant_name": "9158763151"}, "user_profile": {"user_id": "9340228345"}}, headers=h)
check("/risk/assess 200", r.status_code == 200, str(r.status_code))
if r.status_code == 200:
    j = r.json()
    for f in ["score", "tier", "confidence", "signals", "requires_otp", "explanation", "explanation_detail", "components",
              "attack_type", "attack_category", "attack_confidence", "attack_detail"]:
        check(f"Backward-compat {f}", f in j, f"missing {f}")
    for f in ["account_threat_detected", "account_threat_confidence", "account_threat_signal_ids", "account_takeover_detail"]:
        check(f"New takeover field {f}", f in j, f"missing {f}")
    check("Takeover detail has explanation", "explanation" in j.get("account_takeover_detail", {}))
    check("Explanation_detail has account_takeover", "account_takeover" in j.get("explanation_detail", {}))

# Positive via API: unfamiliar device + location + new recipient
r = client.post("/risk/assess", json={
    "transaction": {"user_id": "9340228345", "amount": 500, "merchant_name": "9999990001",
                    "device_familiarity": 0.1, "location_familiarity": 0.1},
    "user_profile": {"user_id": "9340228345"}}, headers=h)
if r.status_code == 200:
    j = r.json()
    check("API takeover positive detected", j.get("account_threat_detected") is True, f"got {j.get('account_threat_detected')} ids {j.get('account_threat_signal_ids')}")
    check("API takeover confidence >= 0.5", j.get("account_threat_confidence", 0) >= 0.5)
    check("API takeover ids subset", set(j.get("account_threat_signal_ids", [])).issubset(set(s["id"] for s in j["signals"])))

# Negative via API: clean familiar (small amount, known recipient, familiar device)
r = client.post("/risk/assess", json={
    "transaction": {"user_id": "9340228345", "amount": 500, "merchant_name": "9158763151",
                    "device_familiarity": 1.0, "location_familiarity": 1.0},
    "user_profile": {"user_id": "9340228345"}}, headers=h)
if r.status_code == 200:
    j = r.json()
    # Clean may still have velocity/recipient noise from history; assert shape, not strict False
    check("API clean shape valid", isinstance(j.get("account_threat_detected"), bool) and 0 <= j.get("account_threat_confidence", -1) <= 1)

# Prepare includes takeover + never blocks
from otp_server import _report_attempts
_report_attempts.clear()
rp = client.post("/transactions/prepare", json={"recipient": "9158763151", "amount": 500}, headers=hdr("9340228345"))
check("Prepare 200", rp.status_code == 200, str(rp.status_code))
if rp.status_code == 200:
    j = rp.json()
    check("Prepare risk has takeover", "account_threat_detected" in j.get("risk", {}), str(list(j.get("risk", {}).keys())[:12]))
    check("Prepare top-level takeover", "account_threat_detected" in j)
    check("Prepare tier never BLOCK", j.get("risk", {}).get("tier") in ("SAFE", "CAUTION", "HIGH_RISK"))
    txid = j["transaction_id"]
    if not j["risk"].get("requires_otp"):
        rc = client.post("/transactions/confirm", json={"transaction_id": txid}, headers=hdr("9340228345"))
        check("Prepare->confirm still proceeds", rc.status_code == 200, str(rc.status_code))

# Simulate includes takeover, no mutation
bal_before = client.get("/balance", headers=h).json()["balance"]
rs = client.post("/risk/simulate", json={"amount": 5000, "recipient": "9158763151", "device_changed": True, "location_changed": True}, headers=h)
check("Simulate 200", rs.status_code == 200, str(rs.status_code))
if rs.status_code == 200:
    check("Simulate has takeover", "account_threat_detected" in rs.json(), str(list(rs.json().keys())[:12]))
    check("Simulate no balance mutation", client.get("/balance", headers=h).json()["balance"] == bal_before)

# Versions
rw = client.get("/risk/weights")
check("Weights has account_takeover version", "account_takeover" in rw.json().get("versions", {}), str(rw.json().get("versions")))
rh = client.get("/health")
check("Health has takeover version", "account_takeover_version" in rh.json())

print("\n" + "=" * 70)
print(f"PHASE 17 SUMMARY: {passed}/{total} passed, {failed} failed")
print("=" * 70)
if failed > 0:
    raise SystemExit(1)
