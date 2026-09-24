"""
Phase 20 — Security Operations Center tests.
Unified read-only view over existing intelligence. No new engine, no scoring
changes, no mutation. IRON NEVER BLOCKS A PAYMENT.
"""
from fastapi.testclient import TestClient
from otp_server import app
import iron_store
import scam_registry

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

print("=" * 70)
print("PHASE 20 — SOC dashboard / API integration")
print("=" * 70)

for p in ["9340228345", "9158763151"]:
    iron_store.seed_users_if_needed()
    iron_store.update_balance(p, 100000)

hA = hdr("9340228345")

# Auth required
r = client.get("/soc/overview")
check("SOC unauth 401", r.status_code == 401, str(r.status_code))

r = client.get("/soc/overview", headers=hA)
check("SOC 200", r.status_code == 200, str(r.status_code))
j = r.json() if r.status_code == 200 else {}
for section in ["status", "recent_events", "security_events", "risk_activity",
                "activity", "tier_counts", "intel", "suspicious_recipients",
                "versions", "is_simulated", "source", "note"]:
    check(f"SOC section {section}", section in j, f"missing {section}")
if "status" in j:
    for f in ["account_security", "recent_activity", "active_sessions", "recent_risk_alerts"]:
        check(f"SOC status {f}", f in j["status"], f"missing {f}")
    check("SOC status values valid",
          j["status"].get("account_security") in ("Good", "Needs attention", "Review recommended") and
          j["status"].get("recent_activity") in ("Normal", "Elevated", "High"),
          str(j["status"]))
check("SOC real-data markers", j.get("is_simulated") is False and j.get("source") == "live")
for v in ["risk_engine", "explanation", "recipient", "attack_classifier",
          "account_takeover", "network", "model"]:
    check(f"SOC version {v}", v in j.get("versions", {}), str(list(j.get("versions", {}).keys())))
intel = j.get("intel", {})
if intel:
    for f in ["score", "tier", "signals", "signal_ids", "attack_type", "attack_detail",
              "account_takeover_detail", "network_detail", "investigation",
              "network_threat_detected", "network_type"]:
        check(f"SOC intel {f}", f in intel, f"missing {f}")
    check("SOC intel tier valid", intel.get("tier") in ("SAFE", "CAUTION", "HIGH_RISK"), str(intel.get("tier")))

print("\n" + "=" * 70)
print("PHASE 20 — real vs simulated events")
print("=" * 70)

# Baseline real state
tx_before = len(client.get("/transactions", headers=hA).json()["transactions"])
bal_before = client.get("/balance", headers=hA).json()["balance"]
soc_before = client.get("/soc/overview", headers=hA).json()
risk_ev_before = len(soc_before.get("risk_activity", []))

# Simulated attacks must never persist anywhere real
for scen in ["fake_kyc", "otp_harvesting", "account_takeover", "scam_campaign"]:
    rs = client.post("/risk/simulate", json={"scenario": scen}, headers=hdr("9340228345"))
    check(f"Simulate {scen} flagged simulated",
          rs.status_code == 200 and rs.json().get("simulation") is True,
          str(rs.status_code))
soc_after = client.get("/soc/overview", headers=hA).json()
check("Simulations create no transactions",
      len(client.get("/transactions", headers=hA).json()["transactions"]) == tx_before)
check("Simulations change no balances",
      client.get("/balance", headers=hA).json()["balance"] == bal_before)
check("Simulations create no risk events",
      len(soc_after.get("risk_activity", [])) == risk_ev_before)
check("SOC stays real-only", soc_after.get("is_simulated") is False)

print("\n" + "=" * 70)
print("PHASE 20 — evidence consistency + drill-down")
print("=" * 70)

# Fresh signal-rich transaction (unique recipient keeps other suites clean)
from otp_server import _report_attempts, _simulate_attempts
_report_attempts.clear()
_simulate_attempts.clear()
rp = client.post("/transactions/prepare",
                 json={"recipient": "9997700020", "amount": 5000,
                       "note": "congratulations you won prize claim cashback reward"},
                 headers=hdr("9340228345"))
