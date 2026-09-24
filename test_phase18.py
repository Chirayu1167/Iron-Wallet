"""
Phase 18 — Scam Network & Campaign Intelligence tests.
Lightweight, existing data only; no new score. RiskEngine is single source.
IRON NEVER BLOCKS A PAYMENT. No score/tier/OTP change.
"""
import time
from fastapi.testclient import TestClient
from otp_server import app
import iron_store
import scam_registry
from risk_engine.scam_network import detect_scam_network, SCAM_NETWORK_VERSION
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

def mk_sig(sid, sev="MEDIUM", score=10, cat="RECIPIENT", ev=None):
    return {"id": sid, "category": cat, "severity": sev, "score": score,
            "evidence": ev or {}, "description": sid, "source": "test"}

def net_ctx(recipient="9999990001", report_count=0, reporter_count=0, reasons=None,
            user_tx_count=0, handle="", attack_type="NONE"):
    return {"recipient": recipient, "report_count": report_count,
            "reporter_count": reporter_count, "reasons": reasons or [],
            "user_tx_count": user_tx_count, "handle": handle,
            "attack_type": attack_type}

print("=" * 70)
print("PHASE 18 — UNIT: network needs corroboration, not single signals")
print("=" * 70)

# Clean data
r = detect_scam_network([], {}, {"attack_type": "NONE"}, {}, net_ctx())
check("Clean -> not detected NONE 0.0", r["network_threat_detected"] is False and r["network_type"] == "NONE" and r["network_confidence"] == 0.0, str(r["network_type"]))
check("Version present", r.get("version") == SCAM_NETWORK_VERSION)

# Single recipient, single report = reputation only, NOT network
r = detect_scam_network(
    [mk_sig("recipient_reported", "HIGH", 18, "RECIPIENT")],
    {"report_count": 1}, {"attack_type": "NONE"}, {"recipient": "9999990001"},
    net_ctx(report_count=1, reporter_count=1, reasons=["scam"]),
)
check("Single report -> reputation only, not network", r["network_threat_detected"] is False, str(r))
check("Reputation explanation", "reputation only" in r["explanation"].lower(), r["explanation"][:90])

# Weak evidence: LOW handle ignored; single MEDIUM handle alone -> 1 piece
r = detect_scam_network(
    [mk_sig("suspicious_upi_handle", "LOW", 18, "RECIPIENT", {"handle": "refund"})],
    {}, {"attack_type": "NONE"}, {"recipient": "x@refund"},
    net_ctx(handle="refund"),
)
check("Weak LOW handle -> not detected", r["network_threat_detected"] is False and r["network_confidence"] < 0.5, str(r))
r = detect_scam_network(
    [mk_sig("suspicious_upi_handle", "HIGH", 18, "RECIPIENT", {"handle": "refund"})],
    {}, {"attack_type": "NONE"}, {"recipient": "x@refund"},
    net_ctx(handle="refund"),
)
check("Single handle alone -> not network", r["network_threat_detected"] is False, str(r))

# Repeated recipient: same recipient reappearing + velocity cluster
r = detect_scam_network(
    [mk_sig("rapid_velocity_5m", "HIGH", 16, "VELOCITY")],
    {"transaction_count": 3}, {"attack_type": "NONE"}, {"recipient": "9999990002"},
    net_ctx(recipient="9999990002", user_tx_count=3),
)
check("Repeated recipient + velocity -> cluster", r["network_threat_detected"] is True and r["network_type"] == "RECIPIENT_REPEAT_CLUSTER", str(r))
check("Cluster confidence >= 0.5", r["network_confidence"] >= 0.5, str(r["network_confidence"]))

# Cross-user: multi-reporter + repeated lure
r = detect_scam_network(
    [], {"report_count": 3}, {"attack_type": "FAKE_REFUND_REWARD"}, {"recipient": "9999990003"},
    net_ctx(recipient="9999990003", report_count=3, reporter_count=3, reasons=["prize scam"], attack_type="FAKE_REFUND_REWARD"),
)
check("Cross-user multi-reporter + lure -> reported network", r["network_threat_detected"] is True and r["network_type"] == "REPORTED_RECIPIENT_NETWORK", str(r))

