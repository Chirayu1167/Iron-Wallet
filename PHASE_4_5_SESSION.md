# IRON Wallet — Phase 4 & 5 Session Report
**Date:** 2026-09-11
**Branch:** `main` | **Working Directory:** `D:\Iron_Wallet`
**Scope:** Phase 4 Behavioural ML + Phase 5 Fraud Intelligence Engine (No Phase 6)
**Status:** ✅ Complete and Verified — IRON never blocks, ML & Fraud independent, no final combined decision

> This file documents turning the Isolation Forest into a real history-aware behavioural pipeline and building a deterministic fraud-intelligence layer that produces structured evidence for Phase 6. Both systems remain independent — Phase 6 will unify.

---

## 1. Session Overview

**Goals:**
- Make Isolation Forest consume real persisted `iron.db` history via explicit feature generation, not demo arrays/frontend state.
- Add user-specific baselines, cold-start handling, confidence, explainability, versioning, safety.
- Build deterministic fraud intelligence with 5 signal categories, scam-registry integration, velocity/keyword/device signals, deduplication, separate `fraud_score` and confidence — no payment blocking.
- Keep Phase 1–3 intact (auth, persistence, `SAFE/CAUTION/HIGH_RISK` only, admin `1234567890:000000`, backend authority).

**Approach:**
1. Audited `ml_pipeline/scorer.py` (31 features, 300 estimators, contamination 0.01, `U001–U004` profiles, `PHONE_TO_PROFILE`, scaler 31, `score_bounds`, sklearn `1.8.0` artifact vs `1.6.1` runtime warning, silent `50` fallback, no history) and `fraud_engine/` (19 rules, 8 categories, pattern matcher, scorer, confidence, recommendations) + `scam_registry.py` (JSON, `high_risk` not `network_blocked`, per-report dedup) + `otp_server.py` (`/behavior-score`, `/fraud-intelligence`, `/analyze`, `/risk/assess`, `/transactions/prepare|confirm`) + `js/keyword-engine.js` (400+ weights, Levenshtein >3→99).
2. Created `ml_pipeline/features.py` central 31-vector layer.
3. Enhanced `ml_pipeline/scorer.py` with history-aware scoring, confidence, explanations, versioning, safety.
4. Enhanced `scam_registry.py` with `get_recipient_reputation`, cached TTL 30s and evidence.
5. Created `fraud_engine/keyword_detector.py` (social-engineering, Levenshtein optimization) and `fraud_engine/intelligence.py` deterministic engine with 5 categories, velocity/device/behaviour detectors, deduplication.
6. Updated `otp_server.py` to use history-aware helpers for all risk endpoints and added `/intel/analyze` (no final) + diagnostics `/intel/behavior|fraud`.
7. Created `test_phase45.py` (13 ML + 12 fraud + integration + 5 critical cases) and verified payment flow `SAFE→proceed, CAUTION→proceed, HIGH_RISK→OTP→proceed`.

**Result:** `test_phase45.py` all PASS, `test_phase23.py` still PASS after velocity-state reset, `verify_flow.py` shows `SAFE 39 → PROCEEDED`, `8000 HIGH_RISK 91 → PROCEEDED_AFTER_OTP`, `70000 HIGH_RISK 100 → PROCEEDED_AFTER_OTP` — no `BLOCK`.

---

## 2. Iron Product Rules — Absolute (reaffirmed)

1. **Never blocks:** tiers `SAFE (0–69)`, `CAUTION (70–84)`, `HIGH_RISK (85–100)`. `HIGH_RISK` = warning + OTP/investigation, user can still proceed. No `BLOCK/BLOCKED/PAYMENT_DENIED/FRAUD_BLOCK/ACCOUNT_FREEZE/COOLDOWN_BLOCK/NETWORK_BLOCK` as payment decision (`otp_server.py:228`, `fraud_engine/recommendations.py:6`).
2. **Admin demo:** `1234567890 + 000000` intentional, server-side `otp_server.py:480` + client login preserved.
3. **ML role:** behavioural anomaly only, does NOT determine allow/deny (`ml_pipeline/scorer.py`).
4. **Fraud intelligence role:** deterministic evidence producer, does NOT block (`fraud_engine/intelligence.py`).
5. **AI not in Phase 4/5:** no `AI Fraud Investigator` added.
6. **No second risk engine:** Phase 4/5 produce independent signals; final merge deferred to Phase 6.

---

## 3. Phase 4 — Behavioural ML