check("Prepare evidence tx 200", rp.status_code == 200, str(rp.status_code))
txid = rp.json().get("transaction_id") if rp.status_code == 200 else None

soc = client.get("/soc/overview", headers=hA).json()
intel = soc.get("intel", {})
# Latest snapshot tracks the newest transaction
check("Intel tracks latest transaction",
      (intel.get("transaction") or {}).get("transaction_id") == txid, str((intel.get("transaction") or {}).get("transaction_id")))
# Intel signal_ids ⊆ full signals
sig_ids = {s.get("id") for s in intel.get("signals", []) if isinstance(s, dict) and s.get("id")}
check("Intel signal_ids subset of signals",
      set(intel.get("signal_ids", [])).issubset(sig_ids), str(intel.get("signal_ids")))
for det, name in [("attack_detail", "attack"), ("account_takeover_detail", "takeover"), ("network_detail", "network")]:
    d = intel.get(det, {}) or {}
    check(f"Intel {name} ids subset of signals",
          set(d.get("signal_ids", [])).issubset(sig_ids), f"{name}: {d.get('signal_ids')}")
# Investigation findings grounded in backend evidence
allowed = set(sig_ids)
for det in (intel.get("attack_detail") or {}, intel.get("account_takeover_detail") or {},
            intel.get("network_detail") or {}):
    if isinstance(det, dict):
        for sid in det.get("signal_ids", []) or []:
            allowed.add(sid)
inv = intel.get("investigation", {}) or {}
bad = [eid for f_ in inv.get("key_findings", []) for eid in f_.get("evidence_ids", []) if eid not in allowed]
check("Investigation evidence grounded", bad == [], str(bad[:3]))
check("Investigation has scenario+factors",
      "attack_scenario" in inv and "affected_factors" in inv, str(list(inv.keys())))
# Drill-down: risk event carries signals + linked transaction
match = [e for e in soc.get("risk_activity", []) if e.get("transaction_id") == txid]
check("Risk event present for drill-down", len(match) == 1, f"found {len(match)}")
if match:
    e = match[0]
    check("Drill-down has signal list", isinstance(e.get("signal_ids"), list) and len(e.get("signal_ids", [])) > 0, str(e.get("signal_ids")))
    check("Drill-down transaction enriched",
          (e.get("transaction") or {}).get("recipient") == "9997700020" and float((e.get("transaction") or {}).get("amount", 0)) == 5000.0,
          str(e.get("transaction")))
    check("Drill-down tier valid", e.get("tier") in ("SAFE", "CAUTION", "HIGH_RISK"))
# Explanation detail carries all intel blocks (explainable)
ed = intel.get("explanation_detail", {}) or {}
for b in ["attack", "account_takeover", "scam_network"]:
    check(f"Explanation block {b}", b in ed, str(list(ed.keys())))

print("\n" + "=" * 70)
print("PHASE 20 — never-block behavior")
print("=" * 70)

tiers_ok = all(t.get("risk_tier") in ("SAFE", "CAUTION", "HIGH_RISK")
               for t in client.get("/transactions", headers=hA).json()["transactions"])
check("Stored tiers never BLOCK", tiers_ok)
tiers_ok2 = all(e.get("tier") in ("SAFE", "CAUTION", "HIGH_RISK")
                for e in soc.get("risk_activity", []))
check("Risk-event tiers never BLOCK", tiers_ok2)
rp2 = client.post("/transactions/prepare", json={"recipient": "9158763151", "amount": 500}, headers=hdr("9340228345"))
check("Real payment prepares after SOC", rp2.status_code == 200, str(rp2.status_code))
if rp2.status_code == 200 and not rp2.json()["risk"].get("requires_otp"):
    rc = client.post("/transactions/confirm", json={"transaction_id": rp2.json()["transaction_id"]}, headers=hdr("9340228345"))
    check("Real payment confirms after SOC", rc.status_code == 200, str(rc.status_code))

print("\n" + "=" * 70)
print(f"PHASE 20 SUMMARY: {passed}/{total} passed, {failed} failed")
print("=" * 70)
if failed > 0:
    raise SystemExit(1)
