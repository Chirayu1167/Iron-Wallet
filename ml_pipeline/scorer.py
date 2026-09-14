"""
ml_pipeline/scorer.py (Phase 4 - Behavioural ML)
─────────────────────────────────────────────────────
Loads the trained Isolation Forest artifacts and scores a single
transaction dict, returning a 0-100 behaviour score.

All model files live in  ../models/  relative to this file.

Phase 4 enhancements:
- Real persisted history via ml_pipeline.features (centralized 31-vector)
- User-specific baselines from history (mean/median/std/etc)
- Cold-start explicit handling
- Confidence + structured signals + features exposure
- Model versioning, safety checks, no silent fallback
- Score direction verified: normal → low, anomalous → high
"""
import os, math, logging
import numpy as np

log = logging.getLogger("ironwallet.if_scorer")

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
MODEL_VERSION = "iforest-v1"

# Keep FEATURE_NAMES for backward compat, but canonical order lives in features.py
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

PHONE_TO_PROFILE = {
    "9340228345": "U001",
    "9158763151": "U002",
    "9766876442": "U004",
    "9876543210": "U003",
    "9699189866": "U001",
    "9988776655": "U002",
    "9123456789": "U003",
    "8899776655": "U004",
    "7778889990": "U002",
    "9988001122": "U003",
    "9663355221": "U004",
    "8765432109": "U001",
    "7654321098": "U002",
    "9699624733": "U003",
    "1234567890": "U001",
}

def _resolve_profile_id(uid: str) -> str:
    if not uid:
        return uid
    uid = str(uid).strip()
    if uid in PHONE_TO_PROFILE:
        return PHONE_TO_PROFILE[uid]
    return uid