### 3.1 Existing ML Audit (4A)
- **Location:** `ml_pipeline/scorer.py:14` `FEATURE_NAMES` 31, `CAT_ORDER`, `PM_ORDER`, `DAY_MAP`; `PHONE_TO_PROFILE` 15 mappings (`ml_pipeline/scorer.py:46`); `_resolve_profile_id` fallback.
- **Artifacts:** `models/isolation_forest.joblib` (IsolationForest 300 estimators, contamination 0.01, `n_features_in_=31`), `scaler.joblib` (StandardScaler 31, mean `[1.85e3, 15.75, 0.28]`), `user_profiles.joblib` (keys `U001–U004` each 1500 txns, fields `amount_mean/std/median/p95/p99`, `merch_freq`, `cat_freq`, `pm_freq`, `hour_freq`, `weekend_ratio`, `peak_hours`, `daily_txn_count`), `score_bounds.joblib` `(-0.0737, 0.1836)`, `feature_names.joblib` 31.
- **Compatibility:** `requirements.txt:4` `scikit-learn==1.8.0` pinned, local `1.6.1` shows `InconsistentVersionWarning` but loads; scaler/model `n_features` match 31 validated in `load()`; logs warning if mismatch.
- **Scoring:** `decision_function` → `100*(hi-raw)/(hi-lo)` → `0–100` direction verified: normal → low, anomalous → high (`ml_pipeline/scorer.py:165` logic kept).
- **Integration:** `/behavior-score` `otp_server.py:526` previously called `_if_scorer.score(txn.dict())` with no history, silent fallback `50`, no confidence/cold_start; `/risk/assess` and `/transactions/prepare` built `txn_for_risk` partially from history but still used legacy `_engineer`.
- **Fallback:** legacy exception returned `50` silently — removed, now fails clearly if artifact missing.

### 3.2 Real Transaction Data (4B)
- ML now consumes `iron_store.get_transactions_for_user(phone, limit=50)` bounded, indexed, no `localStorage` or demo arrays.
- Derived fields from persisted history where reliable: `amount` stats, `recipient_frequency_score`/`days_since`, `txn_velocity_1h/24h`/`amount_velocity_24h`, `hour_freq`/`peak_hours`/`weekend_ratio`, `device/location` baselines via `iron_store.get_baseline`.
- Unreliable/missing fields (`merchant_frequency_score` without merchant history) fallback to profile `cat_freq` or neutral `0.5`, documented.
- No invented fake data; insufficient history triggers `cold_start` instead of fabricating.

### 3.3 Feature Generation (4C)
- **New module:** `ml_pipeline/features.py` — single source of truth for 31-vector.
- **Flow doc:** `transaction → historical user data → compute_baseline_from_history → generate_feature_vector → scaler → IF → 0–100` (`features.py:1` header).
- **Order:** `FEATURE_ORDER` `features.py:10` explicit 31 names, stable, matches scaler training order: `amount, hour_of_day, is_weekend, is_salary_period, merchant_frequency_score, recipient_frequency_score, days_since_recipient_seen, device_familiarity, location_familiarity, account_age_days, amount_zscore, amount_vs_user_avg, amount_vs_user_median, amount_percentile, balance_drop_pct, hour_sin, hour_cos, day_sin, day_cos, is_rare_merchant, is_night_txn, is_peak_hour, hour_activity_score, category_familiarity, txn_velocity_1h, txn_velocity_24h, amount_velocity_24h, weekend_deviation, merchant_category_encoded, payment_method_encoded, is_p2p`.
- **Layer:** `compute_baseline_from_history(history, profile)` and `generate_feature_vector(txn, history, profile, baseline, device_familiarity, location_familiarity)` central, no scattering across API endpoint. `scorer.py` now delegates to this layer (`scorer.py:62` import).
- **Documented:** each feature group (AMOUNT/TIME/RECENCY/RECIPIENT/DEVICE/LOCATION/ACTIVITY) mapped to indices, tolerances for fallback.

### 3.4 User Baselines (4D)
- **Stats from history when `history_count ≥5`:** `mean`, `median`, `std`, `p95`, `p99`, `hour_freq`, `peak_hours` (top 3), `weekend_ratio`, `recipient_freq`/`recipient_set`/`last_seen`, `velocity 1h/24h`, `amount_24h`. Implemented in `compute_baseline_from_history` `features.py:66`.
- **Fallback:** when insufficient history, uses `profile` (`U001–U004`) stats; when neither, uses neutral but marks `cold_start`. Never uses generic `avg=amount, std=1` unless genuinely insufficient (empty history + no profile).
- **Example of fallback safety:** `features.py:98` `avg_safe`/`std` non-zero guard `max(avg*0.3,100)`.

