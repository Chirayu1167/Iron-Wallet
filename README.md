# IronWallet

A demo payment/wallet web app with a two-stage fraud detection pipeline:

1. **Behavioural model** — an Isolation Forest scores each transaction against a user's historical profile (`ml_pipeline/`).
2. **Fraud Intelligence Layer** — a rule/pattern engine layered on top of the behavioural score to flag known scam patterns, suspicious keywords, geo/device anomalies, etc. (`fraud_engine/`, `js/fraud-engine.js`, `js/keyword-engine.js`, `js/geo-device.js`).

The frontend is a single-page React app (loaded via in-browser Babel, no build step) served as static files by a FastAPI backend that also handles OTP verification and the fraud-scoring endpoints.

## Project structure

```
otp_server.py          FastAPI app: OTP endpoints + fraud-scoring API + static file serving
ml_pipeline/            Stage 1 — Isolation Forest behavioural scorer
fraud_engine/           Stage 2 — rule-based fraud intelligence layer
models/                 Pretrained model artifacts (.joblib) — tracked via Git LFS
data/                   Sample transaction data + scam registry
scam_registry.py        Known scam contact/number lookups
index.html              SPA entry point (inline JSX, compiled in-browser)
js/                     App source: pages, components, fraud/security modules
styles.css              App styling
```

## Setup

### Requirements
- Python 3.11+
- (Optional) Git LFS, since `models/isolation_forest.joblib` is tracked with it — run `git lfs install` before cloning if you want the model file pulled automatically.

### Install & run

```bash
pip install -r requirements.txt
uvicorn otp_server:app --reload
```

Then open http://localhost:8000.

On Windows you can instead run `start.bat`, which sets up a local virtualenv for you.

### Configuration

Two things need local secrets that are **not** committed to this repo:

**1. Backend (OTP via Twilio) — optional**

```bash
cp .env.example .env
# fill in ACCOUNT_SID, AUTH_TOKEN, TWILIO_PHONE
```

If left unset, OTP sending is skipped gracefully — the app still runs.

**2. AI assistant via Gemini (proxied) — optional**

```bash
cp .env.example .env
# fill in GEMINI_API_KEY (server-side, never exposed to browser)
```

The frontend `SafePayAssistant` (`index.html:6490` / `js/components/assistant.js:2`) now calls `POST /assistant` on the FastAPI backend (`otp_server.py:484`), which proxies to `generativelanguage.googleapis.com` using the server-side `GEMINI_API_KEY`. The legacy `js/config.js` client-side key is deprecated and no longer used — see `js/config.example.js`.

## Deployment

`Procfile` and `nixpacks_backend.toml` are set up for Railway/Heroku-style platforms:

```
web: uvicorn otp_server:app --host 0.0.0.0 --port $PORT
```

Set `ACCOUNT_SID`, `AUTH_TOKEN`, `TWILIO_PHONE`, `GEMINI_API_KEY`, and optionally `CORS_ORIGINS` as environment variables in your platform's dashboard.

## API

See the docstring at the top of `otp_server.py` for the full endpoint list (`/send-otp`, `/verify-otp`, `/behavior-score`, `/fraud-intelligence`, `/analyze`, `/assistant`, `/scam-db/*`). Frontend risk scoring in `index.html:2150` now calls live `POST /analyze` (IF + FIL) via `fetchLiveMLScore` with local `mlFraudScore` fallback if the backend is unreachable.
~Chirayu ;)
## License

See [LICENSE](LICENSE).