# Shared handle campaign: handle + lure (no reports)
r = detect_scam_network(
    [mk_sig("suspicious_upi_handle", "HIGH", 18, "RECIPIENT", {"handle": "refund"})],
    {}, {"attack_type": "FAKE_REFUND_REWARD"}, {"recipient": "prize@refund"},
    net_ctx(recipient="prize@refund", handle="refund", attack_type="FAKE_REFUND_REWARD"),
)
check("Shared handle + lure -> handle campaign", r["network_threat_detected"] is True and r["network_type"] == "SHARED_HANDLE_CAMPAIGN", str(r))

# Repeated attack campaign: lure + velocity
r = detect_scam_network(
    [mk_sig("rapid_velocity_5m", "HIGH", 16, "VELOCITY")],
    {}, {"attack_type": "OTP_HARVESTING"}, {"recipient": "9999990004"},
    net_ctx(attack_type="OTP_HARVESTING"),
)
check("Repeated lure + velocity -> attack campaign", r["network_threat_detected"] is True and r["network_type"] == "REPEATED_ATTACK_CAMPAIGN", str(r))

# Same reporter repeating (report_count>=2 but 1 distinct reporter) -> NOT cross-user
r = detect_scam_network(
    [], {"report_count": 2}, {"attack_type": "NONE"}, {"recipient": "9999990005"},
    net_ctx(report_count=2, reporter_count=1),
)
check("Same-reporter repeats -> not cross-user network", r["network_threat_detected"] is False, str(r))

# Confidence bounds + determinism
for kwargs in [
    dict(signals=[mk_sig("suspicious_upi_handle", "HIGH", 18, "RECIPIENT", {"handle": "refund"})],
         recipient_profile={}, attack={"attack_type": "FAKE_REFUND_REWARD"},
         transaction={"recipient": "a@refund"}, network_context=net_ctx(recipient="a@refund", handle="refund", attack_type="FAKE_REFUND_REWARD")),
    dict(signals=[], recipient_profile={"report_count": 3}, attack={"attack_type": "IMPERSONATION"},
         transaction={"recipient": "9999990006"}, network_context=net_ctx(report_count=3, reporter_count=3, attack_type="IMPERSONATION")),
]:
    rr = detect_scam_network(**kwargs)
    check(f"Confidence 0-1 for {rr['network_type']}", 0.0 <= rr["network_confidence"] <= 0.9, str(rr["network_confidence"]))
a = detect_scam_network(
    [mk_sig("suspicious_upi_handle", "HIGH", 18, "RECIPIENT", {"handle": "refund"}),
     mk_sig("rapid_velocity_5m", "HIGH", 16, "VELOCITY")],
    {}, {"attack_type": "FAKE_REFUND_REWARD"}, {"recipient": "a@refund"},
    net_ctx(recipient="a@refund", handle="refund", attack_type="FAKE_REFUND_REWARD"))
b = detect_scam_network(
    [mk_sig("rapid_velocity_5m", "HIGH", 16, "VELOCITY"),
     mk_sig("suspicious_upi_handle", "HIGH", 18, "RECIPIENT", {"handle": "refund"})],
    {}, {"attack_type": "FAKE_REFUND_REWARD"}, {"recipient": "a@refund"},
    net_ctx(recipient="a@refund", handle="refund", attack_type="FAKE_REFUND_REWARD"))
check("Deterministic order-independent", a == b, f"{a['signal_ids']} vs {b['signal_ids']}")

print("\n" + "=" * 70)
print("RISK ENGINE — network integrated, score/OTP unchanged")
print("=" * 70)