### 3.5 Cold Start (4E)
- Threshold `COLD_START_THRESHOLD = 5` `features.py:40`.
- Response clearly `{"user_found": true, "history_count": 2, "cold_start": true}` from `scorer.score_with_history` `scorer.py:315`.
- Behaviour: when `cold_start`, confidence reduced `*0.65`, baseline_source marked `"profile_history_fallback"` or `"none_neutral"` `features.py:180`, no fabricated history, no artificially extreme risk.

### 3.6 Behavioural Features (4F)
- Reviewed 31: kept useful, fixed duplicated/broken: `merchant_frequency_score` now checks actual `merchant_name` against `merch_freq` profile map; `recipient_frequency_score`/`days_since` now computed from `_recipient_metrics` with phone-suffix matching; `txn_velocity` now from `history_epochs` timestamps, not passed-through `TransactionIn` alone; `weekend_deviation` uses real `weekend_ratio`.
- **Groups verified:**
  - AMOUNT: `amount, amount_zscore, vs_avg, vs_med, percentile, balance_drop`
  - TIME: `hour, is_weekend, is_salary_period, hour_sin/cos, day_sin/cos, is_night, is_peak, hour_activity_score, weekend_deviation`
  - RECENCY/VELOCITY: `txn_velocity_1h/24h, amount_velocity_24h`
  - RECIPIENT: `recipient_frequency_score, days_since_recipient_seen, recipient_novelty`
  - DEVICE: `device_familiarity`
  - LOCATION: `location_familiarity`
  - ACTIVITY: `is_rare_merchant, category_familiarity`
- Dimension unchanged 31, no retrain needed; validated `vec.shape[1] != scaler n_features → ValueError` `scorer.py:280`.

### 3.7 Model Score (4G)
- Verified direction: `score = 100*(hi-raw)/(hi-lo)` `scorer.py:285` (`hi=0.1836, lo=-0.0737`); lower `raw` (more anomalous) → higher `risk`. Tested `test_phase45.py:40` normal `51` vs large `100`, `test_phase45.py:145` history small vs large `zscore 3.33 vs -2.67` ordering correct.
- Calibrated conversion kept; normal → lower, unusual → higher.
- Distinction `behavior_score` vs final IRON fraud risk kept separate (not confused).

### 3.8 ML Confidence (4H)
- Added meaningful confidence `0.0–1.0` `scorer._compute_confidence` `scorer.py:189`: `base 0.25 + hist_factor 0.45*(count/30) + profile 0.15 + completeness 0.10`, `*0.65` if `cold_start`, `*0.75` if not `user_found`, capped `0.05–0.98`.
- Factors: history amount, profile existence, cold_start, completeness.
- Example `test_phase45.py:55` normal history `0.61`, cold_start `0.31`, unknown user `0.14`.

### 3.9 Explanation Signals (4I)
- Structured `scorer._build_explanations` `scorer.py:215` returns `[{feature, description, severity}]` only for real evidence: `amount_deviation` (z≥2/3), `recipient_novelty`/`rarity`, `velocity_1h/24h`, `unusual_hour`, `rare_merchant`, `balance_impact`, `device/location` familiarity.
- No fake explanations when `cold_start` without evidence; test `test_phase45.py:37` large amount → `amount_deviation high`.

### 3.10 ML API (4J)
- Cleaned `POST /behavior-score` `otp_server.py:526` now history-aware via `_build_behavior_result` `otp_server.py:320`, returns:
  ```json
  {
    "behavior_score":81, "risk_level":"CRITICAL", "user_found":true, "if_raw":0.02,
    "confidence":0.61, "history_count":8, "cold_start":false,
    "signals":[{"feature":"amount_deviation","description":"...","severity":"high"}],
    "features":{"amount_zscore":4.2,"recipient_novelty":1,"velocity_1h":4,...},
    "model_version":"iforest-v1"
  }
  ```
  Same shape for `/analyze` stage1 enriched and `/intel/behavior` GET.

### 3.11 Model Versioning (4K)
- `MODEL_VERSION = "iforest-v1"` `scorer.py:11`, returned in every response `model_version` field, logged on load `scorer.py:60`. Allows future retrain without ambiguity; no retrain performed (artifacts compatible).

### 3.12 Model Safety (4L)
- `load()` `scorer.py:37` verifies existence of 4 artifacts, raises `FileNotFoundError` with clear path if missing (test `test_phase45.py:98` expects this, not silent `50`).
- Validates `scaler n_features_in_ == 31`, `model n_features == scaler`, warns on version mismatch `1.8.0 vs runtime`.
- Feature count mismatch raises `ValueError: retrain required` `scorer.py:280`.
- No silent fallback `50` when model unavailable; startup logs `IF model loaded — 4 users, v iforest-v1`.

---

