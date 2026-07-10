"""
IronWallet – Unified Backend Server  v3.0
==========================================
Serves all endpoints from a single FastAPI app:

  OTP
  ───
  POST /send-otp
  POST /verify-otp

  Stage 1 – Isolation Forest (Behavioural Model)
  ───────────────────────────────────────────────
  POST /behavior-score
      Input : transaction dict + user_id
      Output: { behavior_score, risk_level, user_found }

  Stage 2 – Fraud Intelligence Layer (Pattern Engine)
  ────────────────────────────────────────────────────
  POST /fraud-intelligence
      Input : { behavior_score, transaction, user_profile }
      Output: { fraud_score, matched_patterns, confidence,
                recommended_action, requires_otp, … }

  Final Pipeline (convenience — runs both stages in one call)
  ────────────────────────────────────────────────────────────
  POST /analyze
      Input : full transaction + user_id
      Output: Stage1 + Stage2 + merged final_score

  Static / SPA
  ────────────
  GET  /           → index.html
  GET  /{path}     → static file or index.html
"""

import os, random, time, logging
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

# ── Stage 1: Isolation Forest ─────────────────────────────────────────────────
from ml_pipeline import IFScorer

# ── Stage 2: Fraud Intelligence Layer ────────────────────────────────────────
from fraud_engine import run_fraud_intelligence

# -- Scam Contact Database --
import scam_registry

# ── Twilio (optional) ─────────────────────────────────────────────────────────
try:
    from twilio.rest import Client as TwilioClient
    _twilio = TwilioClient(os.getenv("ACCOUNT_SID"), os.getenv("AUTH_TOKEN"))
except Exception:
    _twilio = None

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s")
log = logging.getLogger("ironwallet")

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
TWILIO_FROM = os.getenv("TWILIO_PHONE", "")
OTP_EXPIRY  = 120
otp_store: Dict[str, dict] = {}

# Pre-load the IF model at startup (avoids cold-start on first request)
_if_scorer = IFScorer()

app = FastAPI(
    title       = "IronWallet API",
    description = "Two-stage fraud detection: Isolation Forest + Fraud Intelligence Layer",
    version     = "3.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def startup():
    log.info("Loading Isolation Forest model …")
    _if_scorer.load()
    log.info("✅ IronWallet backend ready — both models loaded")


# ═══════════════════════════════════════════════════════════════════════════════
#  PYDANTIC SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class SendOTP(BaseModel):
    mobile: str

class VerifyOTP(BaseModel):
    mobile: str
    otp: str

class TransactionIn(BaseModel):
    """Common transaction fields — used by all scoring endpoints."""
    user_id:                   str   = ""
    amount:                    float = 0.0
    hour_of_day:               int   = 12
    day_of_week:               str   = "Monday"
    is_weekend:                int   = 0
    is_salary_period:          int   = 0
    merchant_name:             str   = ""
    merchant_category:         str   = ""
    recipient_type:            str   = "merchant"
    payment_method:            str   = "UPI"
    device_familiarity:        float = 1.0
    location_familiarity:      float = 1.0
    balance_before:            float = 10000.0
    account_age_days:          int   = 365
    recipient_frequency_score: float = 0.0
    days_since_recipient_seen: int   = 0
    merchant_frequency_score:  float = 0.5
    recipient_report_count:    int   = 0
    is_off_network:            bool  = False
    urgency_score:             float = 0.0
    note:                      str   = ""
    txn_velocity_1h:           int   = 1
    txn_velocity_5m:           int   = 1
    txn_velocity_24h:          int   = 1
    unique_recipients_30m:     int   = 1
    amount_velocity_24h:       float = 0.0
    recent_amounts:            List[float] = Field(default_factory=list)
    daily_spend_today:         float = 0.0

class UserProfileIn(BaseModel):
    user_id:         str   = ""
    avg_amount:      float = 1000.0
    daily_avg_spend: float = 3000.0

class FraudIntelRequest(BaseModel):
    behavior_score: float = Field(..., ge=0, le=100)
    transaction:    TransactionIn
    user_profile:   UserProfileIn

class AnalyzeRequest(BaseModel):
    """Single-call endpoint: runs Stage 1 + Stage 2 together."""
    transaction:  TransactionIn
    user_profile: UserProfileIn


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _risk_level(score: int) -> str:
    if score <= 30: return "LOW"
    if score <= 60: return "MEDIUM"
    if score <= 80: return "HIGH"
    return "CRITICAL"

def _merge_scores(behavior: int, fraud: int, critical_count: int = 0) -> int:
    blended = behavior * 0.45 + fraud * 0.55
    if critical_count > 0:
        blended = max(blended, 70)
    return int(round(min(100, max(0, blended))))


# ═══════════════════════════════════════════════════════════════════════════════
#  SCAM DATABASE SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class ReportRecipientIn(BaseModel):
    recipient: str
    reporter:  str
    reason:    str
    amount:    float = 0.0


# ═══════════════════════════════════════════════════════════════════════════════
#  ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {
        "status":              "ok",
        "version":             "3.0.0",
        "stage1_if_loaded":    _if_scorer._loaded,
        "stage2_fil_loaded":   True,
        "twilio":              _twilio is not None,
        "models": {
            "isolation_forest": "isolation_forest.joblib",
            "fraud_intelligence": "fraud_engine/ (20 rules)",
        }
    }


