"""
risk_engine/engine.py — Unified Risk Engine (Phase 6)
One authoritative backend calculation combining behaviour, fraud, recipient, context.

Transparency: weights centralized, evidence-aware, deduplicated, no BLOCK.
"""
from __future__ import annotations
import math
import time
from typing import Dict, Any, List, Optional, Tuple
from .thresholds import RISK_WEIGHTS, iron_tier, risk_level, RISK_ENGINE_VERSION, RISK_TIRESHOLDS
try:
    from .attack import classify_attack, ATTACK_CLASSIFIER_VERSION
except ImportError:
    ATTACK_CLASSIFIER_VERSION = "v1"
    def classify_attack(signals=None):
        return {"attack_type": "NONE", "attack_category": "NONE", "attack_confidence": 0.0,
                "signal_ids": [], "description": "", "scores": {}, "version": "v1"}
try:
    from .account_takeover import detect_account_takeover, ACCOUNT_TAKEOVER_VERSION
except ImportError:
    ACCOUNT_TAKEOVER_VERSION = "v1"
    def detect_account_takeover(signals=None):
        return {"account_threat_detected": False, "account_threat_confidence": 0.0,
                "signal_ids": [], "explanation": "", "dimensions": {},
                "dimension_count": 0, "version": "v1"}
try:
    from .scam_network import detect_scam_network, SCAM_NETWORK_VERSION
except ImportError:
    SCAM_NETWORK_VERSION = "v1"
    def detect_scam_network(*a, **kw):
        return {"network_threat_detected": False, "network_confidence": 0.0,
                "network_type": "NONE", "signal_ids": [], "explanation": "",
                "evidence": {}, "description": "", "version": "v1"}
try:
    from .binary import is_fraudulent, classify_binary
except ImportError:
    def is_fraudulent(*a, **kw): return False
    def classify_binary(*a, **kw): return "LEGITIMATE"

def _clamp_score(s: float) -> int:
    return int(round(max(0, min(100, float(s)))))

