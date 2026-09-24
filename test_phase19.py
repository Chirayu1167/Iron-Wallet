"""
Phase 19 — AI Investigator + Attack Simulator tests.
Grounded intel, deterministic fallback, scenario presets, no DB mutation.
IRON NEVER BLOCKS A PAYMENT. RiskEngine remains source of truth.
"""
import re
from fastapi.testclient import TestClient
from otp_server import app
import iron_store
import scam_registry
from ai_investigator.investigator import (
    _fallback_investigation,
    investigate,
    INVESTIGATOR_VERSION,
)

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

def _allowed_from_risk(risk_data):
    allowed = set()
    for comp in (risk_data.get("behavior") or {}, risk_data.get("fraud_intelligence") or {},
                 risk_data.get("recipient_intelligence") or {}, risk_data.get("context") or {},
                 risk_data, risk_data.get("explanation_detail") or {}):
        if isinstance(comp, dict):
            for s in comp.get("signals", []) or []:
                if isinstance(s, dict) and s.get("id"):
                    allowed.add(s["id"])
            for sid in comp.get("signal_ids", []) or []:
                if isinstance(sid, str) and sid:
                    allowed.add(sid)
            for r_ in comp.get("reasons", []) or []:
                if isinstance(r_, dict) and r_.get("id"):
                    allowed.add(r_["id"])
    for det in (risk_data.get("attack_detail") or {}, risk_data.get("account_takeover_detail") or {},
                risk_data.get("network_detail") or {}):
        if isinstance(det, dict):
            for sid in det.get("signal_ids", []) or []:
                allowed.add(sid)
    return allowed

print("=" * 70)
print("PHASE 19 — INVESTIGATOR grounding + fallback")
print("=" * 70)

for p in ["9340228345", "9158763151"]:
    iron_store.seed_users_if_needed()
    iron_store.update_balance(p, 100000)

# Scam-lure transaction for grounding checks
hA = hdr("9340228345")
r = client.post("/transactions/prepare",
                json={"recipient": "9158763151", "amount": 500,
                      "note": "congratulations you won prize claim cashback reward"},
                headers=hA)
check("Prepare lure tx 200", r.status_code == 200, str(r.status_code))
txid = r.json().get("transaction_id") if r.status_code == 200 else None

if txid:
    r = client.post("/risk/investigate", json={"transaction_id": txid}, headers=hA)
    check("Investigate 200", r.status_code == 200, str(r.status_code))
    if r.status_code == 200:
        j = r.json()
        for f in ["summary", "risk_explanation", "key_findings", "evidence",
                  "recommended_action", "confidence", "investigator_version",
                  "attack_scenario", "affected_factors", "recommended_actions"]:
            check(f"Investigator field {f}", f in j, f"missing {f}")
        check("Investigator version", j.get("investigator_version") == INVESTIGATOR_VERSION, str(j.get("investigator_version")))
        # Grounding: every evidence_id must come from backend signals
        tx = iron_store.get_transaction(txid)
        from otp_server import _get_risk_for_transaction
        risk_data = _get_risk_for_transaction("9340228345", tx)
        allowed = _allowed_from_risk(risk_data)
        bad = [eid for f_ in j.get("key_findings", []) for eid in f_.get("evidence_ids", []) if eid not in allowed]
        check("No invented evidence_ids", bad == [], str(bad[:3]))
        # Scenario matches backend attack evidence (or unclear when NONE)
        atk = (risk_data.get("attack_detail") or {}).get("attack_type", "NONE")
        scen = str(j.get("attack_scenario", ""))
        if atk == "NONE":
            check("Scenario unclear when no attack", "no specific" in scen.lower() or "unclear" in scen.lower(), scen[:60])
        else:
            check("Scenario matches backend attack", atk.replace("_", " ").split()[0] in scen.upper() or scen.upper() in atk or any(w in scen.upper() for w in atk.split("_")), f"{scen[:60]} vs {atk}")
        # No invented recipients/victims: any 10-digit number must be the tx recipient
        blob = " ".join([j.get("summary", ""), j.get("risk_explanation", "")] +
                        [f_.get("finding", "") for f_ in j.get("key_findings", [])])
        nums = set(re.findall(r"\d{10}", blob))
        check("No invented recipients", nums <= {"9158763151"}, str(nums))
        # Never block
        rec_all = j.get("recommended_action", "") + " " + " ".join(j.get("recommended_actions", []))
        check("Recommended never blocks", "block" not in rec_all.lower() or "not block" in rec_all.lower(), rec_all[:80])
        # RiskEngine still source of truth: score/tier echoed, not recalculated
        check("Risk echoed from backend", str(tx.get("risk_score", "")) in j.get("summary", "") or str(tx.get("risk_tier", "")).lower() in j.get("summary", "").lower() or "risk" in j.get("summary", "").lower(), j.get("summary", "")[:60])