# ── OTP ───────────────────────────────────────────────────────────────────────

@app.post("/send-otp")
def send_otp(data: SendOTP):
    otp = str(random.randint(100000, 999999))
    otp_store[data.mobile] = {"otp": otp, "expiry": time.time() + OTP_EXPIRY}
    if not _twilio or not TWILIO_FROM:
        print(f"[DEV] OTP for {data.mobile}: {otp}")
        return {"status": "OTP_SENT", "_dev_otp": otp}
    try:
        _twilio.messages.create(
            body=f"Your Iron Wallet OTP is {otp}",
            from_=TWILIO_FROM, to="+91" + data.mobile)
        return {"status": "OTP_SENT"}
    except Exception as e:
        return {"status": "ERROR", "message": str(e)}

@app.post("/verify-otp")
def verify_otp(data: VerifyOTP):
    rec = otp_store.get(data.mobile)
    if not rec:                           return {"status": "NO_OTP"}
    if time.time() > rec["expiry"]:
        del otp_store[data.mobile];       return {"status": "OTP_EXPIRED"}
    if rec["otp"] == data.otp:
        del otp_store[data.mobile];       return {"status": "SUCCESS"}
    return {"status": "INVALID"}


# ── Stage 1: Isolation Forest ─────────────────────────────────────────────────

@app.post("/behavior-score")
def behavior_score(txn: TransactionIn):
    """
    Stage 1 – Isolation Forest Behavioural Model.

    Compares the incoming transaction against the user's 12-month
    historical baseline learned from 6,000 training transactions.

    Returns a behavior_score (0-100):
      0-30   → normal behaviour
      31-60  → mildly unusual
      61-80  → significantly unusual
      81-100 → highly anomalous
    """
    result = _if_scorer.score(txn.dict())
    return JSONResponse(content=result)


# ── Stage 2: Fraud Intelligence Layer ────────────────────────────────────────

@app.post("/fraud-intelligence")
def fraud_intelligence(req: FraudIntelRequest):
    """
    Stage 2 – Fraud Intelligence Layer (Pattern Engine).

    Does NOT learn behaviour — evaluates whether the transaction
    matches any of the 20 known fraud patterns seen in digital
    payment systems worldwide.

    Returns fraud_score + matched_patterns + recommended_action.
    """
    try:
        result = run_fraud_intelligence(
            behavior_score = req.behavior_score,
            transaction    = req.transaction.dict(),
            user_profile   = req.user_profile.dict(),
        )
        return JSONResponse(content=result)
    except Exception as exc:
        log.error("FIL error: %s", exc, exc_info=True)
        return JSONResponse(status_code=500,
            content={"error": str(exc), "fraud_score": 0, "matched_patterns": []})


