"""
ml_pipeline/scorer.py
─────────────────────
Loads the trained Isolation Forest artifacts and scores a single
transaction dict, returning a 0-100 behaviour score.

All model files live in  ../models/  relative to this file.
"""
import os, math, logging
import numpy as np

log = logging.getLogger("ironwallet.if_scorer")

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")

FEATURE_NAMES = [
    "amount","hour_of_day","is_weekend","is_salary_period",
    "merchant_frequency_score","recipient_frequency_score",
    "days_since_recipient_seen","device_familiarity","location_familiarity",
    "account_age_days","amount_zscore","amount_vs_user_avg",
    "amount_vs_user_median","amount_percentile","balance_drop_pct",
    "hour_sin","hour_cos","day_sin","day_cos","is_rare_merchant",
    "is_night_txn","is_peak_hour","hour_activity_score",
    "category_familiarity","txn_velocity_1h","txn_velocity_24h",
    "amount_velocity_24h","weekend_deviation",
    "merchant_category_encoded","payment_method_encoded","is_p2p",
]

CAT_ORDER = {
    "Food Delivery":0,"Grocery":1,"Grocery Delivery":2,"E-Commerce":3,
    "Gaming":4,"Entertainment":5,"Fuel":6,"Utility":7,"Rent":8,
    "Pharmacy":9,"Telecom":10,"Transfer":11,
}
PM_ORDER = {
    "UPI":0,"Debit Card":1,"Credit Card":2,
    "Net Banking":3,"Google Pay":4,"Cash":5,
}
DAY_MAP = {
    "Monday":0,"Tuesday":1,"Wednesday":2,"Thursday":3,
    "Friday":4,"Saturday":5,"Sunday":6,
}


class IFScorer:
    """Singleton — loads artifacts once, reuses across requests."""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._loaded = False
        return cls._instance

    def load(self):
        if self._loaded:
            return
        import joblib
        self.model    = joblib.load(os.path.join(MODELS_DIR, "isolation_forest.joblib"))
        self.scaler   = joblib.load(os.path.join(MODELS_DIR, "scaler.joblib"))
        self.profiles = joblib.load(os.path.join(MODELS_DIR, "user_profiles.joblib"))
        lo, hi        = joblib.load(os.path.join(MODELS_DIR, "score_bounds.joblib"))
        self.score_lo = lo
        self.score_hi = hi
        self._loaded  = True
        log.info("IF model loaded — %d users profiled", len(self.profiles))

    # ── feature engineering ────────────────────────────────────────────────
    def _engineer(self, txn: dict, uid: str) -> np.ndarray:
        p      = self.profiles.get(uid, {})
        amount = float(txn.get("amount", 0))
        avg    = p.get("amount_mean", amount) or 1
        std    = p.get("amount_std",  avg)    or 1
        median = p.get("amount_median", avg)  or 1
        p95    = p.get("amount_p95", avg * 2)
        p99    = p.get("amount_p99", avg * 3)
        hour   = int(txn.get("hour_of_day", 12))
        dow    = DAY_MAP.get(txn.get("day_of_week","Monday"), 0)
        bal_b  = float(txn.get("balance_before", 1)) or 1

        zscore     = float(np.clip((amount - avg) / std, -10, 10))
        vs_avg     = amount / avg
        vs_med     = amount / median
        bal_drop   = amount / bal_b

        if   amount >= p99: pct = 0.99
        elif amount >= p95: pct = 0.95
        elif amount >= avg + std: pct = 0.84
        elif amount >= median:    pct = 0.50
        else:                     pct = 0.25

        merch_freq  = float(txn.get("merchant_frequency_score", 0.5))
        cat_fam     = p.get("cat_freq", {}).get(txn.get("merchant_category",""), 0.0)
        peak_hours  = p.get("peak_hours", set())
        hour_freq   = p.get("hour_freq", {}).get(hour, 0.0)
        wknd_ratio  = p.get("weekend_ratio", 0.3)

        vec = [
            amount,
            hour,
            int(txn.get("is_weekend", 0)),
            int(txn.get("is_salary_period", 0)),
            merch_freq,
            float(txn.get("recipient_frequency_score", 0.0)),
            float(txn.get("days_since_recipient_seen", 0)),
            float(txn.get("device_familiarity", 1.0)),
            float(txn.get("location_familiarity", 1.0)),
            float(txn.get("account_age_days", 365)),
            zscore, vs_avg, vs_med, pct, bal_drop,
            math.sin(2*math.pi*hour/24),
            math.cos(2*math.pi*hour/24),
            math.sin(2*math.pi*dow/7),
            math.cos(2*math.pi*dow/7),
            1 if merch_freq < 0.05 else 0,
            1 if 0 <= hour <= 5 else 0,
            1 if hour in peak_hours else 0,
            hour_freq,
            cat_fam,
            float(txn.get("txn_velocity_1h",  1)),
            float(txn.get("txn_velocity_24h", 1)),
            float(txn.get("amount_velocity_24h", amount)),
            abs(float(txn.get("is_weekend", 0)) - wknd_ratio),
            CAT_ORDER.get(txn.get("merchant_category",""), len(CAT_ORDER)),
            PM_ORDER.get(txn.get("payment_method",""),      len(PM_ORDER)),
            1 if txn.get("recipient_type") == "individual" else 0,
        ]
        return np.array(vec, dtype=np.float64).reshape(1, -1)

    # ── public score method ────────────────────────────────────────────────
    def score(self, txn: dict) -> dict:
        """
        Score a transaction.  Returns:
          { behavior_score: 0-100, risk_level, user_found, if_raw }
        """
        self.load()
        uid = txn.get("user_id", "")
        user_found = uid in self.profiles

        try:
            X_raw    = self._engineer(txn, uid)
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                X_scaled = self.scaler.transform(X_raw)
            raw      = float(self.model.decision_function(X_scaled)[0])
            lo, hi   = self.score_lo, self.score_hi
            risk     = 100.0 * (hi - raw) / max(hi - lo, 1e-9)
            behavior_score = int(round(float(np.clip(risk, 0, 100))))
        except Exception as exc:
            log.warning("IF scoring failed: %s", exc)
            behavior_score = 50
            raw = 0.0

        level = (
            "LOW"      if behavior_score <= 30 else
            "MEDIUM"   if behavior_score <= 60 else
            "HIGH"     if behavior_score <= 80 else
            "CRITICAL"
        )
        return {
            "behavior_score": behavior_score,
            "risk_level":     level,
            "user_found":     user_found,
            "if_raw":         round(raw, 6),
        }
