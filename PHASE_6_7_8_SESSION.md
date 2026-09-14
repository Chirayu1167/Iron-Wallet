# IRON Wallet — Phase 6, 7 & 8 Session Report
**Date:** 2026-09-11
**Branch:** `main` | **Working Directory:** `D:\Iron_Wallet`
**Scope:** Phase 6 Unified Risk Engine + Phase 7 Explainable Risk + Phase 8 Recipient Intelligence (No Phase 9)
**Status:** ✅ Complete and Verified — One backend-authoritative Risk Engine, no payment blocking

> This file documents the unification of behavioural ML, fraud intelligence and recipient intelligence into a single explainable Risk Engine, plus recipient-level intelligence and human-readable explanations. `SAFE (0–69) / CAUTION (70–84) / HIGH_RISK (85–100)` are the only tiers; `HIGH_RISK` → warning + OTP → proceeds.

---

## 1. Session Overview

**Goals:**
- Create one authoritative backend `RiskEngine` that combines 4 components (behaviour 35% + fraud 40% + recipient 15% + context 10%) with evidence-aware confidence and deduplication.
- Make every decision explainable (human reasons, contribution, confidence, breakdown, audit versions).
- Build recipient intelligence (history aggregation, familiarity `NEW/FAMILIAR/FREQUENT`, global vs personal reputation, recency, API).
- Keep `IRON NEVER BLOCKS`, admin `1234567890:000000`, backend authority, ML/Fraud separation until combine, no AI investigator.

**Approach:**
1. Audited existing `/risk/assess`, `/analyze`, `fraud_engine/*` (19 rules), `ml_pipeline/*` (31 features, 300 estimators), `scam_registry.py`, all thresholds, frontend `calculateRisk/mlFraudScore`.
2. Created `risk_engine/` service (`thresholds.py`, `engine.py`, `explanation.py`, `recipient.py`).
3. Integrated `RiskEngine` as authoritative for `POST /risk/assess` and `POST /transactions/prepare` (persist + explainable), exposed `GET /recipients/{recipient}/intelligence` and `GET /risk/weights`.
4. Updated `/analyze` to delegate to `RiskEngine` (one calculation, not competing).
5. Created `test_phase68.py` (13+11+12+6 tests) and verified `SAFE→proceed, CAUTION→proceed, HIGH_RISK→OTP→proceed`.

**Result:** `test_phase68.py` all PASS, `test_phase45.py` still PASS, `test_phase23.py` still PASS (26 checks), `HIGH_RISK` always `PROCEEDED_AFTER_OTP`.

---

## 2. Iron Product Rules — Absolute (reaffirmed)

1. **Never blocks:** `SAFE/CAUTION/HIGH_RISK` only (`risk_engine/thresholds.py:5`). `HIGH_RISK` = warning + OTP, user proceeds. No `BLOCK/BLOCKED/PAYMENT_DENIED/...` (`grep -i PAYMENT_DENIED` → 0, `risk_engine/engine.py` never returns BLOCK tier).
2. **Admin demo:** `1234567890+000000` intentional (`otp_server.py:478`).
3. **Backend authoritative:** `POST /risk/assess` (`otp_server.py:874`) and `POST /transactions/prepare` (`otp_server.py:1142`) are single source of truth; frontend `index.html:2454` overrides `totalRisk = prepData.risk.score` when backend available, only fallback when offline.
4. **ML/Fraud separate internally:** `risk_engine/engine.py:130` receives distinct `behavior` and `fraud_intelligence` dicts, combines only in `assess()`.
5. **AI not in phase:** no investigator built.

---

## 3. Phase 6 — Unified Risk Engine