# Fallback determinism (direct, no history drift)
if txid:
    tx = iron_store.get_transaction(txid)
    from otp_server import _get_risk_for_transaction
    risk_data = _get_risk_for_transaction("9340228345", tx)
    kw = dict(transaction={"transaction_id": txid, "amount": 500, "recipient": "9158763151"},
              risk=risk_data, behavior=risk_data.get("behavior", {}),
              fraud_intelligence=risk_data.get("fraud_intelligence", {}),
              recipient_intelligence=risk_data.get("recipient_intelligence", {}),
              context=risk_data.get("context", {}),
              explanation=risk_data.get("explanation_detail", {}),
              attack=risk_data.get("attack_detail", {}),
              account_takeover=risk_data.get("account_takeover_detail", {}),
              scam_network=risk_data.get("network_detail", {}))
    f1 = _fallback_investigation(**kw)
    f2 = _fallback_investigation(**kw)
    check("Fallback deterministic", f1 == f2)
    check("Fallback has intel fields", all(k in f1 for k in ("attack_scenario", "affected_factors", "recommended_actions")), str(list(f1.keys())))

# Fallback when Gemini unavailable (timeout) — monkeypatch to raise
if txid:
    import ai_investigator.investigator as inv_mod
    orig = inv_mod._call_gemini
    async def _boom(*a, **kw):
        raise TimeoutError("simulated timeout")
    inv_mod._call_gemini = _boom
    try:
        r = client.post("/risk/investigate", json={"transaction_id": txid}, headers=hA)
        check("Timeout fallback 200", r.status_code == 200, str(r.status_code))
        if r.status_code == 200:
            check("Timeout fallback has intel", "attack_scenario" in r.json() and "affected_factors" in r.json())
    finally:
        inv_mod._call_gemini = orig

# Malformed LLM output (invented ids + block) must fall back cleanly
if txid:
    import ai_investigator.investigator as inv_mod2
    from unittest.mock import AsyncMock, patch
    bad_llm = {"summary": "bad", "risk_explanation": "bad",
               "key_findings": [{"finding": "bad", "evidence_ids": ["invented_id_123"], "severity": "HIGH"}],
               "evidence": [], "recommended_action": "block payment now", "confidence": 0.9}
    with patch.object(inv_mod2, "_call_gemini", new=AsyncMock(return_value=bad_llm)):
        r = client.post("/risk/investigate", json={"transaction_id": txid}, headers=hA)
        check("Malformed LLM fallback 200", r.status_code == 200, str(r.status_code))
        if r.status_code == 200:
            j = r.json()
            has_invented = any("invented_id_123" in str(f_.get("evidence_ids")) for f_ in j.get("key_findings", []))
            check("Malformed fallback drops invented ids", not has_invented)
            check("Malformed fallback never blocks", "block" not in j.get("recommended_action", "").lower() or "not block" in j.get("recommended_action", "").lower())

# Takeover/network context surfaces in investigation (plain language + factors)
# NOTE: use a recipient unique to Phase 19 so other suites' "new recipient"
# assumptions (e.g. 9999990001) are not polluted by the real prepare below.
hB = hdr("9340228345")
r = client.post("/transactions/prepare",
                json={"recipient": "9997700018", "amount": 5000,
                      "note": "urgent", "device_familiarity": 0.1,
                      "location_familiarity": 0.1, "hour_of_day": 3},
                headers=hB)
txid2 = r.json().get("transaction_id") if r.status_code == 200 else None
check("Prepare takeover-context tx 200", r.status_code == 200, str(r.status_code))
if txid2:
    r = client.post("/risk/investigate", json={"transaction_id": txid2}, headers=hB)
    if r.status_code == 200:
        j = r.json()
        check("Intel factors present", isinstance(j.get("affected_factors"), list), str(j.get("affected_factors"))[:80])
        check("Intel actions present", isinstance(j.get("recommended_actions"), list), str(j.get("recommended_actions"))[:80])

print("\n" + "=" * 70)
print("PHASE 19 — SIMULATOR scenarios (simulated, no mutation)")
print("=" * 70)