# ── Full pipeline: Stage 1 + Stage 2 in one call ─────────────────────────────

@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    """
    Convenience endpoint — runs the complete two-stage pipeline:

      Transaction
          ↓
      Stage 1: Isolation Forest  →  behavior_score
          ↓
      Stage 2: Fraud Intelligence Layer  →  fraud_score + patterns
          ↓
      Final merged score  (Stage1 × 0.45 + Stage2 × 0.55)

    Returns all intermediate and final scores in one response.
    """
    # Stage 1
    s1 = _if_scorer.score(req.transaction.dict())
    behavior_score = s1["behavior_score"]

    # Stage 2
    s2 = run_fraud_intelligence(
        behavior_score = float(behavior_score),
        transaction    = req.transaction.dict(),
        user_profile   = req.user_profile.dict(),
    )

    # Merge
    critical_count = s2.get("signal_summary", {}).get("critical_count", 0)
    final_score    = _merge_scores(behavior_score, s2["fraud_score"], critical_count)

    return JSONResponse(content={
        "stage1": {
            "behavior_score": behavior_score,
            "risk_level":     s1["risk_level"],
            "user_found":     s1["user_found"],
            "if_raw":         s1["if_raw"],
        },
        "stage2": s2,
        "final": {
            "score":              final_score,
            "risk_level":         _risk_level(final_score),
            "recommended_action": s2["recommended_action"],
            "requires_otp":       s2["requires_otp"],
            "alert_level":        s2["alert_level"],
        },
    })


# ── Scam Contact Database -- network-wide, persistent ───────────────────────

@app.post("/scam-db/report")
def report_recipient(req: ReportRecipientIn):
    """
    Report a recipient as suspicious. Persists to a network-wide JSON store
    visible to ALL users -- not just the reporter.

    Escalation tiers:
      1 report   -> flagged
      3+ reports -> high_risk
      5+ reports -> network_blocked
    """
    result = scam_registry.report_recipient(
        recipient = req.recipient,
        reporter  = req.reporter,
        reason    = req.reason,
        amount    = req.amount,
    )
    log.info("SCAM REPORT  recipient=%s  reporter=%s  count=%s  tier=%s",
              req.recipient, req.reporter, result["report_count"], result["tier"])
    return JSONResponse(content=result)


@app.get("/scam-db/check/{recipient}")
def check_recipient(recipient: str):
    """
    Check a single recipient's network-wide risk status before sending.
    Called automatically when a recipient is entered in the send-money form.
    """
    return JSONResponse(content=scam_registry.get_recipient_risk(recipient))


@app.get("/scam-db/flagged")
def list_flagged(min_count: int = 1):
    """
    Returns every recipient with at least `min_count` reports, sorted by
    severity. Powers the browsable Scam Database page in the UI.
    """
    return JSONResponse(content=scam_registry.get_all_flagged(min_count))


@app.get("/scam-db/stats")
def scam_db_stats():
    """Network-wide summary stats: total flagged, high-risk, blocked counts."""
    return JSONResponse(content=scam_registry.get_stats())


# ── Static file server ────────────────────────────────────────────────────────

@app.get("/")
def root():
    return FileResponse(os.path.join(BASE_DIR, "index.html"), media_type="text/html")

@app.get("/{full_path:path}")
def serve_file(full_path: str):
    fp = os.path.join(BASE_DIR, full_path)
    if os.path.isfile(fp):
        return FileResponse(fp)
    return FileResponse(os.path.join(BASE_DIR, "index.html"), media_type="text/html")