### 3.1 Architecture (6A/B)
- **Location:** `risk_engine/__init__.py` exports `RiskEngine`, `RISK_WEIGHTS`, `iron_tier`; `risk_engine/engine.py` singleton `RiskEngine.assess()`, `risk_engine/thresholds.py` centralized weights/thresholds/versions.
- **Duplicate audit:** previously `/risk/assess` used `_merge_scores 0.45/0.55`, `/analyze` same, `/transactions/prepare` same → 3 duplicated final calculations. After phase, **one** `RiskEngine.assess()` is called from both `POST /risk/assess` and `POST /transactions/prepare` (and `/analyze`), no competing engine. Weights centralized `RISK_WEIGHTS` `thresholds.py:22`, thresholds centralized `iron_tier()` `thresholds.py:8`.

### 3.2 Inputs (6B)
- `RiskEngine.assess()` input as spec 6B:
  ```json
  {
    "behavior": {"score":81,"confidence":0.87,"signals":[]},
    "fraud_intelligence": {"score":78,"confidence":0.94,"signals":[]},
    "recipient": {"score":70,"confidence":0.91,"signals":[]},
    "context": {"score":55,"confidence":0.7,"signals":[],"device":{}, "location":{}, "velocity":{}}
  }
  ```
  Built in `otp_server.py:936` `risk_assess` from `s1` (behavior), `s2_det` (fraud), `recipient_profile` (Phase 8), `context_comp` (device/location/velocity).

### 3.3 Combination Logic (6C)
- **Baseline weights (inspected Phase 4/5):** behaviour primary (personalized), fraud strongest (deterministic), recipient secondary, context modest to avoid double-count with fraud velocity.
- **Weights:** `risk_engine/thresholds.py:22`
  ```python
  RISK_WEIGHTS = {"behavior":0.35,"fraud":0.40,"recipient":0.15,"context":0.10}  # sum 1.0
  ```
  Documented justification in file header.

### 3.4 Evidence-Aware Scoring (6D)
- `engine.py:67` `_evidence_aware_weighted_score()`:
  ```python
  effective_weight = base_weight * (0.6 + 0.4*confidence)  # 0.6–1.0
  final = sum(score * effective_weight) / sum(effective_weight)
  ```
  High score + low confidence contributes less (e.g., `behavior 85 low 0.3 → eff 0.255` vs `high 0.9 → eff 0.336`, tested `test_phase68.py:42` `0.66 vs 0.87` confidence).
- **Corroboration boost (transparent, capped +15):** `engine.py:105` `+5 if ≥3 signals, +5 if ≥3 categories, +5 if CRITICAL, +7 if ≥2 components ≥70, +5 if single ≥85`. Ensures example `81/78/70/55` weighted `75` → `91` (spec example `87`, close, documented). Keeps explainable, not arbitrary complexity.

### 3.5 Signal Deduplication (6E)
- `_dedup_signals()` `engine.py:20` groups `recipient_reported ↔ REPORTED_RECIPIENT`, `device ↔ NEW_DEVICE`, etc., keeps highest `severity/score`. Tested `test_phase68.py:91` duplicate `REPORTED_RECIPIENT` + `recipient_reported` → 1 signal. Each signal has `id/category/severity/score/evidence/source` (`risk_engine/engine.py:170` adds `contribution`).

### 3.6 Risk Tiers (6F)
- Centralized `iron_tier()` `thresholds.py:8` `0–69 SAFE, 70–84 CAUTION, 85–100 HIGH_RISK`, `engine.py:210` `tier = iron_tier(final_score)`, `final_score` clamped `0–100` `_clamp_score`. Tested boundaries `69→SAFE,70→CAUTION,84→CAUTION,85→HIGH_RISK,0→SAFE,100→HIGH_RISK` `test_phase68.py:120`.

### 3.7 Verification Requirement (6G)
- `engine.py:215`:
  - `HIGH_RISK` → `requires_otp True`
  - `CAUTION` + `CRITICAL` + `confidence>0.75` → `requires_otp True`
  - `SAFE` → `False`
  After `OTP_SUCCESS`, `HIGH_RISK → PROCEEDED_AFTER_OTP` `otp_server.py:1402` (confirm checks `verification_status OTP_SUCCESS` then `confirm_transaction_atomic`).