eng = RiskEngine()
beh = {"score": 30, "confidence": 0.6, "signals": []}
fraud = {"score": 20, "confidence": 0.6, "signals": [
    mk_sig("suspicious_upi_handle", "HIGH", 18, "RECIPIENT", {"handle": "refund"}),
    mk_sig("rapid_velocity_5m", "HIGH", 16, "VELOCITY"),
]}
rec = {"score": 10, "confidence": 0.65, "signals": [],
       "report_count": 3, "reported": True, "reputation": "HIGH_RISK"}
ctx = {"score": 0, "confidence": 0.55, "signals": []}
txn = {"merchant_name": "prize@refund", "recipient": "prize@refund", "amount": 500}
nctx = {"recipient": "prize@refund", "report_count": 3, "reporter_count": 3,
        "reasons": ["prize"], "user_tx_count": 0, "handle": "refund",
        "attack_type": "FAKE_REFUND_REWARD"}
# Attack needed for repeated_lure piece: pass via network_context (engine fills from its own attack if absent,
# but explicit here keeps the unit deterministic regardless of attack datapath).
res = eng.assess(behavior=beh, fraud_intelligence=fraud, recipient=rec, context=ctx,
                 transaction=txn, network_context=nctx)
check("Engine has network fields", all(k in res for k in ("network_threat_detected", "network_confidence", "network_type", "network_signal_ids", "network_detail")))
check("Engine network detected", res["network_threat_detected"] is True, str(res.get("network_detail")))
check("Engine network signal_ids subset", set(res["network_detail"].get("signal_ids", [])).issubset(set(s["id"] for s in res["signals"])))
check("Engine still has Ph16/17", "attack_type" in res and "account_takeover_detail" in res)
check("No BLOCK tier", res["tier"] in ("SAFE", "CAUTION", "HIGH_RISK"))

# Score unchanged by network layer: same inputs with/without context corroboration
# must yield identical score/tier/requires_otp (network is advisory only).
res_a = eng.assess(behavior=beh, fraud_intelligence=fraud, recipient=rec, context=ctx, transaction=txn,
                   network_context=dict(nctx, report_count=0, reporter_count=0, reasons=[]))
res_b = eng.assess(behavior=beh, fraud_intelligence=fraud, recipient=rec, context=ctx, transaction=txn,
                   network_context=dict(nctx, report_count=5, reporter_count=5, reasons=["a", "b"]))
check("Score identical regardless of network evidence", res_a["score"] == res_b["score"] and res_a["tier"] == res_b["tier"], f"{res_a['score']} vs {res_b['score']}")
check("OTP rule identical", res_a["requires_otp"] == res_b["requires_otp"])

# Explanation carries all three layers
exp = build_explanation(res["score"], res["tier"], res["signals"], res["components"], res["confidence"], {},
                        res.get("attack_detail"), res.get("account_takeover_detail"), res.get("network_detail"))
check("Explanation has scam_network", "scam_network" in exp and exp["scam_network"]["network_threat_detected"] is True, str(exp.get("scam_network")))
check("Explanation top-level network fields", exp.get("network_threat_detected") is True and exp.get("network_type") == res["network_type"] and isinstance(exp.get("network_signal_ids"), list))
check("Explanation reasons still signal-backed", all(rr["id"] in set(s["id"] for s in res["signals"]) for rr in exp["reasons"]) if exp["reasons"] else True)
exp_old = build_explanation(20, "SAFE", [], {"behavior": 10, "fraud_intelligence": 5, "recipient": 5, "context": 0}, 0.6)
check("Backward-compat explanation defaults", exp_old.get("network_threat_detected") is False and exp_old.get("network_type") == "NONE" and "attack" in exp_old)

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
              "attack_type", "attack_detail", "account_takeover_detail", "network_detail"]:
        check(f"Backward-compat {f}", f in j, f"missing {f}")
    for f in ["network_threat_detected", "network_confidence", "network_type", "network_signal_ids", "network_detail"]:
        check(f"New network field {f}", f in j, f"missing {f}")
    check("Detail has explanation+evidence", "explanation" in j.get("network_detail", {}) and "evidence" in j.get("network_detail", {}))
    check("Explanation_detail has scam_network", "scam_network" in j.get("explanation_detail", {}))

