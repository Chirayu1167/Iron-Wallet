# IRON Wallet — Phase 2 & 3 Session Report
**Date:** 2026-09-11
**Branch:** `main` | **Working Directory:** `D:\Iron_Wallet`
**Scope:** Phase 2 Security & Backend Foundation + Phase 3 Real Data & Persistence
**Status:** ✅ Complete and Verified (Phase 1 preserved, Phases 2–3 implemented, no Phase 4)

> This file documents the implementation session that turned the backend into the security and transaction authority, replaced demo `localStorage` state with real SQLite persistence, and kept the product rule **IRON NEVER BLOCKS A PAYMENT**.

---

## 1. Session Overview

**Goals:**
- Turn backend into source of truth for identity, balance, transactions, risk, verification.
- Replace frontend-authoritative `localStorage` / `USERS` balance mutation with authenticated, atomic, persistent APIs.
- Keep `1234567890 + 000000` demo admin, keep demo usable, keep Phase 1 fixes.

**Approach:**
1. Audited actual code (`otp_server.py`, `index.html`, `js/*`, `fraud_engine/*`, `ml_pipeline/*`, `scam_registry.py`, `data/*`, deployment, WebSocket, `localStorage`).
2. Built `iron_store.py` SQLite abstraction (Phase 3A).
3. Added token auth, protected APIs, `POST /transactions/prepare|confirm`, authoritative risk, persistence, then patched frontend to consume backend.

**Result:** `26/26` automated verification checks PASS, `SAFE`/`CAUTION`/`HIGH_RISK` all proceed, no `BLOCK` tier, `user_found true`.

---

## 2. Iron Product Rules — Absolute

1. **Never blocks:** Only `SAFE` `CAUTION` `HIGH_RISK`. `HIGH_RISK` = warning + investigation/OTP + user can still proceed. No `BLOCK`/`BLOCKED`/`PAYMENT_DENIED`/`FROZEN_PAYMENT`/`NETWORK_BLOCKED`.
2. **Admin demo:** `1234567890` + `000000` intentionally scoped, frontend + backend consistent, tokens issued.
3. **ML roles:** ML = behavioural anomalies (`ml_pipeline/scorer.py` IF), Fraud Intelligence = fraud signals (`fraud_engine`), Risk Engine = combines, AI = explains (never invents scores).
4. **Backend authority:** Backend is source of truth for identity, balance, transactions, risk, verification, status, risk events. Frontend is UI client.

---

## 3. Phase 2 — Security & Backend Foundation

### 3.1 Architecture Audit (2A)
Inspected `otp_server.py` (14 endpoints), `index.html` 7.5k lines, `js/constants.js` 15 users, `iron_balance`/`iron_txs`/`iron_recentTx` `localStorage`, `completePayment` local `b-amt` + `USERS` mutation, `risk/assess` only additive, `scam-db` unauthenticated, WebSocket `io("determined-vibrancy.up.railway.app")` phone-only `user_register`, `frozen_until`/`cooldown_until` still present but Phase 1 made non-blocking, `BLOCK` strings in keywords/RBI text, static `GET /{path}` allowlist already from Phase 1.

### 3.2 Authentication (2B)
* **Mechanism:** `iron_store.py:408 create_session` `secrets.token_urlsafe(32)` 24h TTL in `sessions` table (`token, phone, user_id, created_at, expires_at`). `POST /verify-otp` returns `{status, token, user_id}` for admin `1234567890:000000` `otp_server.py:330` and normal OTP success `369` (creates session + `OTP_SUCCESS` event). Frontend `LoginPage` stores `iron_token`/`iron_user` via `getAuthHeader():6978` (`Authorization: Bearer <token>`). `POST /auth/logout:651` deletes session.
* **Doc:** Minimal, compatible with existing OTP flow, no OAuth, demo preserved.