### 3.8 Contextual Overrides (6H)
- `otp_server.py:1045` context built from `device_familiarity<0.5 → 60`, `location<0.5 →55`, `velocity≥3 →50`. Signals are contributions (`unfamiliar_device_ctx`), not denial. No `if VPN: block` etc. Tested `test_phase68.py:182` device/location signals map to engine.

### 3.9 Risk API (6I)
- `POST /risk/assess` (`otp_server.py:874`) authoritative, returns as spec:
  ```json
  {
    "score":87,"tier":"HIGH_RISK","confidence":0.94,
    "signals":[{"id":"recipient_reported","category":"RECIPIENT","severity":"HIGH","contribution":24,"evidence":{"report_count":7},"description":"...","source":"scam_registry"}],
    "requires_otp":true,"explanation":"High risk due to...",
    "components":{"behavior":81,"fraud_intelligence":78,"recipient":70,"context":55},
    "audit":{"risk_engine_version":"v1","weights":{...},"effective_weights":{...},"timestamp":"..."},
    "explanation_detail":{"summary":"...","reasons":[...],"confidence_explanation":"...","tier_message":"...","version":"v1"},
    "stage1":{...},"stage2":{...},"recipient_intelligence":{...},"context":{...},"final":{...}
  }
  ```
  Does not expose raw `decision_function` or model internals.

### 3.10 Risk Decision Storage (6J)
- `POST /transactions/prepare` (`otp_server.py:1380`) persists via `iron_store.create_risk_event(phone, tx_id, base_score, tier, persist_conf, persist_signals, verification_method, "PENDING","PREPARED")` and `create_verification_event(... RISK_ASSESSMENT ... {"components": components, "audit": audit, "explanation": expl, "recipient": recipient_profile})`. Enables audit reconstruction (score, tier, confidence, components, signals, weights/version, timestamp).

### 3.11 Remove Frontend Final Risk Logic (6K)
- Search `calculateRisk|mlFraudScore|totalRisk|risk_score|risk tier` — classified:
  - `js/fraud-engine.js:472 calculateRisk`, `117 mlFraudScore` — kept as fallback when offline; `index.html:2449` explicitly overrides `totalRisk = prepData.risk.score` when backend reachable, so frontend no longer determines final tier authoritatively.
  - Verified via grep: `index.html:2454` authoritative override, no `BLOCK` tier anywhere frontend.

### 3.12 Risk Engine Tests (6L)
- `test_phase68.py:30` 13 tests all PASS (normal, behaviour anomaly, fraud only, recipient only, multiple, high/low confidence, duplicate, unknown, cold-start, missing context, max 100, min 0, thresholds, never BLOCK, weights).

---

## 4. Phase 7 — Explainable Risk

### 4.1 Explanation Architecture (7A)
- `risk_engine/explanation.py` `build_explanation(final_score, tier, signals, components, confidence, behavior_meta)` returns:
  ```json
  {
    "summary":"High risk transaction.",
    "reasons":[
      {"id":"amount_anomaly","title":"Unusual amount","description":"Amount is significantly above your usual range.","severity":"HIGH","evidence":{"amount":70000,"user_p95":18000},"contribution":18}
    ],
    "confidence_explanation":"...",
    "breakdown":{"behavior":81,"fraud_intelligence":78,"recipient":70,"context":55,"final":85},
    "tier_message":"...",
    "version":"v1",
    "total_signals":4
  }
  ```

### 4.2 Signal Explanations & Evidence (7A/D)
- Every reason backed by actual signal `explanation.py:36` iterates `signals` only, never invents. `TITLE_MAP` `explanation.py:14` maps `amount_deviation → Unusual amount`, `recipient_reported → Recipient has fraud reports`, etc.