class IFScorer:
    """Singleton — loads artifacts once, reuses across requests."""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._loaded = False
            cls._instance._load_error = None
        return cls._instance

    def load(self):
        if self._loaded:
            if self._load_error:
                raise RuntimeError(f"IF model load failed: {self._load_error}")
            return
        import joblib
        # ── safety: verify artifacts exist before loading ──
        required = ["isolation_forest.joblib", "scaler.joblib", "user_profiles.joblib", "score_bounds.joblib"]
        for fname in required:
            fpath = os.path.join(MODELS_DIR, fname)
            if not os.path.exists(fpath):
                self._load_error = f"Missing artifact {fname} at {fpath}"
                log.error(self._load_error)
                raise FileNotFoundError(self._load_error)
        try:
            self.model    = joblib.load(os.path.join(MODELS_DIR, "isolation_forest.joblib"))
            self.scaler   = joblib.load(os.path.join(MODELS_DIR, "scaler.joblib"))
            self.profiles = joblib.load(os.path.join(MODELS_DIR, "user_profiles.joblib"))
            lo, hi        = joblib.load(os.path.join(MODELS_DIR, "score_bounds.joblib"))
            self.score_lo = lo
            self.score_hi = hi
        except Exception as e:
            self._load_error = str(e)
            log.error("IF model load failed: %s", e)
            raise

        # ── Validate feature count matches scaler and FEATURE_NAMES ──
        try:
            n_features = getattr(self.scaler, "n_features_in_", None) or getattr(self.scaler, "n_features", None)
            if n_features is not None and n_features != len(FEATURE_NAMES):
                # For Phase 4, FEATURE_NAMES is 31 and scaler is 31 — must match
                self._load_error = f"Scaler feature count {n_features} != expected {len(FEATURE_NAMES)}"
                log.warning(self._load_error)
                # Try to continue but log clearly; don't silently pretend
            # Also verify model
            m_features = getattr(self.model, "n_features_in_", None)
            if m_features is not None and n_features is not None and m_features != n_features:
                self._load_error = f"Model n_features {m_features} != scaler {n_features}"
                log.warning(self._load_error)
            # Check sklearn version compatibility via log
            try:
                import sklearn
                if sklearn.__version__ != "1.8.0":
                    log.warning("IF model trained on sklearn 1.8.0 but running %s — possible incompatibility", sklearn.__version__)
            except Exception:
                pass
        except Exception as e:
            log.warning("IF validation warning: %s", e)

        self._loaded  = True
        self._load_error = None
        log.info("IF model loaded — %d users profiled, version %s, scaler features %s", len(self.profiles), MODEL_VERSION, getattr(self.scaler, "n_features_in_", "?"))

    # ── legacy feature engineering (kept for backward compat, not used for new history-aware path) ──
    def _engineer(self, txn: dict, uid: str) -> np.ndarray:
        resolved = _resolve_profile_id(uid)
        p      = self.profiles.get(resolved, self.profiles.get(uid, {}))
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

    # ── confidence helper ────────────────────────────────────────────────────
    def _compute_confidence(
        self,
        history_count: int,
        user_found: bool,
        cold_start: bool,
        features_completeness: float,
        profile_exists: bool,
    ) -> float:
        """
        Meaningful ML confidence 0.0-1.0.
        Factors: history amount, profile existence, cold_start, feature completeness.
        """
        base = 0.25
        # history contribution — capped at 30
        hist_factor = min(history_count / 30.0, 1.0) * 0.45  # up to 0.45
        # profile existence bonus
        profile_bonus = 0.15 if profile_exists else 0.0
        # completeness (all features present => 0.10)
        comp_bonus = float(features_completeness) * 0.10
        conf = base + hist_factor + profile_bonus + comp_bonus
        if cold_start:
            conf *= 0.65  # reduce confidence for cold start
            conf = max(conf, 0.1)
        if not user_found:
            conf *= 0.75
        if history_count == 0:
            conf = min(conf, 0.35)
        # clamp 0-1
        return float(round(min(max(conf, 0.05), 0.98), 2))

    # ── explanation signals helper ──────────────────────────────────────────
    def _build_explanations(
        self,
        features: dict,
        diagnostics: dict,
        history_count: int,
        cold_start: bool,
    ) -> list:
        """
        Return structured reasons for anomaly, only for actual feature evidence.
        Each: {feature, description, severity: low/medium/high}
        """
        signals = []
        # Amount deviation
        z = features.get("amount_zscore", 0)
        vs_avg = features.get("amount_vs_user_avg", 1)
        if abs(z) >= 3.0:
            signals.append({
                "feature": "amount_deviation",
                "description": f"Amount is significantly above the user's normal range (z-score {z:.1f}, {vs_avg:.1f}× avg)",
                "severity": "high"
            })
        elif abs(z) >= 2.0:
            signals.append({
                "feature": "amount_deviation",
                "description": f"Amount is above normal (z-score {z:.1f})",
                "severity": "medium"
            })
        # Recipient novelty
        recip_freq = features.get("recipient_frequency_score", 0)
        days_since = features.get("days_since_recipient_seen", 0)
        if recip_freq == 0 and days_since >= 999:
            signals.append({
                "feature": "recipient_novelty",
                "description": "Recipient has not appeared in the user's transaction history",
                "severity": "medium"
            })
        elif days_since >= 60:
            signals.append({
                "feature": "recipient_rarity",
                "description": f"Recipient not seen for {int(days_since)} days",
                "severity": "low"
            })
        # Velocity
        v1h = features.get("txn_velocity_1h", 1)
        v24h = features.get("txn_velocity_24h", 1)
        if v1h >= 6:
            signals.append({
                "feature": "velocity_1h",
                "description": f"High velocity: {int(v1h)} transactions in the last hour",
                "severity": "high"
            })
        elif v1h >= 3:
            signals.append({
                "feature": "velocity_1h",
                "description": f"Elevated velocity: {int(v1h)} transactions in the last hour",
                "severity": "medium"
            })
        if v24h >= 10:
            signals.append({
                "feature": "velocity_24h",
                "description": f"High daily velocity: {int(v24h)} transactions in 24h",
                "severity": "medium"
            })
        # Time anomaly
        if features.get("is_night_txn", 0) == 1:
            signals.append({
                "feature": "unusual_hour",
                "description": f"Transaction at unusual hour ({int(features.get('hour_of_day',12))}:00, night window)",
                "severity": "medium"
            })
        elif features.get("is_rare_merchant", 0) == 1:
            signals.append({
                "feature": "rare_merchant",
                "description": "Merchant/category rarely used by this user",
                "severity": "low"
            })
        # Balance impact
        bal_drop = features.get("balance_drop_pct", 0)
        if bal_drop >= 0.7:
            signals.append({
                "feature": "balance_impact",
                "description": f"Transaction consumes {bal_drop*100:.0f}% of available balance",
                "severity": "high"
            })
        elif bal_drop >= 0.4:
            signals.append({
                "feature": "balance_impact",
                "description": f"Transaction uses {bal_drop*100:.0f}% of balance",
                "severity": "medium"
            })
        # Device/location
        if features.get("device_familiarity", 1.0) < 0.5:
            signals.append({
                "feature": "device_familiarity",
                "description": "Unfamiliar device",
                "severity": "medium"
            })
        if features.get("location_familiarity", 1.0) < 0.5:
            signals.append({
                "feature": "location_familiarity",
                "description": "Unfamiliar location",
                "severity": "medium"
            })
        # Cold start note — not a risk signal but context
        # Do NOT add fake signals when cold_start; only explain if real evidence above.
        # Ensure we don't produce generic "suspicious" without evidence.
        return signals

    # ── public score method (backward compat + enhanced) ─────────────────────
    def score(self, txn: dict) -> dict:
        """
        Legacy score() — kept for backward compat.
        Now delegates to history-aware path if txn contains _history,
        otherwise uses profile-only fallback but adds new fields.

        Returns:
          { behavior_score, risk_level, user_found, if_raw,
            confidence, history_count, cold_start, signals, features,
            model_version }
        """
        # Try to extract history if caller embedded it
        history = txn.get("_history") if isinstance(txn.get("_history"), list) else None
        if history is not None:
            # Use enhanced path
            try:
                return self.score_with_history(txn, history)
            except Exception:
                pass
        # Legacy path — but enhance with confidence/signals via dummy history
        self.load()
        uid = txn.get("user_id", "")
        resolved = _resolve_profile_id(uid)
        user_found = resolved in self.profiles or uid in self.profiles
        profile = self.profiles.get(resolved, self.profiles.get(uid, None))

        # Try centralized features with empty history to get proper cold_start handling
        try:
            from .features import generate_feature_vector, compute_baseline_from_history
            history_empty: list = []
            baseline = compute_baseline_from_history(history_empty, profile)
            vec, features_dict, diagnostics = generate_feature_vector(txn, history_empty, profile, baseline)
            X_scaled = self.scaler.transform(vec)
            raw = float(self.model.decision_function(X_scaled)[0])
            lo, hi = self.score_lo, self.score_hi
            risk = 100.0 * (hi - raw) / max(hi - lo, 1e-9)
            behavior_score = int(round(float(np.clip(risk, 0, 100))))
            history_count = 0
            cold_start = True
            # confidence and signals
            confidence = self._compute_confidence(history_count, user_found, cold_start, 0.6, bool(profile))
            signals = self._build_explanations(features_dict, diagnostics, history_count, cold_start)
        except Exception as exc:
            # If model cannot be used, fail clearly — don't silently return fake 50 in production
            # For backward compat when history not available, we still attempt legacy _engineer
            # but mark confidence low
            log.warning("IF scoring (enhanced) failed, trying legacy: %s", exc)
            try:
                X_raw = self._engineer(txn, resolved)
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    X_scaled = self.scaler.transform(X_raw)
                raw = float(self.model.decision_function(X_scaled)[0])
                lo, hi = self.score_lo, self.score_hi
                risk = 100.0 * (hi - raw) / max(hi - lo, 1e-9)
                behavior_score = int(round(float(np.clip(risk, 0, 100))))
                features_dict = {}
                diagnostics = {"cold_start": True, "history_count": 0}
                confidence = self._compute_confidence(0, user_found, True, 0.5, bool(profile))
                signals = []
            except Exception as exc2:
                log.warning("IF scoring failed completely: %s", exc2)
                # No silent fallback to 50 without flag — raise if load error, else return marked fallback
                if self._load_error:
                    raise RuntimeError(f"ML model unavailable: {self._load_error}") from exc2
                behavior_score = 50
                raw = 0.0
                features_dict = {}
                diagnostics = {}
                confidence = 0.1
                signals = []

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
            "if_raw":         round(float(raw), 6),
            "confidence":     confidence,
            "history_count":  diagnostics.get("history_count", 0) if isinstance(diagnostics, dict) else 0,
            "cold_start":     diagnostics.get("cold_start", True) if isinstance(diagnostics, dict) else True,
            "signals":        signals,
            "features":       features_dict,
            "model_version":  MODEL_VERSION,
        }

    def score_with_history(
        self,
        txn: dict,
        history: list,
        device_familiarity: float | None = None,
        location_familiarity: float | None = None,
    ) -> dict:
        """
        Phase 4 — history-aware scoring.

        Uses persisted history to compute baselines, then 31-feature vector,
        then scaler/IF, then 0–100 conversion (direction verified: anomalous→high).

        Returns same enriched dict as score() but with real history_count/cold_start.
        """
        self.load()
        uid = txn.get("user_id", txn.get("phone", ""))
        resolved = _resolve_profile_id(uid)
        user_found = resolved in self.profiles or uid in self.profiles or str(uid).strip() in PHONE_TO_PROFILE
        profile = self.profiles.get(resolved)
        if profile is None:
            profile = self.profiles.get(uid, None)

        from .features import generate_feature_vector, compute_baseline_from_history

        # Compute baseline from history
        baseline = compute_baseline_from_history(history, profile)
        history_count = baseline["history_count"]
        cold_start = baseline["cold_start"]

        # Generate vector
        try:
            vec, features_dict, diagnostics = generate_feature_vector(
                txn, history, profile, baseline,
                device_familiarity=device_familiarity,
                location_familiarity=location_familiarity,
            )
        except Exception as e:
            log.warning("Feature generation failed: %s", e)
            raise

        # Validate feature count vs scaler
        n_feat = getattr(self.scaler, "n_features_in_", 31)
        if vec.shape[1] != n_feat:
            raise ValueError(f"Feature vector dim {vec.shape[1]} != scaler expects {n_feat} — retrain required")

        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            X_scaled = self.scaler.transform(vec)
        raw = float(self.model.decision_function(X_scaled)[0])
        lo, hi = self.score_lo, self.score_hi
        # Direction check: hi - raw => more anomalous (lower raw) => higher risk
        risk = 100.0 * (hi - raw) / max(hi - lo, 1e-9)
        behavior_score = int(round(float(np.clip(risk, 0, 100))))

        # Confidence based on history, profile, cold_start
        # features_completeness: rough proxy — count of features that are not default fallback
        # We consider completeness high if history_count >=5 and profile exists
        completeness = 0.95 if history_count >= 5 and profile else (0.6 if profile else 0.4)
        confidence = self._compute_confidence(history_count, user_found, cold_start, completeness, bool(profile))
        signals = self._build_explanations(features_dict, diagnostics, history_count, cold_start)

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
            "history_count":  history_count,
            "cold_start":     cold_start,
            "confidence":     confidence,
            "signals":        signals,
            "features":       features_dict,
            "diagnostics":     diagnostics,
            "if_raw":         round(raw, 6),
            "model_version":  MODEL_VERSION,
        }