### 3.3 Authorization (2C)
* **PUBLIC:** `/send-otp`, `/verify-otp`, `/health`, `/`, static allowlist.
* **AUTHENTICATED (`Depends(get_current_user):229`):** `/risk/assess`, `/transactions/prepare`, `/transactions/confirm`, `/balance`, `/transactions`, `/auth/me`, `/device/baseline`, `/scam-db/report` (now requires `Bearer` and overrides `reporter` with `current["phone"]` `926`). `GET /scam-db/check|flagged|stats` remain public reputation.
* **Enforcement:** `get_current_user:229` checks `Bearer`, `iron_store.get_session` (UTC `calendar.timegm` `438`), `403` wrong user tx `830`, `401` missing, `404` invalid. Tested `GET /balance 401` unauth, `403` wrong user.

### 3.4 Transaction Prepare (2D)
`POST /transactions/prepare:674` — auth `10/min` per user:
1. validate `recipient` (UPI regex or 10-digit) `240`, `amount gt0 le1M`, `note max200`
2. `iron_store.get_balance` authoritative, `400 Insufficient` if `>bal`
3. `recipient_name` via `iron_store.get_user`/`list_users` UPI scan
4. Build `txn_for_risk` (hour, dow, velocity from `get_transactions_for_user`, `rec_freq`, `recipient_report_count` via `scam_registry`, urgency keywords `urgent/immediately…`)
5. `IFScorer.score` + `run_fraud_intelligence` → `base_score=_merge_scores 0.45/0.55` → `tier=_iron_tier 0-69 SAFE 70-84 CAUTION 85-100 HIGH_RISK`
6. `create_transaction` `PENDING` `expires_at+600s` (`iron_store.py:197`), `create_risk_event PREPARED`, `create_verification_event OTP_REQUIRED` if needed
*Response* `{transaction_id, risk:{score,tier,confidence,signals,requires_otp,explanation,stage1,stage2}, verification_required, expires_at, balance, recipient_name}` — no `BLOCK`.

### 3.5 Transaction Confirm (2E) + Idempotency (2F)
`POST /transactions/confirm:819` — auth `10/min`:
* Check `tx.phone==current`, `outcome PROCEEDED*` or `SUCCESS/HIGH_RISK` → idempotent `200 duplicate:true` `833`
* Expiry `calendar.timegm` `850` → `FAILED` if past
* OTP if `HIGH_RISK`/`OTP` → verify `otp_store` (admin `000000` bypass `865`) → `OTP_SUCCESS` else `400 Invalid OTP` (still retryable)
* `iron_store.confirm_transaction_atomic:250` `BEGIN IMMEDIATE` → balance check → `UPDATE users balance` → `UPDATE transactions status/outcome` → commit → `create_risk_event PROCEEDED_AFTER_OTP|PROCEEDED`. Duplicate second call returns first result, no double deduct (tested `878699 == 878699`).

### 3.6 Balance Authority (2G)
* Frontend `App.handleLogin:7105` now `GET /balance` + `GET /transactions?limit=50` with token, overwrites `localStorage` cache. `completePayment:2598` `async` no longer `b-amt` or `USERS` mutation, calls `POST /transactions/confirm` with `preparedId`+`otp`, updates `setBalance(data.balance)` from `data.balance`. `iron_store.confirm_transaction_atomic` is single SQLite transaction. Negative balance prevented `292`.

### 3.7 Risk Events (2H)
* `risk_events` table `iron_store.py:329` `event_id, transaction_id, user_id, phone, timestamp ISO8601, risk_score, tier, confidence, signals_json, verification_required/result, outcome`. Outcomes `PREPARED|PROCEEDED|PROCEEDED_AFTER_OTP|FAILED_VALIDATION|INSUFFICIENT_BALANCE|DUPLICATE_CONFIRMATION` — no `BLOCKED`. Created in `prepare` and `confirm`.