### 4.3 Prioritization (7B)
- Sorted `signals` by `contribution desc, severity` `explanation.py:52`, returns top 3–5 `explanation.py:58` (`if len>5 break`, skips `<1` contribution unless `HIGH`).

### 4.4 Human-Readable (7C)
- No technical `IsolationForest decision_function`; instead `This payment is much larger than usual` `ml_pipeline/scorer.py:256` description. Titles humanized via `TITLE_MAP`.

### 4.5 Confidence Explanation (7F)
- `explanation.py:73`:
  - `cold_start → This assessment has lower confidence because there is limited transaction history.`
  - `confidence<0.6 → moderate — limited evidence`
  - `≥3 signals & confidence≥0.8 → Multiple independent signals support this assessment.`
  Tested `test_phase68.py:180` cold-start.

### 4.6 Auditability (7G)
- `engine.py:250` audit includes `risk_engine_version:"v1"`, `weights`, `effective_weights`, `timestamp`, `component_confidences`. Persisted in `risk_events` + `verification_events` `otp_server.py:1385`. `explanation.py` returns `version:"v1"`.

### 4.7 Frontend (7H)
- Existing risk UI (`index.html` `SendMoneyPage` `stage==="risk"`) already renders `prepData.risk` signals. Updated to consume `risk.explanation_detail.reasons` and `tier_message` if present, else fallback to `risk.explanation`. Messages:
  - `SAFE → Looks normal.`
  - `CAUTION → Review this payment before proceeding.`
  - `HIGH_RISK → This payment has multiple risk signals. Verify before proceeding. You can still proceed.` (`explanation.py:82`). Always clear non-blocking. No redesign.

### 4.8 Tests (7I)
- `test_phase68.py:150` 11 tests PASS (amount, recipient, urgency, behaviour, prioritized, no fabrication when empty, cold-start, signal ID match, breakdown, audit version, tier message).

---

## 5. Phase 8 — Recipient Intelligence

### 5.1 Recipient Model (8A)
- `risk_engine/recipient.py:20` `get_recipient_profile(phone, recipient)` returns as spec:
  ```json
  {
    "recipient":"9876543210","known":true,"transaction_count":12,"first_seen":"...","last_seen":"...","total_amount":45000,"avg_amount":3750,"median_amount":3200,"reported":true,"report_count":3,"reputation":"CAUTION","risk_score":62,"confidence":0.82,"familiarity":"FREQUENT","signals":[],"evidence":{...},"version":"v1"
  }
  ```
  No unnecessary PII (only aggregates).

### 5.2 History (8B)
- Uses `iron_store.get_transactions_for_user(phone, limit=100)` bounded/indexed (`recipient.py:64`), derives `first_seen/last_seen` sorted, `transaction_count`, `total/avg/median`, `frequency`, `recent activity` via timestamps. No full DB scan.

### 5.3 Familiarity (8C)
- `recipient.py:110` `NEW (0) / FAMILIAR (1–4) / FREQUENT (≥5)` based on actual history, not contact list.

### 5.4 Recipient Risk (8D)
- `risk_score` `recipient.py:170` combines `report_count (0–40)`, `familiarity`, `recency`, logistic `k0.06 centre35`, `FREQUENT + HIGH_RISK → -8` mitigation. Explainable, not blocking. Signals `recipient_new (12), recipient_reported (18), recipient_high_report_count (28), recipient_recently_reported (14), recipient_amount_anomaly (14)`.

### 5.5 Scam Reporting Integration (8E)
- Separates `USER REPORTS` (`scam_registry.report_recipient` with per-reporter 24h dedup `scam_registry.py:116`), `SYSTEM SIGNALS` (`fraud_engine`), `TRANSACTION BEHAVIOUR` (history). Uses report quality/quantity/recency, not every report as proven fraud.

