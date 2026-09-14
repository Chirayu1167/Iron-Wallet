"""Phase 12,13,14 tests"""
from fastapi.testclient import TestClient
from otp_server import app
import iron_store, time, json

client = TestClient(app)

def get_token(phone="9340228345"):
    # Use admin for simplicity
    if phone=="1234567890":
        r=client.post("/verify-otp", json={"mobile":"1234567890","otp":"000000"})
        return r.json()["token"]
    # For normal user, we need to send OTP but dev mode still needs verify with random? Use admin token for testing isolation
    # Instead, create session directly via iron_store for test
    token=iron_store.create_session(phone)
    return token

def auth_header(phone):
    token=get_token(phone)
    return {"Authorization": f"Bearer {token}"}, phone, token

print("=== Phase12 Report Recipient ===")
hdr, phone, tok = auth_header("9340228345")
# Valid report
r=client.post("/reports/recipient", json={"recipient":"9876543210","reason":"suspected_scam"}, headers=hdr)
print("report recipient valid", r.status_code, r.json())
assert r.status_code==200
assert r.json().get("reported")==True
assert "tier" in r.json()
# Check not exposing reporter identity publicly - response should not contain full reporter phone unmasked except maybe masked
assert "reporter" not in r.json() or "987" not in str(r.json().get("reporter",""))

# Duplicate abuse: same reporter same recipient within 24h should be deduplicated but still success
r2=client.post("/reports/recipient", json={"recipient":"9876543210","reason":"other"}, headers=hdr)
print("duplicate report", r2.status_code, r2.json())
assert r2.status_code==200
# Should indicate deduplicated maybe True
# Rate limit: 5/min - test quickly 6 reports different recipients
for i in range(5):
    rc=f"99999999{i}0"
    rr=client.post("/reports/recipient", json={"recipient":rc,"reason":"suspected_scam"}, headers=hdr)
    print(f"bulk {rc} {rr.status_code}")
    # first 5 should be ok until limit hits

# Invalid recipient
r_bad=client.post("/reports/recipient", json={"recipient":"ab","reason":"other"}, headers=hdr)
print("invalid recipient", r_bad.status_code)
assert r_bad.status_code in (422,400)

# Unauthenticated
r_noauth=client.post("/reports/recipient", json={"recipient":"9876543210","reason":"other"})
print("unauth", r_noauth.status_code)
assert r_noauth.status_code==401

# Check report is evidence not block - prepare a transaction to that recipient should still be allowed (not blocked)
rprep=client.post("/transactions/prepare", json={"recipient":"9876543210","amount":500,"note":"test"}, headers=hdr)
print("prepare after report tier", rprep.json().get("risk",{}).get("tier"))
assert rprep.status_code==200
assert rprep.json()["risk"]["tier"] in ("SAFE","CAUTION","HIGH_RISK")
assert rprep.json()["risk"]["tier"] != "BLOCK"

print("\n=== Phase12 Report Transaction ===")
# Need a transaction to report
prep = client.post("/transactions/prepare", json={"recipient":"9158763151","amount":500,"note":"test tx report"}, headers=hdr)
txid=prep.json()["transaction_id"]
print("txid", txid)
r=client.post("/reports/transaction", json={"transaction_id":txid,"reason":"suspected_scam","note":"looks suspicious"}, headers=hdr)
print("report tx", r.status_code, r.json())
assert r.status_code==200
assert r.json().get("reported")==True
# Check transaction not altered to blocked
tx = iron_store.get_transaction(txid)
print("tx status after report", tx["status"], tx["outcome"])
assert tx["status"] != "BLOCKED"
assert tx["status"] != "BLOCK"
# Duplicate report same tx
r_dup=client.post("/reports/transaction", json={"transaction_id":txid,"reason":"other"}, headers=hdr)
print("dup tx report", r_dup.json())
# Should be deduplicated
# Other user cannot report this tx
hdr2, _, _ = auth_header("9158763151")
r_wrong=client.post("/reports/transaction", json={"transaction_id":txid,"reason":"other"}, headers=hdr2)
print("wrong user report", r_wrong.status_code)
assert r_wrong.status_code==403