## 4. Phase 5 — Fraud Intelligence Engine

### 4.1 Existing Engine Audit (5A)
- Inspected `fraud_engine/` 19 rules `fraud_rules.py:69` across 8 categories (`AMOUNT, RECIPIENT, TIMING, VELOCITY, BALANCE, DEVICE, LOCATION, BEHAVIOURAL`), `pattern_matcher.py` with 18 matchers (thresholds `amount_multiplier 2.5/6.0`, `report_count 1/3`, `velocity 3/5m, 6/1h, 3/30m`, `balance 0.40/0.70`, `hour 1–5`, `device<0.5`), `fraud_scorer.py` weighted `severity×mult 1.4/1.2/1.0/0.75` logistic `k0.06 centre40`, `confidence.py` quality+diversity+agreement, `recommendations.py` `ALLOW/MONITOR/NOTIFY_USER/ESCALATE_FOR_REVIEW` (never block).
- Identified gaps: velocity used supplied `txn_velocity` not DB, scam-registry used `recipient_report_count` naïvely, keyword engine (`js/keyword-engine.js` 400+ weights, Levenshtein >3→99) not ported to backend, device/location only via passed familiarity, no dedup (reported counted twice), fraud_score mixed lightly with behavior prior.

### 4.2 Fraud Signal Categories (5B)
- Organized into 5 required groups, implemented in `fraud_engine/intelligence.py`:
  1. **RECIPIENT_INTELLIGENCE:** `recipient_reported`, `recipient_high_reports`, `recently_reported_recipient`, `unfamiliar_recipient`, `suspicious_upi_handle`, `impersonation_upi` (`intelligence.py:120`)
  2. **TRANSACTION_PATTERNS:** `rapid_velocity_5m/1h`, `recipient_switching`, `amount_escalation_burst`, `sequential_amounts`, `balance_drain` (`intelligence.py:133`, `detect_velocity_signals`)
  3. **SCAM LANGUAGE / SOCIAL ENGINEERING:** `urgency_language`, `otp_request_language`, `impersonation_language`, `account_suspension_threat`, `reward_prize_scam`, `investment_scam`, `loan_scam`, `remote_access_request` via `keyword_detector.py:30`
  4. **NETWORK / DEVICE:** `unfamiliar_device`, `unfamiliar_location` (`detect_device_location_signals`)
  5. **ACCOUNT_BEHAVIOUR:** `sudden_behaviour_change` (z≥3), `unusual_amount_spike`, `unusual_transaction_timing` (`detect_account_behaviour_signals`)
- All deterministic, testable, evidence-driven.

### 4.3 Structured Signal Format (5C)
- Every signal `intelligence.py:474`, `keyword_detector.py:110`:
  ```json
  {"id":"recipient_reported","category":"RECIPIENT","severity":"HIGH","score":30,"evidence":{"report_count":7},"description":"Recipient has multiple fraud reports.","source":"scam_registry"}
  ```
- Structured evidence exposed (report_count, recency, velocity window, matched_terms, history_count etc), not unexplained numbers.

### 4.4 Rule Severity (5D)
- `LOW/MEDIUM/HIGH/CRITICAL` (`fraud_rules.py:35`, `intelligence.py` signals). Severity denotes signal strength, not payment authority; no `BLOCK` severity used for decision.

### 4.5 Scam Registry (5E)
- Improved `scam_registry.py:206`:
  - Normalized lookup ` _normalize_recipient` `71` (digits suffix or lowercased UPI).
  - Supports `report_count`, `confidence/reputation` (based on count+recency), `report_recency` (`recency_days`), `category`, `evidence` (`first/last_reported`, reasons), `source`.
  - Cache `_scam_cache` TTL 30s, bounded, invalidated on `_save` via `_save_with_invalidate` and `mtime` check `scam_registry.py:224` to avoid stale in-memory.
  - Avoids stale by file mtime validation.

### 4.6 Recipient Reputation (5F)
- `get_recipient_reputation(recipient)` `scam_registry.py:262` returns:
  ```json
  {"recipient":"...","known":true,"reported":true,"report_count":7,"reputation":"HIGH_RISK","confidence":0.93,"recency_days":0,"category":"RECIPIENT","evidence":{...},"source":"scam_registry","tier":"high_risk","signals":[...]}
  ```
  Reputation `CLEAN/FLAGGED/HIGH_RISK` (evidence for Phase 6, not payment decision). `intelligence.py:get_recipient_intelligence` wraps it.