### 3.8 OTP Security (2I)
* `print OTP` removed `318`, normal `send-otp` `secrets.randbelow` `313`, `store {otp,expiry120,attempts0}`, `30s` cooldown `295`, `5/5m` `274`, `OTP_EXPIRED` `343`, admin `1234567890+000000` server-side `330,304` consistent, bound to `phone` key, consumed on success `347`.

### 3.9 Scam Registry (2J)
* `scam_registry.py:61` `high_risk` for `>=3`/`>=5` (no `network_blocked`), auth `926` (`Depends(get_current_user)`), per-IP+per-user `5/min`, `reporter` overridden, `recipient` normalized `71`, `422` empty, `report` returns `flagged`.

### 3.10 WebSocket (2K)
* Frontend `App` `6978` now `emit("user_register", {number, token: localStorage.iron_token})` `7105,7135` for both initial and reconnect. Backend `iron_store.get_session(token)` ready to validate; external `determined-vibrancy` service still phone-only but token is now sent and can be enforced when migrated.

### 3.11 CORS/Static/Input/Rate-limit (2L–2O)
* CORS `87` `_cors_raw = CORS_ORIGINS env or *` `allow_credentials False`, `.env.example:9` explicit. Static allowlist `684` `js/`, `index/styles.css/favicon` only, `..`/`/.`/`\.py/.env/.joblib` → `index.html` (verified `/otp_server.py` `/.env` → index, `/js/app.js` → file). Input `TransactionPrepareIn` `gt0 le1M`, `recipient` UPI/phone regex, `note max200`, `OTP 6 digits`, `ReportRecipientIn` `min3 max50`, no stack traces. Rate limits `otp_store` `30s/5/5m`, `report 5/min`, `assistant 10/min`, `risk 20/min`, `prepare 10/min`, `confirm 10/min`.

---

## 4. Phase 3 — Real Data & Persistence

### 4.1 Storage Layer (3A)
* `iron_store.py:1` SQLite `data/iron.db` (outside static, `WAL` `foreign_keys`), `_conn()` helper, no scattered SQL. Functions `get_user`, `get_balance`, `create_transaction`, `get_transaction`, `update_transaction_confirmed`, `create_risk_event`, `get_recent_transactions`, `create_verification_event`, `save_baseline`, `create_session`, etc.

### 4.2 Users (3B)
* `users` `phone PK, user_id, name, balance, age, verified, upi, contacts_json, risk_score, created_at`. Seed `seed_users_if_needed:461` 15 users idempotent, balances from `js/constants.js`, `upis` preserved.

### 4.3 Transactions (3C)
* `transactions` `transaction_id PK UUID, user_id, phone, recipient, recipient_name, amount, timestamp ISO8601, status PENDING|SUCCESS|HIGH_RISK|VERIFIED|FAILED, risk_score, risk_tier SAFE|CAUTION|HIGH_RISK, verification_method/status, outcome, note, expires_at, confirmed_at`. Migrated `blocked`→`high_risk` `js/constants.js:389`.

### 4.4 Risk Events (3D)
* Separate `risk_events` enables fraud pattern analysis, recipient risk, temporal patterns without duplicating tx.

### 4.5 Verification Events (3E)
* `verification_events` `OTP_REQUESTED|OTP_SUCCESS|OTP_FAILED|OTP_EXPIRED|OTP_REQUIRED`, never plaintext OTP, `transaction_id` nullable for login OTP.

### 4.6 Recent Recipients (3F)
* Derived from `get_transactions_for_user:224` limit 20, `rec_freq` `seen` check `733`, `days_since 0/999`, no separate service.

### 4.7 Behavioural Data (3G)
* `transaction.amount, timestamp, recipient, device/location refs, velocity, baseline` persisted via `transactions` + `baselines`; `IF` receives real `recent` history in `prepare:716` for velocity, not new features, no retrain (pinned `scikit-learn==1.8.0` `requirements.txt:4`).

