# Diagnosis — Why 45% Accuracy (130/289)

**Date:** 2026-09-11
**Benchmark:** 300 cases (289 tier) seed 42, `benchmark_300_cases.json:1`, `run_benchmark_300.py:1`

## Overall
- Exact 3-class accuracy 45.0% (130/289), macro F1 45.0, weighted 42.3
- SAFE recall 22.4% (28/125) — 97 SAFE misclassified as CAUTION/HIGH_RISK
- Binary FPR 77.6% (97/125 normal flagged suspicious)
- Top failures: VELOCITY 0/20 0%, CONFLICTING 1/30 3.3%, NORMAL 4/30 13.3%, TIME 4/20 20%

## Root Cause 1 — History Pollution & Unrealistic Baseline
- Single bench phone `9000000099` reused for all 300 cases, history accumulates across runs (diagnose_normal.py: 16 tx, 12 in 1h, 4 in 5m). Normal case `500 SAFE` predicted `CAUTION 70` due to velocity `HIGH_VELOCITY_5M` 19.2 + `velocity_1h` 12 + `high_velocity_1h` 10.
- `ml_pipeline/features.py:389` computes `v1h = sum(history_epochs <3600)+1` — correct, but history is polluted.
- `COLD_START_THRESHOLD =5` `features.py:83` — bench had 16, not cold, but velocity still high.
- Benchmark NORMAL expected SAFE but engine saw 4 in 5m (rapid) — mismatch: expected based on scenario (no velocity) but actual history had velocity.
- Fix: Need isolated per-user histories, 10–30 realistic legitimate txs per synthetic user, with realistic time distribution (not all recent).

## Root Cause 2 — Velocity Double-Counting
- Signals for same underlying velocity appear 4×: `HIGH_VELOCITY_5M` (fraud_rules), `velocity_1h` (behaviour), `velocity_24h`, `high_velocity_1h` (velocity_engine). `risk_engine/engine.py:16` dedup groups only `velocity_5m_group` (2 ids), not all. Boost logic `engine.py:144` adds +5 for ≥3 signals, +5 for ≥3 categories, +7 for ≥2 comps ≥70 → pushes 60→70.
- Example normal: 4 velocity signals → sig_count 4 → boost +5 → 65→70 CAUTION.
- Fix: Stronger dedup for velocity (all velocity ids → one group), and for amount (zscore + vs_avg + vs_med + percentile all same amount anomaly).

## Root Cause 3 — Single Weak Anomaly Over-weighted
- New recipient alone with small amount 500: expected CAUTION per spec, but engine gives SAFE 43 (correct per evidence-aware) → benchmark expected wrong? Actually our benchmark expected CAUTION for new recipient single signal, but engine correctly gives SAFE (single weak). This is not a bug but benchmark label question. However many legitimate cases (single new recipient tiny amount) were expected SAFE but engine gave CAUTION? Wait diagnosis shows normal 13.3% accuracy: normal cases expected SAFE but engine gave CAUTION due to velocity, not new recipient.
- Need evidence-aware: single weak anomaly → SAFE or low CAUTION, not HIGH_RISK. Currently weights 0.35/0.40/0.15/0.10 + boost pushes single weak to CAUTION.
- Fix: Dampen single weak signals: if only 1-2 signals and no strong fraud (reported, scam language, large amount), keep SAFE.

## Root Cause 4 — Feature Engineering: recipient_frequency_score Always 0
- `base_features` in benchmark sets `recipient_frequency_score: 0.0` even for known recipient 9158763151, but `features.py:372` recomputes from history if history_count≥2, otherwise uses provided 0. So for bench phone with 5 history, it recomputes correctly (0.9375 for frequent). But for many benchmark cases with phone VELOCITY_BURST_5 etc, history is empty or polluted, so frequency is wrong.
- Also `amount_zscore` uses `std` from history: for bench, std 202, amount 500 → z 0.76, not anomalous, but behaviour still 89 due to velocity, not amount.

## Root Cause 5 — Weights Not Calibrated
- Current `RISK_WEIGHTS = 0.35/0.40/0.15/0.10` `risk_engine/thresholds.py:45` — behaviour 35% high when velocity polluted, fraud 40% includes velocity duplicate. Need to test 0.30/0.35/0.20/0.15 etc and document.

## Root Cause 6 — Thresholds Fixed
- 0–69 SAFE etc `thresholds.py:8` — with current score distribution (many 40-60), a boost of +5 pushes 65→70 CAUTION, causing false positives. Need calibration after fixing history.

## Immediate Fixes Needed
1. Benchmark: isolated per-case user with 10–30 realistic history, not shared.
2. Features: ensure amount relative stats correctly, recipient familiarity from history, velocity from history not polluted.
3. Dedup: broader velocity and amount groups.
4. Engine: evidence-aware dampening for single weak, stronger for independent multiple, avoid double-count.
5. Weights: test 3-4 configs, pick explainable.
6. Thresholds: keep 69/70/84/85 after fixing, validate on dev set.
