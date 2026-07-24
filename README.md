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

**2. Frontend (AI assistant via Gemini) — optional**

```bash
cp js/config.example.js js/config.js
# fill in your Gemini API key
```

⚠️ **Note:** this key is called directly from the browser (`js/components/assistant.js`), so it's visible to anyone using the app via devtools/network tab. That's fine for a local demo, but for a real deployment you should proxy this call through `otp_server.py` instead of exposing the key client-side.

## Deployment

`Procfile` and `nixpacks_backend.toml` are set up for Railway/Heroku-style platforms:

```
web: uvicorn otp_server:app --host 0.0.0.0 --port $PORT
```

Set `ACCOUNT_SID`, `AUTH_TOKEN`, and `TWILIO_PHONE` as environment variables in your platform's dashboard.

## API

See the docstring at the top of `otp_server.py` for the full endpoint list (`/send-otp`, `/verify-otp`, `/behavior-score`, `/fraud-intelligence`, `/analyze`).
~Chirayu ;)
## License

See [LICENSE](LICENSE).