### 4.8 Device/Location Baseline (3H)
* `baselines` `phone PK, last_device_json, last_location_json, last_seen`. `App.handleLogin:7105` `captureBaseline` → `POST /device/baseline:662` `save_baseline`. Anomalies remain CAUTION signal, not block.

### 4.9 Frontend Authority Removal (3I)
* `App`: `txs/balance` `useState` init from `localStorage` cache but overwritten by `GET /balance` + `GET /transactions` after login; `addTx/updateBalance` now from `confirm` response, not `USERS` mutation (fallback legacy kept for offline). `recentTxTimestamps` persisted `iron_recentTx` `2166`. `localStorage` remains for UI prefs/cache only, not source of truth.

### 4.10 Seeding/Migration (3J–K)
* Idempotent `seed_users_if_needed` `if not get_user → create`, `seed_transactions_if_needed` demo `SUCCESS` if `0` rows. No duplicate on restart. Existing `SEED_TXS` kept as offline fallback, not migrated (documented).

### 4.11 Consistency (3L)
* `confirm_transaction_atomic:250` `BEGIN IMMEDIATE` `balance deduct + transaction status` atomic; failure rolls back, no `SUCCESS` without deduct or vice versa.

### 4.12 API Consistency (3M)
* Risk `{score 0-100, tier SAFE|CAUTION|HIGH_RISK, confidence 0-1, signals [], requires_otp, explanation}`, Transaction `{transaction_id, status, risk_score/tier, balance, recipient, amount}`, no divergent `BLOCK` meanings. `ironTier:218` single source.

### 4.13 Security of Persisted Data (3N)
* `data/iron.db` under `data/` not in static allowlist `684`, not committed, `json` blocked, no secrets logged, no internal paths in responses.

### 4.14 Tests (3O + 2O)
* `test_phase23.py` 26 checks: auth `401` unauth vs `200` auth, wrong user `403`, tiers `SAFE/CAUTION/HIGH_RISK` no `BLOCK`, prepare `200`, confirm `200` `PROCEEDED`, duplicate `duplicate:true` same balance, insufficient `400`, invalid `404`, expired, wrong OTP `400`, OTP success `200`, balance `999999→929499`, persistence `68kb` `risk_events`/`verification_events` present, scam `200` auth `401` no auth `422` malformed `429` rate limit, static `index` for `/.env` `file` for `/js/app.js`.

---

## 5. Final Payment Verification

```
USER → Frontend → Bearer token → POST /transactions/prepare → RISK ENGINE → SAFE/CAUTION/HIGH_RISK
  ↓ warning/OTP → user reviews → POST /transactions/confirm → atomic balance → persisted → frontend authoritative result
```

* **SAFE (500, 0-69):** `risk/assess 500→16 SAFE` → `prepare 500→SAFE` → `confirm {txid} → 200 SUCCESS PROCEEDED` balance `999999→999499` **proceeds, no OTP**.
* **CAUTION (70-84):** `prepare 8000→CAUTION 72` → `confirm → 200 SUCCESS PROCEEDED` **proceeds after warning**.
* **HIGH_RISK (85-100):** `prepare 70000→96 HIGH_RISK requires_otp true` → `confirm without otp → 400 OTP required` → `confirm {txid, otp:000000} → 200 HIGH_RISK PROCEEDED_AFTER_OTP` balance `929499` **proceeds after OTP**.

**IRON has no fraud-based payment blocking path.** `grep BLOCK/PAYMENT_DENIED` in `otp_server.py` → `0` fraud denial; `scam_registry` `high_risk` not `network_blocked`; `js/fraud-engine.js` `checkFrozen/checkCooldown/recordBlock/freezeAccount/emergencyLock` all return `frozen:false`/`false` non-blocking; `completePayment` `index.html:2598` always calls `/confirm` and handles `PROCEEDED*` never `BLOCKED`; remaining `blocked` strings are historical `SEED` alias or `electricity` keyword/RBI text, not denial.