hS = hdr("9340228345")
expect_attack = {
    "fake_kyc": "FAKE_KYC_SUSPENSION",
    "otp_harvesting": "OTP_HARVESTING",
    "remote_access": "REMOTE_ACCESS",
    "investment_loan": "INVESTMENT_LOAN_SCAM",
    "scam_campaign": "FAKE_REFUND_REWARD",
}
for scen, exp_atk in expect_attack.items():
    rs = client.post("/risk/simulate", json={"scenario": scen}, headers=hS)
    check(f"Scenario {scen} 200", rs.status_code == 200, str(rs.status_code))
    if rs.status_code == 200:
        j = rs.json()
        check(f"Scenario {scen} flagged simulated", j.get("simulation") is True and j.get("scenario") == scen and j.get("scenario_applied") is True)
        check(f"Scenario {scen} attack {exp_atk}", j.get("attack_type") == exp_atk, str(j.get("attack_type")))
        check(f"Scenario {scen} intel present", all(k in j for k in ("account_threat_detected", "network_threat_detected", "network_type")) and j.get("risk", {}).get("tier") in ("SAFE", "CAUTION", "HIGH_RISK"))
        check(f"Scenario {scen} labeled simulated", "simulat" in str(j.get("note", "")).lower() or "simulat" in str(j.get("explanation", "")).lower() or j.get("simulation") is True)

rs = client.post("/risk/simulate", json={"scenario": "account_takeover"}, headers=hS)
check("Scenario account_takeover 200", rs.status_code == 200, str(rs.status_code))
if rs.status_code == 200:
    j = rs.json()
    check("Takeover scenario detected", j.get("account_threat_detected") is True, str(j.get("account_threat_confidence")))
    check("Takeover intel in risk", j.get("risk", {}).get("account_threat_detected") is True)

rs = client.post("/risk/simulate", json={"scenario": "scam_campaign"}, headers=hS)
if rs.status_code == 200:
    j = rs.json()
    check("Campaign network detected", j.get("network_threat_detected") is True, f"{j.get('network_type')}")

# Invalid scenario rejected, legacy params still work
rs = client.post("/risk/simulate", json={"scenario": "nonsense_xyz"}, headers=hS)
check("Invalid scenario 422", rs.status_code == 422, str(rs.status_code))
rs = client.post("/risk/simulate", json={"amount": 5000, "recipient": "9158763151"}, headers=hS)
check("Legacy simulate still 200 + simulated", rs.status_code == 200 and rs.json().get("simulation") is True and rs.json().get("scenario") is None)

# Determinism: same scenario twice -> identical risk core
r1 = client.post("/risk/simulate", json={"scenario": "otp_harvesting"}, headers=hS).json()
r2 = client.post("/risk/simulate", json={"scenario": "otp_harvesting"}, headers=hS).json()
check("Scenario deterministic", r1.get("risk", {}).get("score") == r2.get("risk", {}).get("score") and r1.get("attack_type") == r2.get("attack_type"), f"{r1.get('risk', {}).get('score')} vs {r2.get('risk', {}).get('score')}")

# No DB mutation across all scenarios
bal_before = client.get("/balance", headers=hS).json()["balance"]
tx_before = len(client.get("/transactions", headers=hS).json()["transactions"])
rep_before = scam_registry.get_recipient_risk("prize@refund").get("report_count", 0)
for scen in ["fake_kyc", "otp_harvesting", "remote_access", "account_takeover", "investment_loan", "scam_campaign"]:
    client.post("/risk/simulate", json={"scenario": scen}, headers=hS)
check("Simulations never mutate balance", client.get("/balance", headers=hS).json()["balance"] == bal_before)
check("Simulations never create transactions", len(client.get("/transactions", headers=hS).json()["transactions"]) == tx_before)
check("Simulations never mutate registry", scam_registry.get_recipient_risk("prize@refund").get("report_count", 0) == rep_before)

# Never block: all scenarios tier-safe + real payment still proceeds
from otp_server import _report_attempts, _simulate_attempts
_report_attempts.clear()
_simulate_attempts.clear()
all_tiers_ok = True
for scen in ["fake_kyc", "otp_harvesting", "remote_access", "account_takeover", "investment_loan", "scam_campaign"]:
    t = client.post("/risk/simulate", json={"scenario": scen}, headers=hdr("9340228345")).json().get("risk", {}).get("tier")
    if t not in ("SAFE", "CAUTION", "HIGH_RISK"):
        all_tiers_ok = False
check("No scenario tier BLOCKs", all_tiers_ok)
rp = client.post("/transactions/prepare", json={"recipient": "9158763151", "amount": 500}, headers=hdr("9340228345"))
if rp.status_code == 200 and not rp.json()["risk"].get("requires_otp"):
    rc = client.post("/transactions/confirm", json={"transaction_id": rp.json()["transaction_id"]}, headers=hdr("9340228345"))
    check("Real payment proceeds after simulations", rc.status_code == 200, str(rc.status_code))
else:
    check("Real payment prepare ok", rp.status_code == 200, str(rp.status_code))

print("\n" + "=" * 70)
print(f"PHASE 19 SUMMARY: {passed}/{total} passed, {failed} failed")
print("=" * 70)
if failed > 0:
    raise SystemExit(1)
