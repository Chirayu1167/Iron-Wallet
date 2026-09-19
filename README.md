# IronWallet — Secure Payments with Real-Time Fraud Intelligence

> A full-stack wallet demo that *never* blocks a payment — it warns, explains, and verifies. Backend is the single source of truth for identity, balance, risk, and transactions.

[![FastAPI](https://img.shields.io/badge/FastAPI-4.0.0-009688)](otp_server.py)
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
- [Benchmarks](#benchmarks)
- [Deployment](#deployment)
- [License](#license)

---

## Why IronWallet

Most wallets either block blindly or warn with a vague score. IronWallet combines:

1. **Behavioural anomaly detection** (Isolation Forest) — personalized to *your* history.
2. **Deterministic fraud intelligence** — 20 rule patterns, 5 categories, velocity/keyword/device checks.
3. **Recipient reputation** — personal familiarity + network-wide report count.
4. **Unified RiskEngine** — evidence-aware, deduplicated, explainable. One authoritative score on backend and frontend.

Result: `0–100` risk, `SAFE / CAUTION / HIGH_RISK`, human-readable why, and a safe path to proceed (`OTP → PROCEEDED_AFTER_OTP`).

## Core Principle

```
IRON NEVER BLOCKS A PAYMENT.

HIGH_RISK = OTP challenge → user can still proceed → PROCEEDED_AFTER_OTP
No BLOCK / FROZEN / NETWORK_BLOCKED payment state exists.
```

## Features

**Auth & Persistence (Phases 2–3)**
- OTP via Twilio (`POST /send-otp` / `POST /verify-otp`), `secrets.randbelow` 120s expiry, 30s cooldown, 5/5m limit.
- Bearer token auth (`secrets.token_urlsafe` 24h), `GET /auth/me`, `POST /auth/logout`.
- SQLite (`data/iron.db`) via `iron_store.py` — users, transactions, risk_events, verification_events, baselines, sessions, transaction_reports, security_events. WAL + FK, atomic `confirm_transaction_atomic`.

**Behaviour ML (Phase 4)**
- Isolation Forest `31-vector` (`ml_pipeline/features.py` canonical), history-aware `score_with_history`, cold-start handling, confidence `0.27–0.88`, `iforest-v1`.

**Fraud Intelligence (Phase 5)**
- Deterministic engine `fraud_engine/intelligence.py` — 5 categories, keyword/social-engineering (`fraud_engine/keyword_detector.py`), device/location, velocity bursts.

**Risk Engine (Phases 6–8)**
- Unified `risk_engine/engine.py` weights `behavior 0.35 / fraud 0.40 / recipient 0.15 / context 0.10`, evidence-aware deduplication, `iron_tier` / `risk_level`, `build_explanation` — summary, reasons, tier message.

**AI Investigator (Phase 9)**
- Grounded investigator `ai_investigator/` — templated fallback, never invents scores. `POST /investigate`.

**Simulator & Live Protection (Phases 10–11)**
- Isolated simulation reusing RiskEngine (`POST /simulate`), live WebSocket events (`_ws_connections`, never emits `payment_blocked`).

**Product UX (Phases 12–14)**
- Protection Center, Security Center, Scam Database (report/check/flagged/stats), transaction reporting with 24h dedup, security events timeline.

**Binary Fraud**
- `risk_engine/binary.py` `classify_binary` / `is_fraudulent` — `LEGITIMATE` vs `FRAUDULENT` independent of tier mapping.

## Architecture

```
index.html (React SPA, Babel in-browser, no build)  ─┐
js/* (constants, fraud-engine, geo-device, etc.)      │
                         │  fetch / WebSocket (relative API="")
                         ▼
otp_server.py (FastAPI 4.0 — single source of truth)  ── iron_store.py (SQLite)
  ├─ ml_pipeline/IFScorer  ── models/isolation_forest.joblib
  ├─ fraud_engine/intelligence + keyword_detector
  ├─ risk_engine/engine + thresholds + explanation + binary
  ├─ risk_engine/recipient (familiarity, report, recency)
  ├─ scam_registry.py (JSON, network reputation)
  └─ ai_investigator/ (grounded)
```

Static serving: allowlist `js/`, `styles.css`, `index.html`; blocks `.py/.env/.joblib/.db/.json` (`_BLOCKED_EXTENSIONS`).

## Fraud Pipeline

Single authoritative path `POST /risk/assess` and `POST /transactions/prepare` → `_compute_unified_risk`:

1. **Behavior** — `_build_behavior_result` → `_if_scorer.score_with_history(txn, history)` → `behavior_score` + `confidence` + `signals` + `cold_start`.
2. **Fraud** — `_build_fraud_result` → `run_fraud_intelligence_deterministic(transaction, history, user_profile, behavior_score)` → `fraud_score` + `signals`.
3. **Recipient** — `_build_recipient_profile` → `get_recipient_intelligence_api(phone, recipient, amount)` → `risk_score` + `familiarity` + `reputation`.
4. **Context** — `_build_context` → device/location/velocity signals (low familiarity, `high_velocity_5m`).
5. **RiskEngine** — `_risk_engine.assess(behavior, fraud_intelligence, recipient, context, transaction)` → `score 0–100` + `tier` + `confidence` + `signals` (deduplicated) + `components` + `explanation`.

Frontend `SendMoneyPage` calls `POST /transactions/prepare` and **overrides** local `totalRisk/tier` with `prepData.risk` when backend reachable (`index.html:2469`).

## Risk Tiers

| Score | Tier | Frontend UX | Backend `verification_required` |
|------:|------|-------------|---------------------------------|
| `0–69` | `SAFE` | silent → PIN directly | `NONE` |
| `70–84` | `CAUTION` | soft popup / banner | `NONE` (warning) |
| `85–100` | `HIGH_RISK` | full `FraudRiskCard` + OTP | `OTP` — `OTP_SUCCESS` → `PROCEEDED_AFTER_OTP` |

Constants `js/constants.js:10` — `RISK_SILENT 39 / RISK_POPUP 40 / RISK_SCREEN 75 / RISK_OTP 85 / RISK_COOLING 90` map to UI layers; 30s cooling at `90+`.

Backend thresholds `risk_engine/thresholds.py:15` `RISK_TIRESHOLDS` align to `SAFE (0,69) CAUTION (70,84) HIGH_RISK (85,100)`.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend | FastAPI, Uvicorn, Pydantic v2, SQLite + WAL |
| ML | scikit-learn 1.8 Isolation Forest, NumPy 2, joblib |
| Auth | `secrets`, Bearer token, 24h `sessions` |
| OTP | Twilio (optional, graceful fallback) |
| Frontend | React + ReactDOM (vendored) + Babel in-browser, single `index.html` SPA |
| Realtime | WebSocket (`_ws_connections`, `_publish_live_event`, `_ALLOWED_LIVE_EVENTS`) |
| Deploy | Railway / Heroku (`Procfile`, `nixpacks_backend.toml`) |

## Project Structure

```
otp_server.py              — FastAPI app (Phases 2–14, sole backend authority)
iron_store.py              — SQLite persistence layer
scam_registry.py           — network-wide recipient risk (JSON, 24h dedup)
ml_pipeline/               — Isolation Forest scorer + 31-feature pipeline
  scorer.py                — IFScorer, history-aware, cold_start
  features.py              — canonical feature vector
fraud_engine/              — rule engine
  intelligence.py          — deterministic 5-category engine
  keyword_detector.py      — social-engineering detection
risk_engine/               — unified risk
  engine.py                — weighted, evidence-aware, dedup
  thresholds.py            — weights, tiers, versions
  explanation.py           — human-readable explanation
  recipient.py             — recipient intelligence
  binary.py                — LEGITIMATE/FRAUDULENT
ai_investigator/           — grounded AI investigator (prompts, models)
models/                    — isolation_forest.joblib (Git LFS)
data/
  iron.db                  — SQLite (not served, not committed)
  scam_registry.json       — global reports
index.html                 — SPA entry (JSX inline)
js/
  constants.js             — USERS (15), SEED_TXS/REQS, RISK_* constants
  fraud-engine.js / fraud-intelligence.js / keyword-engine.js / geo-device.js
  ai-investigator.js / simulator.js / live-protection.js
  protection-center.js / security-center.js / risk-components.js / security-monitor.js
  pages/  components/
styles.css · favicon.png · react*.min.js · babel.min.js · socket.io.min.js
requirements.txt · Procfile · nixpacks_backend.toml · start.bat
benchmark_*.py / generate_*.py / run_*.py — dataset gen + benchmarking
PHASE_*.md · BINARY_FRAUD_BENCHMARK.md — session audits
```

## Getting Started

### Requirements

- Python **3.11+**
- Git LFS (optional, for `models/isolation_forest.joblib`): `git lfs install` before clone

### Install & Run

```bash
pip install -r requirements.txt
uvicorn otp_server:app --reload
# open http://localhost:8000
```

Windows shortcut:

```bat
start.bat   # creates .venv, installs deps, runs uvicorn
```

### Configuration

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `ACCOUNT_SID` | optional | Twilio SID — if unset, OTP send is skipped, app still runs |
| `AUTH_TOKEN` | optional | Twilio token |
| `TWILIO_PHONE` | optional | Twilio sender number |
| `GEMINI_API_KEY` | optional | Server-side proxy for `POST /assistant` (never exposed to browser) |
| `CORS_ORIGINS` | optional | `*` (dev) or comma list e.g. `https://ironwallet.app,http://localhost:3000` |

Legacy `js/config.js` client-side key is deprecated — see `js/config.example.js`.

## Demo Accounts

15 seeded users in `js/constants.js:19` and `iron_store.py:631` (`seed_users_if_needed`). All share the same OTP flow; **Admin** bypasses verification.

| Phone | Name | PIN | Balance | UPI |
|-------|------|-----|---------|-----|
| `1234567890` | **Admin** | `1234` | `₹99,99,999` | `admin@ironwallet` — OTP `000000` always succeeds, returns real token |
| `9340228345` | Chirayu Mahajan | `1167` | ₹84,250 | `chirayu@ironwallet` |
| `9158763151` | Pranav Chopade | `2611` | ₹32,780 | `pranav@ironwallet` |
| `9766876442` | Farhan Farooqui | `1234` | ₹15,400 | `farhan@ironwallet` |
| `9876543210` | Mehul Patil | `9876` | ₹67,120 | `mehul@ironwallet` |
| `9699189866` | Vedant Deshmukh | `2805` | ₹51,900 | `vedant@ironwallet` |
| `9988776655` | Rajesh Kumar | `5555` | ₹1,25,000 | `rajesh@ironwallet` |
| ... | 8 more | ... | ... | (see `js/constants.js`) |

Login flow: `POST /send-otp` → `POST /verify-otp` → Bearer token stored as `iron_token` → `GET /balance`, `GET /transactions?limit=50` authoritative.

## API Reference

Base: `""` (relative, same origin serves static). Auth header: `Authorization: Bearer <token>`.

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | `stage1_if_loaded`, `risk_engine_version`, `explanation_version` |
| `POST` | `/send-otp` | `{mobile}` → `OTP_SENT` / `429 RATE_LIMITED` (30s cooldown, 5/5m) |
| `POST` | `/verify-otp` | `{mobile, otp}` → `{status, token}` — Admin `1234567890+000000` scoped bypass |
| `GET` | `/scam-db/check?recipient=` | network reputation |
| `GET` | `/scam-db/flagged` · `/stats` | public |
| `GET` | `/` · `GET /{path}` | static allowlist only |

### Authenticated (`Depends(get_current_user)`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/logout` | deletes session |
| `GET` | `/auth/me` | user profile + balance |
| `GET` | `/balance` | authoritative balance |
| `GET` | `/transactions?limit=50` | last N transactions |
| `POST` | `/transactions/prepare` | `{recipient, amount, note, device_familiarity, ...}` → `{transaction_id, risk:{score,tier,signals,explanation}, expires_at}` |
| `POST` | `/transactions/confirm` | `{transaction_id, otp?}` → atomic deduct + `PROCEEDED / PROCEEDED_AFTER_OTP` |
| `POST` | `/risk/assess` | unified risk for arbitrary txn |
| `POST` | `/behavior-score` | Stage 1 IF only |
| `POST` | `/fraud-intelligence` | Stage 2 FIL only |
| `POST` | `/analyze` | Stage 1+2 combined |
| `GET` | `/intel/behavior?user_id=` | behaviour baseline |
| `POST` | `/scam-db/report` | authenticated, `reporter` overridden, 24h dedup |
| `POST` | `/report/transaction` | `transaction_reports` |
| `POST` | `/investigate` | AI investigator (grounded) |
| `POST` | `/simulate` | isolated simulation (reuses RiskEngine) |
| `WS` | `/ws?token=` | live events (`_ALLOWED_LIVE_EVENTS`, never `payment_blocked`) |
| `GET/POST` | `/device/baseline` | device/location baseline |

Rate buckets: `_otp_send_attempts`, `_prepare_attempts`, `_confirm_attempts`, `_assistant_attempts`, `_investigate_attempts`, `_simulate_attempts`, `_report_attempts`, etc. — sliding window via `_check_generic_limit`.

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

Single-file SPA `index.html` (~7400 lines) + `js/` modules. No bundler — React/Babel loaded via `<script>` tags.

Pages: `LoginPage` → `Dashboard` → `SendMoneyPage` (`transactions/prepare|confirm`, `FraudRiskCard`), `RequestMoneyPage`, `HistoryPage`, `RequestsPage`, `InsightsPage`, `ServicesPage`, `ProfilePage`, `Scam Database`, `Protection Center`, `Security Center`, `Live Protection`, `AI Investigator` (`POST /investigate`), `Simulator` (`POST /simulate`), `SafePayAssistant` (`POST /assistant` proxied).

Key fix: admin login verifies via backend to get token/balance (`index.html:298`); risk signals normalized `string` vs `{description,id}` (`index.html:1226`, `2488`).

## Security Model

- OTP: `secrets.randbelow`, never logged plaintext (`[DEV] OTP requested for %s`), verification events track `OTP_SUCCESS/FAILED/EXPIRED` without secret.
- Auth: `secrets.token_urlsafe(32)` `sessions` 24h, UTC `calendar.timegm`, masked tokens `get_sessions_for_user`.
- Validation: `Pydantic` + `_validate_recipient_format` (phone 10–15 digits / UPI `local@handle`), `note max 200`, `recipient 3–50`, amount `0–1e6`.
- Static: `_BLOCKED_EXTENSIONS {.py,.env,.joblib,.db,.sqlite,.json,.pkl,.sh,.pem,.key}` — `iron.db` outside allowlist.
- CORS: `CORS_ORIGINS` (`*` → credentials off).
- No `payment_blocked` event ever published (`_publish_live_event` suppresses).
- `iron_store.py:589` strips `otp/pin/password/secret/token/api_key` from `security_events.meta`.

## Benchmarks

Deterministic datasets `generate_benchmark_*.py` (seed `42`), per-user histories `10–30`.

| Suite | N | Result | Files |
|-------|---|--------|-------|
| Binary fraud (new 500) | 500 (300 DEV / 100 VAL / 100 FINAL) | **tier ~74–78%**, **binary ~87–88%** (VAL `83.8%` tier) | `benchmark_binary_500_{cases,report,results}.json` |
| Full 500 | 500 | similar | `benchmark_500_{cases,report,results}.json` |
| 300 | 300 | — | `benchmark_300_{cases,report,results}.json` |

Details: `BINARY_FRAUD_BENCHMARK.md`, `PHASE_*.md`. Run locally:

```bash
python run_benchmark_500.py
python run_binary_500.py
python verify_final.py
```

Latency: `~36ms avg`, `~42ms p95` (in-process TestClient).

## Deployment

`Procfile` + `nixpacks_backend.toml`:

```
web: uvicorn otp_server:app --host 0.0.0.0 --port $PORT
```
```
nixPkgs = ["python312"]
cmds   = ["pip install -r requirements.txt"]
cmd    = "uvicorn otp_server:app --host 0.0.0.0 --port $PORT"
```

Set `ACCOUNT_SID, AUTH_TOKEN, TWILIO_PHONE, GEMINI_API_KEY, CORS_ORIGINS` in platform dashboard.

## License

[MIT](LICENSE) — Copyright (c) 2026 IronWallet

---
*~ Chirayu — Iron never blocks, it protects.*
