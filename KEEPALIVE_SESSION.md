# Keep-Alive + Self-Repair Session (PrepHire port)

Date: 2026-09-24. Goal: before deploying IronWallet to Render, port the
"always on / auto recheck" pattern from `PrepHire-AI-main.zip` into our app.

## What PrepHire actually had (verified, not assumed)

Extracted the zip to temp and searched it. There is NO magic no-sleep code.
The "always on" pieces are two ordinary things:

1. `render.yaml` → `healthCheckPath: /api/health` (+ an `/api/health` endpoint
   in `server/index.js:227`). Note: on Render free tier this only guards
   zero-downtime deploys — it does NOT prevent spin-down from idleness.
2. `server/cleanupService.js` → a `node-cron` scheduled job
   (`initCleanup`, daily `0 0 * * *`) that deletes expired videos/DB rows.
   An in-process cron does NOT count as inbound traffic either.

What actually keeps a Render free service awake is INBOUND traffic to its
public URL (paid plan, external pinger, or the app pinging its own public
URL through Render's proxy). The implementation below is built on that fact.

## What was added to IronWallet

- `render.yaml` (new): Blueprint with `healthCheckPath: /health`,
  build `pip install -r requirements.txt`, start
  `uvicorn otp_server:app --host 0.0.0.0 --port $PORT`, plus env defaults
  (`CORS_ORIGINS`, `KEEPALIVE_*`, `REPAIR_*`) and `sync: false` secrets
  (Twilio x3, `GEMINI_API_KEY`).
- `iron_store.py`: new `run_maintenance()` — marks expired unconfirmed
  preparations (`PENDING`/`PREPARED`, past `expires_at`) as
  `FAILED`/`EXPIRED`, sweeps expired `sessions`. Never touches balances or
  confirmed transactions. Confirm-time logic still rejects swept rows as
  "expired preparation" (verified by test).
- `iron_store.py` (bug fix found by the new test):
  `confirm_transaction_atomic` expired path committed but never closed its
  SQLite connection (leak). Now closes before returning.
- `otp_server.py`:
  - `_keepalive_loop` (every `KEEPALIVE_INTERVAL_S`, default 600s < Render's
    ~15min idle timeout): GETs `_keepalive_target()` = `KEEPALIVE_URL`, else
    `RENDER_EXTERNAL_URL` (auto-provided by Render — this is the ping that
    counts), else localhost (dev only, harmless). Stdlib `urllib`, off-loop
    via `asyncio.to_thread`, best-effort, never raises.
  - `_repair_loop` (every `REPAIR_INTERVAL_S`, default 3600s): runs
    `run_maintenance()`, logs only when something was swept.
  - `startup` handler changed `def` → `async def` so `asyncio.create_task`
    runs on the real server loop (a sync handler would attach tasks to the
    wrong loop). Both loops gated by `KEEPALIVE_ENABLED` / `REPAIR_ENABLED`.
  - `GET /health` now includes `self_check`
    (`last_ping_at/ok`, `last_repair_at`, last summary).
- `tests/test_keepalive.py` (new, 4 tests): stale prep expired + still
  unpayable, session sweep spares live sessions, confirmed tx untouched,
  `/health` exposes `self_check` + target-URL precedence.

## Verification (all green)

- `tests.test_keepalive` + `tests.test_payment_authority`: 11/11 OK.
- `test_phase15.py`: 132/132 passed.
- Live boot (`uvicorn :8123`): startup logs show both loops scheduled,
  `GET /health` 200 with `self_check` present.

## Env knobs

`KEEPALIVE_ENABLED` (true), `KEEPALIVE_INTERVAL_S` (600), `KEEPALIVE_URL`
(override; default `RENDER_EXTERNAL_URL` → localhost), `REPAIR_ENABLED`
(true), `REPAIR_INTERVAL_S` (3600).

## Still pending (continue later)

1. `data/iron.db` got dirtied by test runs (bench phones/transactions) —
   restore committed seed (`git checkout -- data/iron.db`) before committing.
2. Commit + push: `render.yaml`, `iron_store.py`, `otp_server.py`,
   `tests/test_keepalive.py` (+ this file if wanted).
3. Deploy: Dashboard → New → Blueprint (uses `render.yaml`) or manual Web
   Service; first request will be slow (65MB model load); free disk is
   ephemeral so DB resets on redeploy regardless.