---

## 6. Changed Files (14)

`otp_server.py` +403 −314 — auth, `/risk/assess`, `/transactions/prepare|confirm`, `/auth/me`, `/balance`, `/transactions`, `/device/baseline`, `/auth/logout`, rate limits, static allowlist, OTP log removal, `calendar.timegm` fix, CORS
`iron_store.py` **new** +511 — SQLite `users/transactions/risk_events/verification_events/baselines/sessions`, atomic `confirm_transaction_atomic`, seeding
`ml_pipeline/scorer.py:44` +40 — `PHONE_TO_PROFILE` `U001..U004` mapping, `_resolve_profile_id`, `user_found true` for phones
`scam_registry.py:61` — `high_risk` for 5+ (no `network_blocked`)
`js/constants.js:3` — centralized `0-69/70-84/85-100` `ironTier`/`riskMetaIron`, `blocked→high_risk` SEED
`js/fraud-engine.js:34,597` — `network_blocked→high_risk`, `RISK WARNING SYSTEM` non-blocking, ISO `getRecentTransactions`/`getDailySpent`/`nowStamp:iso`, `recentTx` persistence is in `index.html` not here
`js/keyword-engine.js:282` −6 low duplicate keys (`claim 8` etc), `levenshtein` early exit `>3→99`
`js/pages/requests.js:16` +16 — VPN non-blocking
`index.html` +536 −314 — `getAuthHeader`, `LoginPage` token store, `handleLogin` authoritative fetch + `captureBaseline`, `handleLogout` clear, WS `token`, `completePayment` authoritative `async` + `OTP` capture, `analyzeRisk` `async` + `/transactions/prepare` + `ironTier` mapping, `totalRisk` authoritative `live.final_score`, `iron_txs/balance/recentTx` persistence, `checkRecipientNetworkRisk` debounce, ISO fixes, `quickReply blocked→flagged`
`requirements.txt:4` `scikit-learn==1.8.0`
`.env.example:9` `GEMINI_API_KEY` `CORS_ORIGINS`
`README.md:54` proxy docs
`js/components/assistant.js:43` `Bearer` for `scam-db/report` (via `fraud-engine.js` actually)
`data/scam_registry.json` −2 `}}` fix (Phase 1)

---

## 7. Deferred (Phase 4+ Explicitly Not Built)

AI Fraud Investigator, What-if Simulator, new ML features/retraining, advanced recipient/scam intelligence, Security Center UI, dashboard redesign, **Vite migration**, enterprise microservices, distributed infra, analytics dashboard, wallet features. Duplicates in `js/pages/send-money.js`/`modals.js` kept (not imported) to avoid break; WebSocket full JWT enforcement pending migration from external `determined-vibrancy` to backend WS.

---

## 8. How to Run & Verify

```bash
pip install -r requirements.txt  # scikit-learn==1.8.0
uvicorn otp_server:app --reload   # http://localhost:8000
# Test
python test_phase23.py  # 26 checks
python verify_phase1.py # static, admin, ML, risk tiers
```
*Frontend* `http://localhost:8000` → login `9340228345` (PIN from `js/constants.js`) + OTP (or `1234567890`+`000000` admin) → balance from `/balance`, txs from `/transactions`, Send `500→SAFE` `15000→CAUTION` `70000→HIGH_RISK` all proceed (last needs OTP `000000`).

---

## 9. Notes

* No files deleted unless imports verified; `index.html` not rewritten unnecessarily; `iron_store.py` is new but minimal.
* Phase 1 fixes preserved and extended (allowlist, `high_risk` not `blocked`, `ironTier`, `captureBaseline`, `iron_recentTx`, keyword ISO).
* If destructive change needed (DB at `data/iron.db`), delete `data/iron.db` to re-seed idempotently.

---
*Generated from session `2026-09-11` — Phase 2 & 3 foundation, ready for Phase 4 AI/Simulator.*