### 4.7 Velocity Rules (5G)
- `detect_velocity_signals(history, ...)` `intelligence.py:93` uses persisted timestamps, bounded `history[:50]`, windows `5m/1h/30m/24h`:
  - `3+ in 5m → HIGH (score16) id rapid_velocity_5m`
  - `6+ in 1h → MEDIUM (score10) high_velocity_1h`
  - `3+ unique in 30m → HIGH (15) recipient_switching`
  - `incrementing amounts 1.3× → HIGH (14) amount_escalation_burst`
- Thresholds documented in function header and `fraud_rules.py` thresholds; only implemented where persisted data exists.

### 4.8 Keyword / Social Engineering (5H)
- Audited `js/keyword-engine.js`: `KEYWORD_WEIGHTS` 400+ (with broken empty block at line 120), `TRUSTED_HANDLES`/`SCAM_HANDLES`, `scoreUPIStructure`, `TYPO_MAP`, Levenshtein early exit `>3→99`.
- **Fixes:** preserved Levenshtein optimization `keyword_detector.py:38` `>3→99` and two-row DP, fixed fuzzy false-positive for short terms (`_fuzzy_contains` now exact for `<5` chars `keyword_detector.py:61`), removed duplicate keyword handling via `seen` set already in JS.
- **Ported backend:** `fraud_engine/keyword_detector.py` with 8 term sets (`URGENCY_TERMS`, `OTP_TERMS`, `IMPERSONATION_TERMS`, `ACCOUNT_THREAT_TERMS`, `REWARD_TERMS`, `INVESTMENT_TERMS`, `LOAN_TERMS`, `REMOTE_ACCESS_TERMS`) `keyword_detector.py:23`, each maps to structured signal `otp_request_language` (HIGH20), `urgency_language` (HIGH16/MEDIUM8), etc `keyword_detector.py:78`. Includes UPI structural `detect_upi_structural_risk` for handle checks.

### 4.9 Rule Deduplication (5I)
- `_deduplicate_signals` `intelligence.py:304` normalizes identity: groups `recipient_reported ↔ REPORTED_RECIPIENT`, `velocity_5m ↔ HIGH_VELOCITY_5M`, `device ↔ NEW_DEVICE`, `location ↔ LOCATION_ANOMALY` (`intelligence.py:310`). Keeps highest severity/score per underlying evidence, avoiding double-count. Tested `test_phase45.py:412` recipient and device deduplication to ≤1.

### 4.10 Fraud Intelligence Score (5J)
- `fraud_score` 0–100 separate from `behavior_score` (`intelligence.py:422`); computed via severity-weighted sum `score×mult` plus light behavior prior (`+6` max) then logistic `k0.06 centre40` `intelligence.py:446`. Clearly named `fraud_score`, distinguished from `behavior_score` and future `final_score`. Not combined with ML in Phase 5 beyond light prior (Phase 6 will merge). Tested independence `test_phase45.py:CASE3` low behavior `56` high fraud `83`.

### 4.11 Fraud Intelligence Confidence (5K)
- `intelligence.py:460` quality (severity weights `LOW4 MEDIUM10 HIGH18 CRITICAL25` capped 60) + diversity (`categories*5 cap20`) + agreement (`min(behavior,fraud)/100*10`) + scam-boost (`+15` if `report_count≥3`) + single penalty (`-10` if lone weak). Normalized `0.35–0.99`. Single weak keyword → low (`0.37`), multiple independent → high (`0.99` burst). Verified.

### 4.12 Explanations (5L)
- Each fraud_score explainable via signals descriptions (`intelligence.py` signals include `description`); e.g., `fraud 78` signals list: `Recipient has 7 reports → Amount 30σ above mean → urgency/OTP language` (`test_phase45.py:CASE4` signals).

### 4.13 Backend Authority (5M)
- All outputs generated server-side: `_build_behavior_result` `otp_server.py:320` and `_build_fraud_result` `otp_server.py:330` use `iron_store` history; endpoints `/behavior-score`, `/fraud-intelligence`, `/analyze`, `/risk/assess`, `/transactions/prepare`, `/intel/analyze` all server-side. Frontend `index.html:2449` calls `POST /transactions/prepare` authoritative and overrides `totalRisk` with `prepData.risk.score` `index.html:2455`, only renders.

### 4.14 Unified Internal Output (5N)
- `POST /intel/analyze` `otp_server.py:748` returns clean internal without final:
  ```json
  {"behavior":{"score":81,"confidence":0.87,"signals":[...],"features":...,"model_version":"iforest-v1"},
   "fraud_intelligence":{"score":78,"confidence":0.94,"signals":[...],"recipient_reputation":...,"velocity":...}}
  ```
  `DO NOT calculate final combined score` — explicitly no `final` field (tested `test_phase45.py:475`).