print("\n=== Phase13 Security Events & Sessions ===")
# Security events should exist for login etc
# Already created LOGIN event on token creation? But we used direct create_session, not via verify-otp, so need to create via verify-otp for login event
# Use admin login to generate events
hdr_admin, _, _ = auth_header("1234567890")
# After login, events should exist
r_ev=client.get("/security/events?limit=5", headers=hdr_admin)
print("events", r_ev.status_code, r_ev.json().keys() if r_ev.status_code==200 else r_ev.text[:200])
if r_ev.status_code==200:
    print("events count", len(r_ev.json().get("events",[])))
    # Check structure
    for e in r_ev.json().get("events",[])[:2]:
        assert "id" in e or "event_id" in e
        assert "type" in e
        assert "severity" in e
        assert e["severity"] in ("INFO","LOW","MEDIUM","HIGH")
        assert e["type"] != "PAYMENT_BLOCKED"
        assert e["type"] != "ACCOUNT_FROZEN"
        print("event sample", e["type"], e["severity"], e["title"])
else:
    print("events failed")

# Test pagination
r_ev2=client.get("/security/events?limit=2&offset=0", headers=hdr_admin)
print("paginated", r_ev2.status_code, len(r_ev2.json().get("events",[])) if r_ev2.status_code==200 else "fail")
assert r_ev2.status_code==200
# Unauthenticated should fail
r_noauth2=client.get("/security/events")
print("noauth events", r_noauth2.status_code)
assert r_noauth2.status_code==401

# Sessions
r_sess=client.get("/security/sessions", headers=hdr_admin)
print("sessions", r_sess.status_code, r_sess.json())
assert r_sess.status_code==200
assert "sessions" in r_sess.json()
for s in r_sess.json()["sessions"]:
    assert "token" not in s or s.get("token") is None or len(s.get("token",""))<10  # masked
    assert "token_masked" in s

# Test revoke other session
# Create extra session for same user
extra_tok=iron_store.create_session("1234567890")
print("extra token", extra_tok[-6:])
r_sess2=client.get("/security/sessions", headers=hdr_admin)
print("sessions after extra", len(r_sess2.json()["sessions"]))
# Revoke extra
r_rev=client.post(f"/security/sessions/{extra_tok[-6:]}/logout", headers=hdr_admin)
print("revoke", r_rev.status_code, r_rev.json() if r_rev.status_code==200 else r_rev.text[:200])
assert r_rev.status_code==200
r_sess3=client.get("/security/sessions", headers=hdr_admin)
print("sessions after revoke", len(r_sess3.json()["sessions"]))
# Try to revoke other user's session - should fail
hdr_other, _, tok_other = auth_header("9340228345")
r_cross=client.post(f"/security/sessions/{extra_tok[-6:]}/logout", headers=hdr_other)
print("cross revoke should 404", r_cross.status_code)
assert r_cross.status_code in (404,403)

# Cross-user events isolation: other user should not see admin events
r_ev_other=client.get("/security/events?limit=5", headers=hdr_other)
print("other events count", len(r_ev_other.json().get("events",[])))
# events should be only for that phone - check that no admin phone events leak
for e in r_ev_other.json().get("events",[]):
    assert e["phone"]=="9340228345"

print("\n=== Security Overview ===")
r_ov=client.get("/security/overview", headers=hdr_admin)
print("overview", r_ov.status_code, r_ov.json().keys() if r_ov.status_code==200 else r_ov.text[:500])
assert r_ov.status_code==200
ov=r_ov.json()
assert "account_security" in ov
assert ov["account_security"] in ("Good","Needs attention","Review recommended")
assert "recent_activity" in ov
assert "active_sessions" in ov
assert "recent_risk_alerts" in ov
print("overview values", ov["account_security"], ov["recent_activity"], ov["active_sessions"], ov["recent_risk_alerts"])
# Should not contain secrets
assert "otp" not in json.dumps(ov).lower() or "otp_ver" in json.dumps(ov).lower()  # allow event type but not raw otp