def _dedup_signals(signals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Evidence-aware deduplication — groups correlated signals that share same underlying evidence.
    Keeps highest severity/score per group. Prevents double-counting (Phase 4).
    """
    # Comprehensive groups: same underlying anomaly, different engines
    groups = {
        "velocity": {"HIGH_VELOCITY_5M", "rapid_velocity_5m", "high_velocity_1h", "velocity_1h", "velocity_24h", "RECIPIENT_SWITCHING", "amount_escalation_burst", "SEQUENTIAL_AMOUNTS", "high_velocity_1h", "HIGH_VELOCITY_1H"},
        "amount": {"amount_deviation", "sudden_behaviour_change", "unusual_amount_spike", "recipient_amount_anomaly", "EXTREME_AMOUNT", "HIGH_AMOUNT", "BALANCE_DRAIN_HIGH", "BALANCE_DRAIN_CRITICAL", "balance_impact", "HIGH_VALUE_TRANSACTION"},
        "device": {"unfamiliar_device", "NEW_DEVICE", "unfamiliar_device_ctx"},
        "location": {"unfamiliar_location", "LOCATION_ANOMALY", "unfamiliar_location_ctx"},
        "recipient_report": {"recipient_reported", "REPORTED_RECIPIENT", "recipient_high_report_count", "HIGH_RISK_RECIPIENT", "recipient_high_reports", "REPORTED_RECIPIENT_HIGH"},
        # These IDs are emitted by different layers for the same personal
        # recipient-novelty fact. Keep one strongest signal, not four copies.
        "recipient_novelty": {"NEW_RECIPIENT", "recipient_new", "unfamiliar_recipient", "recipient_novelty", "new_recipient"},
        # Recipient familiarity and reports remain separate evidence.
        # scam language types are distinct — keep separate
    }
    id_to_group: Dict[str, str] = {}
    for g, ids in groups.items():
        for i in ids:
            id_to_group[i] = g

    grouped: Dict[str, Dict[str, Any]] = {}
    order = {"LOW":0,"MEDIUM":1,"HIGH":2,"CRITICAL":3}
    for sig in signals:
        sid = str(sig.get("id", ""))
        gid = id_to_group.get(sid, sid)
        if gid not in grouped:
            grouped[gid] = sig
        else:
            existing = grouped[gid]
            # Keep higher severity, then higher score
            if order.get(str(sig.get("severity","MEDIUM")).upper(),1) > order.get(str(existing.get("severity","MEDIUM")).upper(),1):
                grouped[gid] = sig
            elif float(sig.get("score",0)) > float(existing.get("score",0)):
                grouped[gid] = sig
    deduped = list(grouped.values())
    deduped.sort(key=lambda x: (-float(x.get("score",0)), x.get("id","")))
    return deduped

def _evidence_aware_weighted_score(
    components: Dict[str, Dict[str, Any]],
    weights: Dict[str, float] = RISK_WEIGHTS,
) -> Tuple[int, Dict[str, float], float]:
    """
    6D — Evidence-aware scoring.
    Each component score is weighted by base weight adjusted for confidence.
    High score + low confidence contributes less than high score + high confidence.

    Formula:
      effective_weight_i = base_weight_i * (0.6 + 0.4*confidence_i)  # 0.6–1.0
      final = sum(score_i * effective_weight_i) / sum(effective_weight_i)

    Keeps explainable, not complex. Documented weights remain baseline.
    """
    total_effective = 0.0
    weighted_sum = 0.0
    effective_weights: Dict[str, float] = {}
    for key, w in weights.items():
        comp = components.get(key, {})
        score = float(comp.get("score", comp.get("behavior_score", comp.get("fraud_score", 0)) or 0))
        # Normalize score 0–100
        score = max(0, min(100, score))
        conf = comp.get("confidence", 0.5)
        # Normalize confidence 0–1 (handle 0–100 scale)
        if isinstance(conf, (int,float)) and conf > 1:
            conf = conf / 100.0
        conf = max(0.05, min(0.99, float(conf)))
        eff_w = float(w) * (0.6 + 0.4 * conf)  # 0.6–1.0
        effective_weights[key] = eff_w
        weighted_sum += score * eff_w
        total_effective += eff_w

    if total_effective == 0:
        return 0, effective_weights, 0.5

    final = weighted_sum / total_effective
    # Clamp 0–100 pre-boost
    final_int = _clamp_score(final)
    # Overall confidence: weighted average of component confidences by base weight
    total_conf = 0.0
    total_w = 0.0
    for k, w in weights.items():
        comp = components.get(k, {})
        c = comp.get("confidence", 0.5)
        if isinstance(c, (int,float)) and c > 1:
            c = c/100.0
        c = max(0, min(1, float(c)))
        total_conf += float(c) * float(w)
        total_w += float(w)
    overall_conf = round(float(total_conf / total_w) if total_w else 0.5, 2)
    return final_int, effective_weights, overall_conf

class RiskEngine:
    """
    Singleton authoritative Risk Engine. Call `assess(...)`.
    """
    _instance = None
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def assess(
        self,
        behavior: Dict[str, Any],
        fraud_intelligence: Dict[str, Any],
        recipient: Dict[str, Any],
        context: Dict[str, Any] | None = None,
        transaction: Dict[str, Any] | None = None,
        network_context: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        """
        Main entry. Inputs as per 6B spec. Returns authoritative decision.

        Expected components shape:
          behavior: {"score":81, "confidence":0.87, "signals":[]}
          fraud_intelligence: {"score":78, "confidence":0.94, "signals":[]}
          recipient: {"score":70, "confidence":0.91, "signals":[], "risk_score":...}  # score alias risk_score
          context: {"score":55, "confidence":0.7, "signals":[], "device":{}, "location":{}, "velocity":{}}
        Phase 18: optional network_context built by caller from existing
        recipient/scam-registry/transaction data (recipient, report_count,
        reporter_count, reasons, user_tx_count, handle, attack_type).
        Score/tier/OTP logic unchanged.
        """
        context = context or {}
        # Normalize scores to 0–100 ints and confidence 0–1
        def norm_comp(comp: Dict[str, Any], fallback_score=0) -> Dict[str, Any]:
            if not comp:
                return {"score": 0, "confidence": 0.5, "signals": []}
            # Allow various key names
            s = comp.get("score", comp.get("risk_score", comp.get("behavior_score", comp.get("fraud_score", fallback_score))))
            try:
                s = float(s)
            except Exception:
                s = fallback_score
            c = comp.get("confidence", 0.5)
            try:
                c = float(c)
                if c > 1:
                    c = c/100.0
            except Exception:
                c = 0.5
            c = max(0.05, min(0.99, c))
            sigs = comp.get("signals", []) or []
            # Ensure signals are list of dicts
            normalized_sigs: List[Dict[str, Any]] = []
            for sg in sigs:
                if isinstance(sg, dict) and "id" in sg:
                    normalized_sigs.append(sg)
                elif isinstance(sg, dict) and "feature" in sg:
                    # Behavioural ML signals have feature not id — map
                    normalized_sigs.append({
                        "id": sg.get("feature", "unknown"),
                        "category": "BEHAVIOURAL",
                        "severity": str(sg.get("severity","MEDIUM")).upper(),
                        "score": 12 if sg.get("severity")=="high" else 8,
                        "evidence": sg,
                        "description": sg.get("description",""),
                        "source": "behavioral_ml",
                    })
                elif isinstance(sg, str):
                    normalized_sigs.append({
                        "id": sg,
                        "category": "UNKNOWN",
                        "severity": "MEDIUM",
                        "score": 8,
                        "evidence": {},
                        "description": sg,
                        "source": "unknown",
                    })
            return {"score": _clamp_score(s), "confidence": c, "signals": normalized_sigs, "_raw": comp}

        b = norm_comp(behavior, 0)
        f = norm_comp(fraud_intelligence, 0)
        r = norm_comp(recipient, 0)
        # Context may have score or derive from device/location/velocity
        # If context has no explicit score, compute from signals or device familiarity
        if not context or "score" not in context:
            # Derive context score from velocity/device signals if present
            ctx_score = 0
            ctx_conf = 0.6
            ctx_sigs: List[Dict[str, Any]] = []
            # Try to extract from passed context dict or from fraud signals that are context-like
            # Look at context dict keys
            if context:
                ctx_sigs = context.get("signals", []) or []
                # If context has device/location familiarity low, score high
                dev = context.get("device_familiarity", context.get("device", {}).get("familiarity") if isinstance(context.get("device"), dict) else None)
                loc = context.get("location_familiarity", context.get("location", {}).get("familiarity") if isinstance(context.get("location"), dict) else None)
                # Simple heuristic
                tmp = 0
                if dev is not None and float(dev) < 0.5:
                    tmp = max(tmp, 60)
                if loc is not None and float(loc) < 0.5:
                    tmp = max(tmp, 55)
                ctx_score = tmp
                ctx_conf = float(context.get("confidence", 0.6))
            c = {"score": _clamp_score(ctx_score) if ctx_score else 0, "confidence": ctx_conf, "signals": ctx_sigs, "_raw": context}
        else:
            c = norm_comp(context, 0)

        components_for_scoring = {
            "behavior": {"score": b["score"], "confidence": b["confidence"], "signals": b["signals"]},
            "fraud": {"score": f["score"], "confidence": f["confidence"], "signals": f["signals"]},
            "recipient": {"score": r["score"], "confidence": r["confidence"], "signals": r["signals"]},
            "context": {"score": c["score"], "confidence": c["confidence"], "signals": c["signals"]},
        }

        # Aggregate signals before dedup
        all_signals: List[Dict[str, Any]] = []
        for comp in [b, f, r, c]:
            all_signals.extend(comp.get("signals", []))

        deduped = _dedup_signals(all_signals)

        # Compute final score evidence-aware (weighted, then boost/dampen based on deduped evidence)
        final_score, effective_weights, overall_confidence = _evidence_aware_weighted_score(components_for_scoring, RISK_WEIGHTS)

        # Evidence-aware boost/dampen using deduped signals (Phase 4)
        # Single weak anomaly -> usually SAFE; multiple independent strong -> HIGH_RISK
        sig_count = len(deduped)
        categories = set(s.get("category","") for s in deduped)
        has_critical = any(str(s.get("severity","")).upper()=="CRITICAL" for s in deduped)
        has_high = any(str(s.get("severity","")).upper()=="HIGH" for s in deduped)
        max_sig_score = max((float(s.get("score",0)) for s in deduped), default=0)
        high_comps = sum(1 for comp in components_for_scoring.values() if float(comp.get("score",0)) >=70)
        very_high = any(float(comp.get("score",0)) >=85 for comp in components_for_scoring.values())
        # Dampen single weak signal only (multiple weak should still be considered)
        if sig_count == 1 and not has_critical and not has_high and max_sig_score < 15:
            final_score = _clamp_score(final_score * 0.88 - 3)
        # Boost for multiple independent strong signals — capped 8 to avoid over-classifying CAUTION
        boost = 0
        if sig_count >= 3 and len(categories) >= 2 and (has_critical or has_high):
            boost += 4
        if len(categories) >= 3 and has_high:
            boost += 3
        if has_critical and sig_count >= 2:
            boost += 4
        if high_comps >= 2 and sig_count >= 3:
            boost += 5
        elif very_high and sig_count >= 3:
            boost += 3
        boost = min(boost, 8)
        if boost:
            final_score = _clamp_score(final_score + boost)
        # Floor for strong single fraud indicator (need at least 2 signals to push to CAUTION to avoid single weak)
        max_comp = max(float(comp.get("score",0)) for comp in components_for_scoring.values())
        if max_comp >= 85 and sig_count >= 2:
            final_score = max(final_score, 70)
        if max_comp >= 90 and sig_count >= 2:
            final_score = max(final_score, 75)

        # Clamp and tier (6F)
        final_score = _clamp_score(final_score)
        tier = iron_tier(final_score)

        # Verification requirement (6G)
        if tier == "HIGH_RISK":
            requires_otp = True
        elif tier == "CAUTION":
            has_critical = any(s.get("severity")=="CRITICAL" for s in deduped)
            requires_otp = bool(has_critical and overall_confidence > 0.75)
        else:
            requires_otp = False

        # Binary fraud decision (separate from tier) — conceptually:
        # Transaction -> Behaviour + Fraud + Recipient + Context -> Unified Fraud Assessment -> BINARY -> Tier
        try:
            binary_label = classify_binary(b, f, r, c)
            is_fraud = binary_label == "FRAUDULENT"
        except Exception:
            # Fallback to tier-based binary
            is_fraud = tier in ("CAUTION", "HIGH_RISK")
            binary_label = "FRAUDULENT" if is_fraud else "LEGITIMATE"

        # Build signals with contribution
        # Contribution = effective_weight * score / total_effective * scaling to show impact
        # For explainability, compute per-signal contribution proportional to signal score within component
        signals_with_contrib: List[Dict[str, Any]] = []
        # Compute per-component total signal score for weighting
        for sig in deduped:
            # Find which component it came from to attribute contribution
            # Approximate contribution as signal score / sum signals in component * component effective weight * (final/100)
            # Simpler: contribution = signal score * (effective_weights[comp]/100)  scaled
            # We'll attribute to source component if possible
            src = sig.get("source", "unknown")
            # Map source to component
            comp_key = "fraud"
            if src in ("behavioral_ml", "iforest"):
                comp_key = "behavior"
            elif src in ("scam_registry", "recipient_intelligence"):
                comp_key = "recipient"
            elif src in ("device_engine", "location_engine", "velocity_engine"):
                comp_key = "context"
            # If category is BEHAVIOURAL but source behavioral_ml, keep behavior
            eff_w = effective_weights.get(comp_key, 0.25)
            # Contribution scaled to final score proportion
            contrib = round(float(sig.get("score", 8)) * eff_w * (final_score / 100.0) * 1.2, 1)
            # Clamp contrib not exceed signal score
            contrib = min(float(sig.get("score", 8)), contrib)
            sig_out = dict(sig)
            sig_out["contribution"] = round(contrib, 1)
            signals_with_contrib.append(sig_out)

        # Sort by contribution desc for prioritization
        signals_with_contrib.sort(key=lambda x: (-x.get("contribution",0), x.get("severity","MEDIUM")))

        # Build components breakdown for response (6I)
        components = {
            "behavior": b["score"],
            "fraud_intelligence": f["score"],
            "recipient": r["score"],
            "context": c["score"],
        }

        # Overall confidence refinement: if cold_start or low history, lower confidence
        # Check if behavior cold_start true
        raw_behavior = b["_raw"]
        if isinstance(raw_behavior, dict) and raw_behavior.get("cold_start"):
            overall_confidence = round(max(0.25, overall_confidence * 0.85), 2)
        # If many signals but single category, lower confidence slightly
        if len(deduped) == 1 and overall_confidence > 0.7:
            overall_confidence = round(overall_confidence - 0.08, 2)

        # Audit fields
        audit = {
            "risk_engine_version": RISK_ENGINE_VERSION,
            "weights": RISK_WEIGHTS,
            "effective_weights": {k: round(v,3) for k,v in effective_weights.items()},
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "component_confidences": {k: v["confidence"] for k,v in components_for_scoring.items()},
        }

        # ── Phase 16: Attack Intelligence (classification over deduped signals) ──
        # Reuses existing signals only; advisory, never affects score/tier/blocking.
        try:
            attack = classify_attack(signals_with_contrib)
        except Exception:
            attack = {"attack_type": "NONE", "attack_category": "NONE", "attack_confidence": 0.0,
                      "signal_ids": [], "description": "", "scores": {}, "version": ATTACK_CLASSIFIER_VERSION}

        # ── Phase 17: Account Takeover Intelligence (combinations only) ──
        # Reuses the same deduped signals; advisory, never affects score/tier/OTP.
        try:
            takeover = detect_account_takeover(signals_with_contrib)
        except Exception:
            takeover = {"account_threat_detected": False, "account_threat_confidence": 0.0,
                        "signal_ids": [], "explanation": "", "dimensions": {},
                        "dimension_count": 0, "version": ACCOUNT_TAKEOVER_VERSION}

        # ── Phase 18: Scam Network & Campaign Intelligence (existing data only) ──
        # Advisory, never affects score/tier/OTP/blocking. Distinguishes
        # recipient reputation (single report) from corroborated networks.
        try:
            r_raw = r.get("_raw", {}) if isinstance(r.get("_raw"), dict) else {}
            _net_ctx = dict(network_context or {})
            # Fill gaps from already-available recipient/transaction data.
            if "report_count" not in _net_ctx:
                _net_ctx["report_count"] = r_raw.get("report_count", 0)
            if "recipient" not in _net_ctx and transaction:
                _net_ctx["recipient"] = transaction.get("merchant_name") or transaction.get("recipient") or ""
            if "attack_type" not in _net_ctx:
                _net_ctx["attack_type"] = attack.get("attack_type", "NONE")
            network = detect_scam_network(
                signals=signals_with_contrib,
                recipient_profile=r_raw,
                attack=attack,
                transaction=transaction or {},
                network_context=_net_ctx,
            )
        except Exception:
            network = {"network_threat_detected": False, "network_confidence": 0.0,
                       "network_type": "NONE", "signal_ids": [], "explanation": "",
                       "evidence": {}, "description": "", "version": SCAM_NETWORK_VERSION}

        return {
            "score": final_score,
            "tier": tier,
            "confidence": round(float(overall_confidence), 2),
            "signals": signals_with_contrib,
            "requires_otp": bool(requires_otp),
            "explanation": "",  # filled by explanation layer (7A)
            "components": components,
            "audit": audit,
            "_deduped_count": len(deduped),
            "_all_signals_count": len(all_signals),
            "binary_fraud": bool(is_fraud),
            "fraud_label": binary_label,
            "is_fraudulent": bool(is_fraud),
            "attack_type": attack.get("attack_type", "NONE"),
            "attack_category": attack.get("attack_category", "NONE"),
            "attack_confidence": attack.get("attack_confidence", 0.0),
            "attack_detail": attack,
            "account_threat_detected": bool(takeover.get("account_threat_detected", False)),
            "account_threat_confidence": float(takeover.get("account_threat_confidence", 0.0)),
            "account_threat_signal_ids": list(takeover.get("signal_ids", [])),
            "account_takeover_detail": takeover,
            "network_threat_detected": bool(network.get("network_threat_detected", False)),
            "network_confidence": float(network.get("network_confidence", 0.0)),
            "network_type": str(network.get("network_type", "NONE")),
            "network_signal_ids": list(network.get("signal_ids", [])),
            "network_detail": network,
        }

def get_risk_engine() -> RiskEngine:
    return RiskEngine()