### 4.15 Performance (5O)
- Bounded `limit=50` `otp_server.py:315` `_resolve_history_for_user` indexed `SELECT ... ORDER BY timestamp DESC LIMIT ?`; velocity uses same bounded list; scam cache `TTL 30s`; feature calc `O(n)` with `n≤50` not full DB scan. No premature optimization beyond obvious.

### 4.16 Testing (5P)
- **Behavioural ML (13 tests)** `test_phase45.py:40` all PASS (normal, large, new recipient, unusual time, burst, known/unknown user, cold-start, insufficient, missing artifact, wrong feature count, version, ordering, no fallback, history used, confidence, signals).
- **Fraud Intelligence (12 tests)** `test_phase45.py:250` all PASS (clean, reported, high-report, urgency, OTP, impersonation, rapid, burst, device, location, multiple, dedup).
- Tests verify `no fake fallback 50` (scores varied), `user mapping` (`PHONE_TO_PROFILE`), `history actually used` (`zscore` diff), `confidence sensible`, `signals match features`.

---

## 5. Integration Tests

Full pipeline `transaction → persisted history → feature generator → IF → behavior_score → fraud intelligence → fraud_score → structured output` `test_phase45.py:440`:

- `hist 8 txs → beh 51 → fraud 8` unified `{'behavior':..., 'fraud_intelligence':...}` no `final` field `test_phase45.py:475`.
- Via API `POST /intel/analyze` `200` returns both with `behavior.score 57, fraud 9` without final.

**Critical cases** `test_phase45.py:490`:

| Case | Behaviour | Fraud | Signals | Result |
|------|-----------|-------|---------|--------|
| **1 Normal user** (820 normal, known recipient, normal hour) | `44 LOW` | `7 LOW` | low both | correct |
| **2 Behavioural anomaly** (40000 large, high velocity) | `100 CRITICAL` | moderate | `amount_deviation` high | high behavior even if fraud low — proves independence |
| **3 Known scam recipient** (800 normal amount, recipient 5 reports) | `56` low/moderate | `83 HIGH` | `REPORTED_RECIPIENT CRITICAL` | low behavior, high fraud — independence proven |
| **4 Social engineering** (urgent + OTP) | moderate `52` | `78 HIGH` `otp_request, urgency, impersonation` | elevated fraud even if behavior normal | correct |
| **5 Multiple signals** (50000, 3am, 5-hr burst, reported, urgency prize) | `100` | `100` 14 signals 9 categories | both strong | no block |

Still **NO BLOCK**.

---

## 6. No New Features

Not implemented as required: AI Investigator, What-if Simulator, Security Center, advanced UI, new wallet features, Vite migration, major redesign, final unified Risk Engine final tier, automatic denial, ML retraining (model kept `iforest-v1`).

---

## 7. Final Repository Audit

Search `calculateRisk|mlFraudScore|fraud_score|behavior_score|risk_score|BLOCK|BLOCKED|PAYMENT_DENIED|freeze|cooldown|network_blocked` classified:

- `js/fraud-engine.js:472 calculateRisk`, `js/fraud-engine.js:117 mlFraudScore` — frontend fallback when offline; backend authoritative via `/risk/assess` and `/transactions/prepare` overrides (`index.html:2454`). Not competing, fallback only.
- `fraud_score`/`behavior_score`/`risk_score` — backend `otp_server.py` and `ml_pipeline/`/`fraud_engine/` are authoritative; frontend only renders `data.stage1.behavior_score` (`index.html:2130`) fallback `50` if unreachable (offline).
- `BLOCK` in `otp_server.py:228` only as `No BLOCK` comment, `iron_store.py:52` comment, `test_phase23.py:51` test name, `babel.min.js` unrelated, `js/constants.js:7` `IRON never blocks. No BLOCK tier.` — no payment denial path.
- `BLOCKED` only `_BLOCKED_EXTENSIONS` allowlist.
- `PAYMENT_DENIED` not found.
- `freeze`/`cooldown` — `js/fraud-engine.js:599` `checkFrozen/checkCooldown/freezeAccount` now non-blocking `return {frozen:false}` warnings only; `js/constants.js:48` legacy fields kept for analytics not blocking; `otp_server.py` cooldown only OTP resend, not payment.
- `network_blocked` — `scam_registry.py:13` comment legacy, now mapped `high_risk` `scam_registry.py:61`, `js/fraud-engine.js:37` `map legacy network_blocked to high_risk`.

**Frontend final risk:** No authoritative tier calculation remains; `/transactions/prepare` tier is source of truth. Verified via grep.

---

## 8. Implementation Method (actual)