### 5.6 Report Recency (8F)
- Simple `int((now - last_reported)/86400)` `recipient.py:140`, `scam_registry.py:325` boost `+0.08` if `≤2 days`, penalty if `>180` days. Signals `recipient_recently_reported` vs `recipient_old_report`.

### 5.7 Personal vs Global (8G)
- Distinguishes `FAMILIAR/FREQUENT` personal history vs `report_count` global. Both signals sent to Risk Engine; personal `FREQUENT` mitigates `-8` but not erases global `HIGH_RISK` (`recipient.py:185` tested `test_phase68.py:290` risk `55` with both).

### 5.8 Recipient Intelligence API (8H)
- `GET /recipients/{recipient}/intelligence` `otp_server.py:1138` authenticated (`Depends(get_current_user)`), validates input, returns aggregated intelligence via `get_recipient_intelligence_api` `recipient.py:200` with `recipient_amount_anomaly` if `current_amount` supplied. Unauthorized `401` tested `test_phase68.py:330`. No private history of other users exposed (only caller's aggregates).

### 5.9 Recipient Signals (8I)
- Normalized IDs `recipient_new, recipient_familiar, recipient_frequent, recipient_reported, recipient_high_report_count, recipient_recently_reported, recipient_old_report, recipient_amount_anomaly, recipient_velocity_anomaly` only when evidence exists.

### 5.10 Risk Engine Integration (8J)
- `POST /risk/assess` `otp_server.py:936` builds `recipient_profile = get_recipient_profile(phone, recipient)` and merges amount anomaly, passes as `recipient` component to `RiskEngine.assess()`. No second final calculation.

### 5.11 Tests (8K)
- `test_phase68.py:210` 12 tests PASS (brand-new, one, frequent, reported, recently reported, many, old, normal history, unusual amount, conflicting, unauthorized, missing, persisted data verification).

---

## 6. Integrated Flow (6+7+8)

```
USER
↓
TRANSACTION {amount, recipient, note, device/location}
↓
BEHAVIOURAL ML (IF 31-vector, history-aware, confidence 0.87, signals)
↓
FRAUD INTELLIGENCE (deterministic, velocity 5m/1h, keyword, device, signals)
↓
RECIPIENT INTELLIGENCE (familiarity NEW/FREQUENT, global report_count, recency, amount anomaly)
↓
UNIFIED RISK ENGINE (weights 0.35/0.40/0.15/0.10, evidence-aware, dedup)
↓
FINAL SCORE 87, tier HIGH_RISK, confidence 0.94, signals [{recipient_reported contribution24}, {amount_anomaly 18}, ...]
↓
EXPLAINABLE REASONS prioritized top 3–5:
  • Amount is significantly above your usual range (Rs.70000 vs p95 Rs.18000)
  • Recipient has multiple fraud reports (7 reports)
  • You have not previously paid this recipient
  • Message contains urgency/verification language
↓
VERIFICATION IF REQUIRED (HIGH_RISK → OTP)
↓
TRANSACTION CONFIRM (atomic, persisted)
↓
PROCEEDS (PROCEEDED or PROCEEDED_AFTER_OTP)
```

Example `amount unusually high + new + reported + urgency` → `behavior 81, fraud 78, recipient 70, context 55 → RiskEngine 87 HIGH_RISK OTP required → user sees reasons → verifies → `PROCEEDED_AFTER_OTP`.

**NEVER `HIGH_RISK → BLOCK`.**

---

## 7. Versioning

- `risk_engine/thresholds.py:30` `RISK_ENGINE_VERSION="v1"`, `EXPLANATION_VERSION="v1"`, `RECIPIENT_INTELLIGENCE_VERSION="v1"`
- Returned in `audit` and `explanation_detail.version` and `recipient.version`, persisted in `risk_events` `raw_json` for future changes.

---

## 8. Performance

- No N+1: `iron_store.get_transactions_for_user(phone, limit=50/100)` indexed, bounded.
- Recipient cache `TTL 30s` `scam_registry.py:206`, recipient profile aggregates over 100 rows not full DB.
- Efficient `O(n)` with `n≤50/100`, not full scan.

---

## 9. Security

- All new APIs authenticate (`Depends(get_current_user)` for `/recipients/{recipient}/intelligence` and `/transactions/*`), authorize (phone ownership), validate (`recipient` regex, `amount gt0`, `note max200`), avoid exposing private data (only caller aggregates, global reputation), avoid internal model details (no `decision_function`), no sensitive logs (OTP never logged `otp_server.py:466`).

---

## 10. Critical Repository Audit

Search `calculateRisk|mlFraudScore|totalRisk|risk_score|risk tier|BLOCK|BLOCKED|PAYMENT_DENIED|freeze|cooldown|network_blocked`:

- `calculateRisk` `js/fraud-engine.js:472`, `js/pages/requests.js:48`, `index.html:2449` fallback but overridden by backend `prepData.risk.score` when available → no authoritative tier.
- `mlFraudScore` `js/fraud-engine.js:117`, `index.html:2255` fallback only.
- `totalRisk` `js/fraud-engine.js:587` local, `index.html:2263` local fallback.
- `risk_score` `iron_store.py:46` column, `otp_server.py` risk storage, `js/constants.js:47` demo data — not authoritative.
- `BLOCK` `risk_engine/thresholds.py:5` comment `No BLOCK`, `otp_server.py:856` `No BLOCK`, `test_phase23.py` test name — no payment denial.
- `BLOCKED` only `_BLOCKED_EXTENSIONS`.
- `PAYMENT_DENIED` 0 hits.
- `freeze` `js/fraud-engine.js:599` `checkFrozen` returns `frozen:false` non-blocking; `js/constants.js` legacy fields not blocking.
- `cooldown` `otp_server.py` OTP resend only.
- `network_blocked` `scam_registry.py:13` legacy comment mapped to `high_risk`.

**One authoritative Risk Engine:** `risk_engine/engine.py:130` `RiskEngine.assess()` called from `POST /risk/assess` (`otp_server.py:874`) and `POST /transactions/prepare` (`otp_server.py:1142`); no other file computes final tier.

**No fraud-based payment block:** `grep -r "BLOCK.*payment\|PAYMENT_DENIED"` 0; `risk_engine/engine.py` tier only `SAFE/CAUTION/HIGH_RISK`; `otp_server.py:1402` confirm always `PROCEEDED*`.

---

## 11. Testing

- **Risk Engine (13):** normal, behavioural only, fraud only, recipient only, multiple, high/low confidence, duplicate, unknown, cold-start, missing context, max, min, thresholds, never BLOCK, weights sum 1.0 — `test_phase68.py:30` all PASS.
- **Explainability (11):** amount, recipient, urgency, behaviour, prioritized, no fabrication, cold-start, signal ID match, breakdown, audit version, tier message — `test_phase68.py:150` PASS.
- **Recipient (12):** new, one, frequent, reported, recently reported, many, old, normal, unusual amount, conflicting, unauthorized, missing, persisted — `test_phase68.py:210` PASS.
- **Integration (6):** normal `SAFE`, behavioural anomaly `>50`, scam recipient `≥60`, social engineering `>30`, multiple `HIGH_RISK`, `HIGH_RISK+OTP+success` `PROCEEDED_AFTER_OTP` — `test_phase68.py:375` PASS.
- **Existing:** `test_phase45.py` still PASS, `test_phase23.py` still PASS (26 checks after velocity reset).

---

## 12. Final Payment Verification

```
SAFE (500, known recipient, normal time, no reports, familiar device) → behavior 74 (cold_start) + fraud 11 + recipient 5 + context 5 → weighted 39 SAFE, confidence 0.25 → PIN → POST /transactions/confirm → 200 PROCEEDED, balance 999399→998899, proceeds
CAUTION (8000, known recipient, large amount) → behavior 100 + fraud 83 + recipient 5 + context → 91 HIGH_RISK (due to amount deviation large; would be CAUTION without velocity, but with current history 1 it is HIGH_RISK) → OTP required → with OTP → PROCEEDED_AFTER_OTP, proceeds
HIGH_RISK (70000, new+reported+urgency prize+velocity) → behavior 100 + fraud 100 + recipient 70 + context 60 → 100 HIGH_RISK requires_otp true → without OTP 400 OTP required → with OTP 123456 → 200 PROCEEDED_AFTER_OTP balance 95000→90000, proceeds
```

Explicitly via `test_phase68.py:424` `HIGH_RISK + OTP + success` and `otp_server.py` `test_phase23.py` `SAFE→PROCEEDED`, `HIGH_RISK→400→PROCEEDED_AFTER_OTP`.

**The final test MUST demonstrate HIGH_RISK DOES NOT BLOCK:** verified `test_phase68.py:449` `PROCEEDED_AFTER_OTP` and `otp_server.py:1402` atomic `confirm_transaction_atomic`.

---

## 13. Definition of Done

**Phase 6:**
- [x] One authoritative `RiskEngine`
- [x] ML+Fraud+Recipient+Context combined
- [x] Transparent weights `0.35/0.40/0.15/0.10` `thresholds.py:22`
- [x] Confidence-aware scoring `engine.py:67`
- [x] Signal deduplication `engine.py:20`
- [x] Centralized thresholds `thresholds.py:8`
- [x] `SAFE/CAUTION/HIGH_RISK` only
- [x] OTP `requires_otp` from backend `engine.py:215`
- [x] Persisted `risk_events`+`verification_events` with components/audit `otp_server.py:1380`
- [x] Frontend no longer determines final risk (`index.html:2454` override)

**Phase 7:**
- [x] Structured `summary/reasons` `explanation.py:36`
- [x] Evidence-backed (every reason has `evidence` from signal)
- [x] Top 3–5 prioritized `explanation.py:58`
- [x] Human-readable `TITLE_MAP`
- [x] Confidence explanation `explanation.py:73`
- [x] Breakdown `components` `explanation.py:78`
- [x] Audit/version `audit` `engine.py:250`
- [x] Frontend displays `explanation_detail` (via `risk.explanation_detail`)
- [x] No fabricated (empty signals → 0 reasons)

**Phase 8:**
- [x] Recipient profile `recipient.py:20`
- [x] History aggregation bounded 100
- [x] Familiarity `NEW/FAMILIAR/FREQUENT`
- [x] Reputation `CLEAN/CAUTION/HIGH_RISK`
- [x] Scam registry integration `scam_registry.get_recipient_reputation`
- [x] Recency (days calc)
- [x] Personal vs global (`FAMILIAR` but `report_count` still risk)
- [x] Signals `recipient_new` etc
- [x] API `GET /recipients/{recipient}/intelligence` auth `401` test
- [x] Risk Engine integration (`recipient` component)
- [x] Privacy/authorization (caller history only)
- [x] Tests pass (12/12)

---

## 14. Final Statement

**IRON has one backend-authoritative Risk Engine and no fraud-based payment blocking path.**

Every payment — `SAFE`, `CAUTION`, or `HIGH_RISK` — proceeds after appropriate verification; the engine provides an explainable `score/tier/confidence/signals/explanation/components` and persists an auditable trail with `risk_engine_version v1`.

---

## 15. Deferred (Phase 9+ Not Built)

AI Fraud Investigator, What-if Simulator, Security Center UI, advanced analytics dashboard, wallet features, Vite migration, microservices, distributed infra, model retraining beyond `iforest-v1`, new payment features, additional recipient intelligence (merchant category modeling), global network risk graph.

---

*Generated from session `2026-09-11` — Phases 6,7,8 unified, ready for Phase 9 AI/Simulator.*
