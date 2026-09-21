# IronWallet — Secure Payments with Real-Time Fraud Intelligence

> A full-stack wallet demo that *never* blocks a payment — it warns, explains, and verifies. Backend is the single source of truth for identity, balance, risk, and transactions.

[![App](https://img.shields.io/badge/IronWallet_API-4.0.0-009688)](otp_server.py)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB)](requirements.txt)
[![Risk Engine](https://img.shields.io/badge/Risk_Engine-v1-C5A059)](risk_engine/engine.py)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## Table of Contents

- [Why IronWallet](#why-ironwallet)
- [Core Principle](#core-principle)
- [Features](#features)
- [Architecture](#architecture)
- [Fraud Pipeline](#fraud-pipeline)
- [Risk Tiers](#risk-tiers)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Demo Accounts](#demo-accounts)
- [API Reference](#api-reference)
- [Frontend](#frontend)
- [Security Model](#security-model)
- [Testing](#testing)
- [Benchmarks](#benchmarks)
- [Deployment](#deployment)
- [License](#license)

---

## Why IronWallet

Most wallets either block blindly or warn with a vague score. IronWallet combines:

1. **Behavioural anomaly detection** (Isolation Forest) — personalized to *your* history.
2. **Deterministic fraud intelligence** — 20 rule patterns across 8 categories, plus 5-category deterministic engine, keyword / social-engineering, device / location, velocity checks.
3. **Recipient reputation** — personal familiarity (`NEW / FAMILIAR / FREQUENT`) + network-wide report count (`scam_registry.py`).
4. **Unified RiskEngine** — evidence-aware, deduplicated, explainable. One authoritative score on backend and frontend.

Result: `0–100` risk, `SAFE / CAUTION / HIGH_RISK`, human-readable why, and a safe path to proceed (`OTP → PROCEEDED_AFTER_OTP`). A separate binary label (`LEGITIMATE / FRAUDULENT`) is available for fraud classification independent of tier.

## Core Principle

```
IRON NEVER BLOCKS A PAYMENT.

HIGH_RISK = OTP challenge → user can still proceed → PROCEEDED_AFTER_OTP
No BLOCK / FROZEN / NETWORK_BLOCKED payment state exists.
No `payment_blocked` live event is ever emitted.
```

## Features

**Auth & Persistence (Phases 2–3)**
- OTP via Twilio (`POST /send-otp` / `POST /verify-otp`), `secrets.randbelow` 6-digit, 120s expiry, 30s cooldown, 5 sends / 5 min, 5 verify attempts.
- Bearer token auth (`secrets.token_urlsafe(32)`, 24h `sessions` table), `GET /auth/me`, `POST /auth/logout`, per-user session list / revoke.
- SQLite (`data/iron.db`) via `iron_store.py` — `users, transactions, risk_events, verification_events, baselines, sessions, transaction_reports, security_events`. WAL + FK, atomic `confirm_transaction_atomic`.

**Behaviour ML (Phase 4)**
- Isolation Forest 31-vector (`ml_pipeline/features.py` canonical), history-aware `score_with_history`, cold-start handling (`<5 txns`), confidence `~0.25–0.90`, model `iforest-v1` (`models/isolation_forest.joblib` + scaler / bounds / profiles).

**Fraud Intelligence (Phase 5)**
- Deterministic engine `fraud_engine/intelligence.py` — 5 categories (recipient, transaction patterns, scam language, network/device, account behaviour) + legacy 20-rule / 8-category matcher (`fraud_rules.py`), keyword / social-engineering detector (`fraud_engine/keyword_detector.py` — urgency, OTP-request, impersonation, account-threat, reward, investment, loan, remote-access + suspicious UPI handles), device / location, velocity bursts (3+/5m, 6+/1h, switching).

**Risk Engine (Phases 6–8)**
- Unified `risk_engine/engine.py` weights `behavior 0.35 / fraud 0.40 / recipient 0.15 / context 0.10` (`risk_engine/thresholds.py`), evidence-aware weighting, signal deduplication, boost / dampen caps, `iron_tier` / `risk_level`, `build_explanation` — summary, top-5 reasons, tier message, confidence explanation.
- Recipient intelligence `risk_engine/recipient.py` — familiarity, report count, recency, amount anomaly. Binary classifier `risk_engine/binary.py` — `classify_binary` / `is_fraudulent` → `LEGITIMATE` vs `FRAUDULENT`.

**AI Investigator (Phase 9)**
- Grounded investigator `ai_investigator/` (`investigator.py`, `prompts.py`, `models.py`, `ai-investigator-v1`) — Gemini `gemini-2.5-flash` with strict JSON grounding + templated fallback, never invents scores. `POST /risk/investigate`. Assistant proxy `POST /assistant` (server-side Gemini key, never in browser).

**Simulator & Live Protection (Phases 10–11)**
- Isolated simulation reusing RiskEngine (`POST /risk/simulate`, no DB mutation, current-vs-simulated diff), live WebSocket events (`/ws?token=`, `_ws_connections`, `_ALLOWED_LIVE_EVENTS`, never emits `payment_blocked`).

**Product UX (Phases 12–14)**
- Protection Center (`js/protection-center.js`), Security Center (`js/security-center.js` — overview, timeline, sessions), Scam Database (report / check / flagged / stats), transaction reporting with dedup, security events timeline, risk visualization (`js/risk-components.js`).

## Architecture

```
index.html (React SPA, Babel in-browser, no build)  ─┐
js/* (constants, fraud-engine, geo-device, etc.)      │
js/pages/*, js/components/*                           │
                          │  fetch / WebSocket (relative API="")
                          ▼
otp_server.py (FastAPI — v4.0.0 app, sole backend authority) ── iron_store.py (SQLite)
  ├─ ml_pipeline/IFScorer  ── models/isolation_forest.joblib + scaler/bounds/profiles
  ├─ fraud_engine/intelligence + keyword_detector + fraud_rules
  ├─ risk_engine/engine + thresholds + explanation + recipient + binary
  ├─ scam_registry.py (JSON, network reputation, 24h reporter dedup)
  └─ ai_investigator/ (grounded, Gemini + fallback)
```

Static serving: allowlist `js/`, `styles.css`, `*.min.js`, images, `index.html`; blocks `.py/.env/.joblib/.db/.json/.pkl/.sh/.pem/.key` + dotfiles (`_BLOCKED_EXTENSIONS`) with SPA fallback to `index.html`. `data/iron.db` is never served.

## Fraud Pipeline

Single authoritative path `POST /risk/assess` and `POST /transactions/prepare` → `_compute_unified_risk`:

1. **Behavior** — `_build_behavior_result` → `IFScorer.score_with_history(txn, history)` → `behavior_score` + `confidence` + `signals` + `cold_start`.
2. **Fraud** — `_build_fraud_result` → `run_fraud_intelligence_deterministic(transaction, history, user_profile, behavior_score)` → `fraud_score` + `signals` (5 deterministic categories + legacy patterns + keywords + velocity + device/location).
3. **Recipient** — `_build_recipient_profile` → `get_recipient_intelligence_api(phone, recipient, amount)` → `risk_score` + `familiarity` + `reputation` + amount anomaly.
4. **Context** — `_build_context` → device / location / velocity signals (unfamiliar device/location, `high_velocity_5m/1h`).
5. **RiskEngine** — `_risk_engine.assess(behavior, fraud_intelligence, recipient, context, transaction)` → `score 0–100` + `tier` + `confidence` + deduplicated `signals` + `components` + `explanation` + binary `fraud_label / is_fraudulent`.

Frontend `SendMoneyPage` calls `POST /transactions/prepare` and **overrides** local `totalRisk/tier` with `prepData.risk` when backend is reachable.

## Risk Tiers

| Score | Tier | Frontend UX | Backend `verification_required` |
|------:|------|-------------|---------------------------------|
| `0–69` | `SAFE` | silent → PIN directly | `NONE` → `PROCEEDED` |
| `70–84` | `CAUTION` | soft popup / banner | `NONE` (warning) → `PROCEEDED` |
| `85–100` | `HIGH_RISK` | full `FraudRiskCard` + OTP | `OTP` — `OTP_SUCCESS` → `PROCEEDED_AFTER_OTP` |

Backend thresholds `risk_engine/thresholds.py:9` `RISK_TIRESHOLDS` (`SAFE (0,69) CAUTION (70,84) HIGH_RISK (85,100)`). Weights `RISK_WEIGHTS` (`behavior 0.35, fraud 0.40, recipient 0.15, context 0.10`, sum 1.0).

Frontend display layers `js/constants.js:10` — `RISK_SILENT 39 / RISK_POPUP 40 / RISK_SCREEN 75 / RISK_OTP 85 / RISK_COOLING 90` (30s cooling at `90+`). These are UI layers only; the authoritative tier is always the backend tier.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend | FastAPI (`>=0.110.0`, app version `4.0.0`), Uvicorn `[standard]`, Pydantic v2, SQLite + WAL |
| ML | scikit-learn `==1.8.0` Isolation Forest (31 features), NumPy `>=2.0.0`, joblib |
| Auth | `secrets` OTP + Bearer token, 24h `sessions` |
| OTP | Twilio `>=9.0.0` (optional, graceful console fallback) |
| Frontend | React + ReactDOM (vendored) + Babel `7.26.4` in-browser, single `index.html` SPA, no bundler |
| Realtime | WebSocket `/ws?token=` (`_ws_connections`, `_publish_live_event`, `_ALLOWED_LIVE_EVENTS`) + socket.io fallback |
| AI | `httpx` + Gemini `gemini-2.5-flash` server-side only (`POST /assistant`, `POST /risk/investigate`) |
| Deploy | Railway / Heroku (`Procfile`, `nixpacks_backend.toml` — `python312`) |

## Project Structure

```
otp_server.py              — FastAPI app (Phases 2–14 + binary, sole backend authority)
iron_store.py              — SQLite persistence (8 tables, atomic confirm, seeding)
scam_registry.py           — network-wide recipient risk (data/scam_registry.json, 24h dedup)
ml_pipeline/
  scorer.py                — IFScorer, history-aware, cold_start
  features.py              — canonical 31-feature vector
fraud_engine/              — rule engine
  intelligence.py          — deterministic 5-category engine
  keyword_detector.py      — social-engineering / UPI-handle detection
  fraud_rules.py / pattern_matcher.py / fraud_scorer.py / confidence.py / recommendations.py
risk_engine/               — unified risk
  engine.py                — weighted, evidence-aware, deduped
  thresholds.py            — weights, tiers, versions (single source of truth)
  explanation.py           — human-readable explanation
  recipient.py             — recipient familiarity / reputation
  binary.py                — LEGITIMATE / FRAUDULENT (independent of tier)
ai_investigator/           — grounded AI investigator (investigator.py, prompts.py, models.py)
models/                    — isolation_forest.joblib, scaler, feature_names, score_bounds, user_profiles (Git LFS)
data/
  iron.db                  — SQLite (not served, not committed)
  scam_registry.json       — global reports
  ironwallet_transactions.csv
index.html                 — SPA entry (~6900 lines, inline JSX)
js/
  constants.js             — USERS (15), RISK_* constants
  fraud-engine.js / fraud-intelligence.js / keyword-engine.js / geo-device.js
  ai-investigator.js / simulator.js / live-protection.js
  protection-center.js / security-center.js / risk-components.js / security-monitor.js
  app.js / config.js (+ config.example.js)
  components/ (ui.js, layout.js, modals.js, report-modals.js, assistant.js)
  pages/ (login, dashboard, send-money, request-money, requests, history, insights, services, profile, scam-database)
styles.css · favicon.png · logo.png · loginbg.jpg · RBI.webp
react.min.js · react-dom.min.js · babel.min.js · socket.io.min.js (vendored)
requirements.txt · Procfile · nixpacks_backend.toml · start.bat · .env.example
generate_benchmark_*.py / run_benchmark_*.py / run_binary_500.py — dataset gen + benchmarking
tune_weights.py / tune_500.py / quick_tune.py / verify_final.py / benchmark_final.py
test_phase*.py / test_binary_threshold.py — phase + reliability tests
PHASE_*.md · BINARY_FRAUD_BENCHMARK.md · DIAGNOSIS_45pct.md · testing.md — session audits
```

## Getting Started

### Requirements

- Python **3.11+** (deploy uses `python312`)
- Git LFS (optional, for `models/isolation_forest.joblib`): `git lfs install` before clone

### Install & Run

```bash
pip install -r requirements.txt
uvicorn otp_server:app --reload
# open http://localhost:8000
```

Windows shortcut (`start.bat` — creates `.venv` if missing, installs deps, runs uvicorn on `:8000`, opens browser):

```bat
start.bat
```

### Configuration

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `ACCOUNT_SID` | optional | Twilio SID — if unset, OTP send is skipped (logged to console), app still runs |
| `AUTH_TOKEN` | optional | Twilio token |
| `TWILIO_PHONE` | optional | Twilio sender number |
| `GEMINI_API_KEY` | optional | Server-side proxy for `POST /assistant` and `POST /risk/investigate` (never exposed to browser) |
| `CORS_ORIGINS` | optional | `*` (dev, credentials off) or comma list e.g. `https://ironwallet.app,http://localhost:3000` |

Legacy `js/config.js` client-side key is deprecated — use `js/config.example.js` + backend proxy instead.

## Demo Accounts

15 seeded users in `js/constants.js:19` and `iron_store.py` (`seed_users_if_needed`). All share the same OTP flow; **Admin** bypasses verification (`000000` always succeeds).

| Phone | Name | PIN | Balance | UPI |
|-------|------|-----|---------|-----|
| `1234567890` | **Admin** | `1234` | `₹99,99,999` | `admin@ironwallet` |
| `9340228345` | Chirayu Mahajan | `1167` | ₹84,250 | `chirayu@ironwallet` |
| `9158763151` | Pranav Chopade | `2611` | ₹32,780 | `pranav@ironwallet` |
| `9766876442` | Farhan Farooqui | `1234` | ₹15,400 | `farhan@ironwallet` |
| `9876543210` | Mehul Patil | `9876` | ₹67,120 | `mehul@ironwallet` |
| `9699189866` | Vedant Deshmukh | `2805` | ₹51,900 | `vedant@ironwallet` |
| `9988776655` | Rajesh Kumar | `5555` | ₹1,25,000 | `rajesh@ironwallet` |
| `9123456789` | Amit Sharma | `1212` | ₹45,000 | `amit@ironwallet` |
| `8899776655` | Sneha Reddy | `3434` | ₹89,000 | `sneha@ironwallet` |
| `7778889990` | Vikram Singh | `5656` | ₹2,30,000 | `vikram@ironwallet` |
| `9988001122` | Irfan Khan | `7878` | ₹34,000 | `irfan@ironwallet` |
| `9663355221` | Zara Sheikh | `9090` | ₹67,800 | `zara@ironwallet` |
| `8765432109` | Rohan Deshmukh | `4321` | ₹28,500 | `rohan@ironwallet` |
| `7654321098` | Kavita Sharma | `1357` | ₹92,300 | `kavita@ironwallet` |
| `9699624733` | Shivshree Shinde | `2002` | ₹90,000 | `shivshree@ironwallet` |

Login flow: `POST /send-otp` → `POST /verify-otp` → Bearer token stored as `iron_token` → `GET /balance`, `GET /transactions?limit=50` authoritative.

## API Reference

Base: `""` (relative, same origin serves static + API). Auth header: `Authorization: Bearer <token>`.

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | `status, version 4.0.0, stage1_if_loaded, risk_engine_version, explanation_version` |
| `POST` | `/send-otp` | `{mobile}` → `OTP_SENT` / `429 RATE_LIMITED` (30s cooldown, 5/5m) |
| `POST` | `/verify-otp` | `{mobile, otp}` → `{status, token}` — Admin `1234567890+000000` scoped bypass |
| `POST` | `/behavior-score` | Stage-1 Isolation Forest only |
| `POST` | `/fraud-intelligence` | Stage-2 deterministic fraud only |
| `POST` | `/analyze` | Stage 1+2 combined + legacy `final` + unified risk |
| `POST` | `/intel/analyze` | Behavior + fraud, no final decision |
| `GET` | `/intel/behavior?user_id=` | Behaviour baseline probe |
| `GET` | `/intel/fraud?user_id=` | Fraud probe |
| `GET` | `/risk/weights` | Weights, thresholds, tiers, versions (`IRON never blocks` note) |
| `GET` | `/scam-db/check/{recipient}` | Network reputation for one recipient |
| `GET` | `/scam-db/flagged?min_count=` | All flagged recipients, sorted by count |
| `GET` | `/scam-db/stats` | `total_flagged_recipients, total_reports, high_risk_count` |
| `POST` | `/assistant` | Gemini proxy (`gemini-2.5-flash`), IP rate-limited, `503` if no key |
| `GET` | `/` · `GET /{path}` | Static allowlist only, else SPA fallback |

### Authenticated (`Depends(get_current_user)`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/logout` | Deletes session |
| `GET` | `/auth/me` | User profile + balance |
| `GET` | `/balance` | Authoritative balance |
| `GET` | `/transactions?limit=50` | Last N transactions (`1–100`) |
| `POST` | `/transactions/prepare` | `{recipient, amount, note, device_familiarity, ...}` → `{transaction_id, risk:{score,tier,signals,explanation}, verification_required, expires_at}` (600s TTL) |
| `POST` | `/transactions/confirm` | `{transaction_id, otp?}` → atomic deduct + `PROCEEDED / PROCEEDED_AFTER_OTP` (idempotent) |
| `POST` | `/risk/assess` | Authoritative unified risk for arbitrary txn (score, tier, explanation, components, binary label) |
| `GET` | `/recipients/{r}/intelligence` · `/recipient/{r}/intelligence` | Familiarity, aggregates, reputation, amount anomaly |
| `POST` | `/device/baseline` · `GET /device/baseline` | Save / fetch device + location baseline |
| `POST` | `/scam-db/report` | Authenticated report (`reporter` forced to token phone, 24h dedup) |
| `POST` | `/reports/recipient` | Protection-Center alias for recipient report |
| `POST` | `/reports/transaction` | Report a transaction (`transaction_reports`, per-user dedup) |
| `GET` | `/security/events` | Paginated security timeline (`limit/offset`) |
| `GET` | `/security/sessions` | Active sessions (masked tokens, `is_current`) |
| `POST` | `/security/sessions/{suffix}/logout` | Revoke session by token suffix |
| `GET` | `/security/overview` | Posture (`Good / Needs attention / Review recommended`), recent alerts, protection |
| `POST` | `/security/change-pin` | `{old_pin?, new_pin}` + `PIN_CHANGED` event |
| `POST` | `/risk/investigate` | Grounded AI investigator for a stored transaction |
| `POST` | `/risk/simulate` | What-if simulation (no DB mutation, current-vs-simulated diff) |
| `WS` | `/ws?token=` | Live events (`transaction_prepared, risk_updated, verification_required/completed, transaction_confirmed/completed, ...`) |

Rate limits (sliding-window `_check_generic_limit`): OTP `5/5m`, risk-assess `20/min`, prepare/confirm `10/min`, scam-report `5/min`, investigate `10/min`, simulate `20/min`, assistant `10/min` per IP.

**Example — full payment:**

```bash
# 1. OTP
curl -X POST http://localhost:8000/send-otp -H "Content-Type: application/json" -d '{"mobile":"9340228345"}'
curl -X POST http://localhost:8000/verify-otp -H "Content-Type: application/json" -d '{"mobile":"9340228345","otp":"<code>"}'
# → {token}

# 2. Prepare (authoritative risk)
curl -X POST http://localhost:8000/transactions/prepare \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"recipient":"9158763151","amount":9500,"note":"Rent"}'
# → {transaction_id, risk:{score:78, tier:"CAUTION", signals:[...], explanation:{summary}}}

# 3. Confirm
curl -X POST http://localhost:8000/transactions/confirm \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"transaction_id":"..."}'
# HIGH_RISK → include {"otp":"123456"} → PROCEEDED_AFTER_OTP
```

## Frontend

Single-file SPA `index.html` (~6900 lines) + `js/` modules. No bundler — React / ReactDOM / Babel loaded via `<script>` tags.

Pages: `LoginPage` → `Dashboard` → `SendMoneyPage` (`transactions/prepare|confirm`, `FraudRiskCard`), `RequestMoneyPage`, `HistoryPage`, `RequestsPage`, `InsightsPage`, `ServicesPage`, `ProfilePage`, `Scam Database`, `Protection Center`, `Security Center`, `Live Protection`, `AI Investigator` (`POST /risk/investigate`), `Simulator` (`POST /risk/simulate`), `SafePayAssistant` (`POST /assistant` proxied).

Key behavior: admin login verifies via backend to get token/balance; risk signals normalized for `string` vs `{description,id}` shapes; `SendMoneyPage` prefers backend risk over local estimate.

Styling: `styles.css` — navy (`#1B263B`) + gold (`#C5A059`) theme, risk-tier colors (`safe / caution / warning / blocked`), cards / modals / banners / animations.

## Security Model

- OTP: `secrets.randbelow`, 6-digit, never logged plaintext (`[DEV] OTP requested for %s`), verification events track `OTP_SUCCESS / FAILED / EXPIRED` without secret. No `_dev_otp` leaked in responses.
- Auth: `secrets.token_urlsafe(32)` `sessions` 24h (UTC `calendar.timegm`), masked tokens (`...last6`) in session list, `401` on missing / invalid / expired.
- Validation: Pydantic + `_validate_recipient_format` (phone 10–15 digits / UPI `local@handle`), `note ≤200`, `recipient 3–50`, amount `>0 ≤1e6`, PIN `4d`, OTP `6d`.
- Static: `_BLOCKED_EXTENSIONS {.py,.env,.joblib,.db,.sqlite,.json,.pkl,.sh,.pem,.key}` + dotfiles — `iron.db` / models outside allowlist.
- CORS: `CORS_ORIGINS` (`*` → credentials off, else allowlist with credentials).
- Secrets hygiene: `iron_store.py` strips `otp/pin/password/secret/token/api_key` from `security_events.meta`; Gemini key stays server-side.
- Invariants: no `payment_blocked` event ever published (`_publish_live_event` suppresses); `HIGH_RISK → OTP → PROCEEDED_AFTER_OTP`; WS `phone` query ignored (token phone only).

## Testing

Phase-grouped TestClient suites (all passing):

```
test_phase23.py      — Phase 2–3: auth, OTP, bearer, prepare/confirm, never-blocks (26 checks)
test_phase45.py      — Phase 4 ML (IF 31f, cold-start) + Phase 5 fraud (5 cats, keywords) + integration
test_phase68.py      — Phase 6 RiskEngine (weights/dedup) + Phase 7 explanation + Phase 8 recipient
test_phase9_10_11.py — Phase 9 investigator (grounded) + Phase 10 simulator (isolated) + Phase 11 WS/live
test_phase121314.py  — Phase 12 reports + Phase 13 security center + Phase 14 risk UX
test_phase15.py      — Phase 15 reliability sweep (132 checks, prod-style through Phase 14)
test_binary_threshold.py — binary threshold sweep on FINAL set
verify_final.py      — 10 acceptance checks (SAFE→PROCEEDED, HIGH_RISK→OTP→PROCEEDED_AFTER_OTP)
```

```bash
python test_phase23.py
python test_phase45.py
python test_phase68.py
python test_phase9_10_11.py
python test_phase121314.py
python test_phase15.py
python verify_final.py
```

## Benchmarks

Deterministic datasets `generate_benchmark_*.py` (seed `42`), per-user histories `10–30`.

| Suite | N | Tier accuracy | Binary fraud | Files |
|-------|---|---------------|--------------|-------|
| 300 mixed | 289 tier + 11 invalid | **~72.7%** | suspicious F1 ~86%, FPR ~12% | `benchmark_300_{cases,report,results}.json` |
| Full 500 | 500 (300 DEV / 100 VAL / 100 FINAL) | DEV ~78%, VAL ~84%, **FINAL ~74%** | FINAL F1 ~91%, FPR ~9% | `benchmark_500_{cases,report,results}.json` |
| Binary 500 | 500 (250 LEGIT / 250 FRAUD) | ~69–77% | dedicated `risk_engine/binary.py`: **FINAL 88%** (`P 91.2 / R 77.5 / F1 82.7 / FPR 8.9`) | `benchmark_binary_500_{cases,report,results}.json` |

Notes: tier `≥85` target is not met (CAUTION band is narrow at 15 pts; `CONFLICTING` / `VELOCITY` cases are hardest) — binary fraud is the defensible headline metric. Details: `BINARY_FRAUD_BENCHMARK.md`, `DIAGNOSIS_45pct.md`, `testing.md`, `PHASE_*.md`. Run locally:

```bash
python run_benchmark_500.py
python run_binary_500.py
python verify_final.py
python benchmark_final.py
```

Latency: `~36ms avg`, `~42ms p95` (in-process TestClient), E2E `~100ms`.

Weight / threshold tuning: `tune_weights.py`, `tune_500.py`, `quick_tune.py` (kept `0.35 / 0.40 / 0.15 / 0.10`, tiers `70 / 85`).

## Deployment

`Procfile` + `nixpacks_backend.toml`:

```
web: uvicorn otp_server:app --host 0.0.0.0 --port $PORT
```

```
[phases.setup] nixPkgs = ["python312"]
[phases.install] cmds = ["pip install -r requirements.txt"]
[start] cmd = "uvicorn otp_server:app --host 0.0.0.0 --port $PORT"
```

Set `ACCOUNT_SID, AUTH_TOKEN, TWILIO_PHONE, GEMINI_API_KEY, CORS_ORIGINS` in platform dashboard.

## License

[MIT](LICENSE) — Copyright (c) 2026 IronWallet

---
*~ Chirayu — Iron never blocks, it protects.*