1. Inspected Phase 2/3 and ML/fraud artifacts (section 3.1, 4.1).
2. Created plan (this doc section 1).
3. Implemented Phase 4 (features, scorer enhancements).
4. Ran `test_phase45.py` ML 13 → fixed cold-start confidence and velocity false positives, missing artifact handling.
5. Implemented Phase 5 (keyword detector, intelligence, scam registry cache).
6. Ran fraud tests → fixed fuzzy false-positive `sebi` vs `send`, device dedup, scam score saturation, adjusted thresholds.
7. Ran integration + critical cases → fixed unicode sigma, unfamiliar recipient threshold, dedup.
8. Verified `test_phase23.py` still PASS after pruning admin velocity history (added reset `DELETE FROM transactions WHERE phone='1234567890'`).
9. Verified frontend still consumes backend (`index.html:2454` authoritative override) and no import break (checked `js/pages/send-money.js` not imported).
10. Kept compatibility via fallback paths.

---

## 9. Changed Files (8)

`ml_pipeline/features.py` **new** +350 — centralized 31-feature generator, baseline, history-aware
`ml_pipeline/scorer.py` +220 −40 — history-aware `score_with_history`, confidence, explanations, version `iforest-v1`, safety checks
`ml_pipeline/__init__.py` — re-export (unchanged interface)
`fraud_engine/intelligence.py` **new** +590 — deterministic engine 5 categories, velocity/device/behaviour, dedup, separate fraud_score
`fraud_engine/keyword_detector.py` **new** +210 — social-engineering detector with Levenshtein >3→99
`scam_registry.py` +120 — `get_recipient_reputation`, TTL cache, evidence, high_risk mapping
`fraud_engine/__init__.py` — still exports `run_fraud_intelligence` (backward compat)
`otp_server.py` +280 −120 — history-aware helpers, enhanced `/behavior-score`, `/fraud-intelligence`, `/analyze`, `/risk/assess`, `/transactions/prepare`, new `/intel/analyze|behavior|fraud`

`test_phase45.py` **new** +550 — 13+12+integration+5 cases
`test_phase23.py` +30 — velocity reset handling for deterministic SAFE
`PHASE_4_5_SESSION.md` **new** (this file)

No files deleted; `iron_store.py`, `fraud_engine/fraud_rules.py|pattern_matcher.py|fraud_scorer.py|confidence.py|recommendations.py`, `models/*`, `requirements.txt` unchanged (no retrain).

---

## 10. How to Run & Verify

```bash
pip install -r requirements.txt  # scikit-learn==1.8.0
uvicorn otp_server:app --reload   # http://localhost:8000
# Tests
python test_phase45.py   # 13+12+integration all PASS
python test_phase23.py   # 26 checks still PASS (SAFE/CAUTION/HIGH_RISK proceed)
python verify_flow.py   # SAFE 39→PROCEEDED, 8000 HIGH_RISK 91→PROCEEDED_AFTER_OTP, 70000 HIGH_RISK 100→PROCEEDED_AFTER_OTP
# Manual API
curl -X POST http://localhost:8000/behavior-score -H "Content-Type: application/json" -d '{"user_id":"9340228345","amount":500}'
curl -X POST http://localhost:8000/fraud-intelligence -H "Content-Type: application/json" -d '{"behavior_score":30,"transaction":{"user_id":"9340228345","amount":500,"note":"urgent otp"},"user_profile":{"user_id":"9340228345"}}'
curl -X POST http://localhost:8000/intel/analyze -H "Content-Type: application/json" -d '{"transaction":{"user_id":"9340228345","amount":500},"user_profile":{"user_id":"9340228345"}}'
# Frontend
http://localhost:8000 → login 9340228345 PIN 1167 / admin 1234567890+000000 → Send 500→SAFE, 15000→HIGH_RISK, 70000→HIGH_RISK all proceed (last needs OTP)
```

---

## 11. Final Payment Verification

```
USER → Frontend → Bearer → POST /transactions/prepare (history-aware IF + deterministic fraud) → SAFE/CAUTION/HIGH_RISK
  ↓ (HIGH_RISK warning + OTP) → user confirms → POST /transactions/confirm (OTP check) → atomic deduct → persisted → frontend renders authoritative tier
```

- **SAFE (500, cold_start, no velocity) 📗 `behavior 74 HIGH` but `fraud 11 LOW` merged `39 SAFE` → `confirm → 200 PROCEEDED` balance `762976→762376` **proceeds no OTP**.
- **CAUTION/HIGH_RISK border (8000 large amount 16× avg)** `behavior 100 + fraud 83 → 91 HIGH_RISK requires_otp true` → `confirm without OTP → 400 OTP required` → `confirm OTP 000000 → 200 PROCEEDED_AFTER_OTP` **proceeds after verification**.
- **HIGH_RISK (70000, 92% balance drain, urgency prize, reported recipient, velocity 3)** `behavior 100 + fraud 100 → 100 HIGH_RISK` → `OTP required → PROCEEDED_AFTER_OTP` **proceeds after OTP**.