# Cross-user pattern via API: same recipient reported by 2 distinct users + lure
uniq = f"99918{str(int(time.time()) % 100000).zfill(5)}"[:10]
scam_registry.report_recipient(uniq, "9340228345", "prize scam", 1000)
scam_registry.report_recipient(uniq, "9158763151", "prize scam", 1000)
r = client.post("/risk/assess", json={
    "transaction": {"user_id": "9340228345", "amount": 500, "merchant_name": uniq, "note": "congratulations you won prize claim reward"},
    "user_profile": {"user_id": "9340228345"}}, headers=h)
if r.status_code == 200:
    j = r.json()
    check("API cross-user network detected", j.get("network_threat_detected") is True, f"got {j.get('network_threat_detected')} type {j.get('network_type')}")
    check("API network type reported", j.get("network_type") == "REPORTED_RECIPIENT_NETWORK", str(j.get("network_type")))
    check("API network ids subset", set(j.get("network_signal_ids", [])).issubset(set(s["id"] for s in j["signals"])))

# Clean data via fresh user + fresh recipient (no history, no reports)
fresh = f"90018{str(int(time.time()) % 100000).zfill(5)}"[:10]
try:
    iron_store.create_user(fresh, "FreshNet", 50000, 30, True, "freshnet@iron")
except Exception:
    pass
hFresh = hdr(fresh)
clean_recip = f"99919{str((int(time.time()) + 7) % 100000).zfill(5)}"[:10]
r = client.post("/risk/assess", json={
    "transaction": {"user_id": fresh, "amount": 500, "merchant_name": clean_recip},
    "user_profile": {"user_id": fresh}}, headers=hFresh)
if r.status_code == 200:
    j = r.json()
    check("API clean shape valid", isinstance(j.get("network_threat_detected"), bool) and 0 <= j.get("network_confidence", -1) <= 0.9)

# Prepare includes network + never blocks; confirm still proceeds
from otp_server import _report_attempts
_report_attempts.clear()
rp = client.post("/transactions/prepare", json={"recipient": "9158763151", "amount": 500}, headers=hdr("9340228345"))
check("Prepare 200", rp.status_code == 200, str(rp.status_code))
if rp.status_code == 200:
    j = rp.json()
    check("Prepare risk has network", "network_threat_detected" in j.get("risk", {}))
    check("Prepare top-level network", "network_threat_detected" in j and "network_type" in j)
    check("Prepare tier never BLOCK", j.get("risk", {}).get("tier") in ("SAFE", "CAUTION", "HIGH_RISK"))
    txid = j["transaction_id"]
    if not j["risk"].get("requires_otp"):
        rc = client.post("/transactions/confirm", json={"transaction_id": txid}, headers=hdr("9340228345"))
        check("Prepare->confirm still proceeds", rc.status_code == 200, str(rc.status_code))

# Simulate includes network, no mutation
bal_before = client.get("/balance", headers=h).json()["balance"]
rs = client.post("/risk/simulate", json={"amount": 5000, "recipient": "9158763151"}, headers=h)
check("Simulate 200", rs.status_code == 200, str(rs.status_code))
if rs.status_code == 200:
    check("Simulate has network", "network_threat_detected" in rs.json())
    check("Simulate no balance mutation", client.get("/balance", headers=h).json()["balance"] == bal_before)

# Versions
rw = client.get("/risk/weights")
check("Weights has network version", "network" in rw.json().get("versions", {}), str(rw.json().get("versions")))
rh = client.get("/health")
check("Health has network version", "network_version" in rh.json())

print("\n" + "=" * 70)
print(f"PHASE 18 SUMMARY: {passed}/{total} passed, {failed} failed")
print("=" * 70)
if failed > 0:
    raise SystemExit(1)