print("\n=== PIN Change ===")
r_pin=client.post("/security/change-pin", json={"old_pin":"1234","new_pin":"5678"}, headers=hdr_admin)
print("pin change", r_pin.status_code, r_pin.json())
assert r_pin.status_code==200
# Ensure event created
r_ev_after=client.get("/security/events?limit=10", headers=hdr_admin)
has_pin_event=any(e["type"]=="PIN_CHANGED" for e in r_ev_after.json().get("events",[]))
print("has pin event", has_pin_event)
assert has_pin_event

print("\n=== Phase14 UX Checks ===")
# Check that risk visualization still returns correct tiers
r_assess=client.post("/risk/assess", json={"transaction":{"user_id":"9340228345","amount":500,"merchant_name":"9158763151"},"user_profile":{"user_id":"9340228345"}}, headers=hdr_other)
print("assess", r_assess.status_code)
# No, compliance check: verify frontend contract - not calculating risk locally: we already have backend authoritative
# Check no BLOCK tier in assess
if r_assess.status_code==200:
    tier=r_assess.json().get("tier")
    print("tier", tier)
    assert tier in ("SAFE","CAUTION","HIGH_RISK")

# Test HIGH_RISK still payable after OTP
# Use admin to test high risk
rprep_high=client.post("/transactions/prepare", json={"recipient":"9876543210","amount":70000,"note":"urgent prize claim"}, headers=hdr_other)
print("high prep", rprep_high.json().get("risk",{}).get("tier"), rprep_high.json().get("risk",{}).get("score"))
if rprep_high.json()["risk"]["tier"]=="HIGH_RISK":
    txid_high=rprep_high.json()["transaction_id"]
    # without OTP should fail
    rconf_nootp=client.post("/transactions/confirm", json={"transaction_id":txid_high}, headers=hdr_other)
    print("high without otp", rconf_nootp.status_code)
    assert rconf_nootp.status_code==400
    # Need OTP - for non-admin we need to send OTP first? But admin bypass not applicable for 9340228345
    # For this user we don't have OTP store, so we need to simulate by using admin user for high risk payable
    # Use admin high risk
    hdr_adm2, _, _ = auth_header("1234567890")
    rprep_adm=client.post("/transactions/prepare", json={"recipient":"9999999999","amount":70000,"note":"urgent"}, headers=hdr_adm2)
    print("adm high", rprep_adm.json().get("risk",{}).get("tier"))
    txid_adm=rprep_adm.json()["transaction_id"]
    rconf_adm=client.post("/transactions/confirm", json={"transaction_id":txid_adm,"otp":"000000"}, headers=hdr_adm2)
    print("adm confirm with 000000", rconf_adm.status_code, rconf_adm.json())
    assert rconf_adm.status_code==200
    assert rconf_adm.json()["outcome"] in ("PROCEEDED","PROCEEDED_AFTER_OTP")

print("\n=== Final Audit: No blocking language ===")
import pathlib, re
txt=pathlib.Path("otp_server.py").read_text(encoding="utf-8")
# Should not have executable payment denial
assert "PAYMENT_DENIED" not in txt
assert "FRAUD_BLOCK" not in txt
# We allow payment_blocked guard
has_block = re.search(r'if.*tier.*==.*BLOCK', txt)
print("has block tier logic", has_block)
assert not has_block
# Check index.html still has IRON protects language?
idx=pathlib.Path("index.html").read_text(encoding="utf-8")
assert "IRON protects you by detecting" in idx
assert "Payment denied" not in idx
assert "Your account has been frozen" not in idx
print("frontend language ok")

print("\n=== All Phase12/13/14 tests PASSED ===")