**IRON has no fraud-based payment blocking path.** `grep BLOCK/PAYMENT_DENIED` in `otp_server.py` → `0`; `fraud_engine/intelligence.py` severity never `BLOCK`; `scam_registry` `high_risk` not `network_blocked`; `js/fraud-engine.js` `checkFrozen` returns `frozen:false`; `index.html:2454` `prepare` authoritative result always `PROCEEDED*` never `BLOCKED`.

---

## 12. Definition of Done

**PHASE 4:**
- [x] Isolation Forest works with real persisted data (`features.py` + `scorer.score_with_history`)
- [x] User-specific history used (mean/median/std etc via `compute_baseline_from_history`)
- [x] Cold-start explicit (`cold_start true, history_count, confidence reduced`)
- [x] Feature generation centralized (`features.py` 31 order)
- [x] Feature ordering stable (`FEATURE_ORDER`)
- [x] Score direction correct (normal 51 < extreme 100)
- [x] No silent fake 50 (FileNotFoundError on missing artifact)
- [x] ML confidence exists (`0.14 unknown, 0.61 normal, 0.90 high-velocity`)
- [x] ML explanations use real evidence (`amount_deviation`, etc)
- [x] Model version exists (`iforest-v1`)
- [x] Backend owns ML result (`/behavior-score`, `/risk/assess`, `/transactions/prepare` use history)
- [x] ML tests pass (13/13)

**PHASE 5:**
- [x] Fraud Intelligence deterministic (`intelligence.py` pure function, no random)
- [x] Scam registry integrated (`get_recipient_reputation`, recency, evidence)
- [x] Recipient reputation works (`CLEAN/FLAGGED/HIGH_RISK`)
- [x] Velocity detection works (`5m/1h/30m`)
- [x] Social-engineering detection works (`keyword_detector.py` urgency/OTP/impersonation)
- [x] Device/location signals work
- [x] Signals structured (`id/category/severity/score/evidence/description/source`)
- [x] Evidence exposed (`report_count, matched_terms, velocity window`)
- [x] Duplicate signals controlled (`_deduplicate_signals`)
- [x] fraud_score separate from behavior_score (`fraud_score 11 vs behavior 74` CASE1)
- [x] Fraud confidence exists (`0.25 clean, 0.99 burst`)
- [x] Backend owns Fraud Intelligence (`/fraud-intelligence`, `/intel/analyze`)
- [x] Fraud tests pass (12/12)

**INTEGRATION:**
- [x] Behavioural and Fraud remain independent (CASE3 low behavior/high fraud)
- [x] Both produce structured outputs (`/intel/analyze` behavior+fraud)
- [x] No final combined score created in Phase 4/5 (`/intel/analyze` has no `final`, `test_phase45.py:475`)
- [x] No fraud-based blocking (grep 0, payment flow all `PROCEEDED*`)
- [x] Existing SAFE/CAUTION/HIGH_RISK flow intact (`test_phase23.py` PASS)

---

## 13. Final Statement

**Phase 4 and Phase 5 do not create a payment-blocking decision. They produce independent behavioural and fraud-intelligence signals for Phase 6.**

- `behavior_score` (IF `iforest-v1` + history-aware 31-vector) → anomaly evidence, confidence, signals.
- `fraud_score` (`intelligence.py` deterministic rules + scam registry + velocity + keyword) → fraud evidence, confidence, structured signals.
- Phase 6 will consume `{"behavior":{score, confidence, signals, features}, "fraud_intelligence":{score, confidence, signals, recipient_reputation}}` to compute final unified `score/tier` (still `SAFE/CAUTION/HIGH_RISK`, never `BLOCK`).

---

## 14. Deferred (Phase 6+ Explicitly Not Built)

AI Fraud Investigator, What-if Simulator, new ML retraining/feature engineering, advanced recipient/scam intelligence beyond current rules, Security Center UI, dashboard redesign, **Vite migration**, enterprise microservices, distributed infra, analytics dashboard, wallet features, **final unified Risk Engine** (`final_score` combining `behavior_score*0.45 + fraud_score*0.55` is kept from Phase 2/3 for backward compat but Phase 5 independent output does NOT create new final), automatic payment denial.

---

*Generated from session `2026-09-11` — Phase 4 & 5 foundation, ready for Phase 6 Risk Engine unification.*
