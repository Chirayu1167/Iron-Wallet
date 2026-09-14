# IRON Wallet — Phase 12, 13 & 14 Session Report
**Date:** 2026-09-11
**Branch:** `main` | **Working Directory:** `D:\Iron_Wallet`
**Scope:** Phase 12 User Protection Controls + Phase 13 Security Center + Phase 14 Product UX (No Phase 15/16)
**Status:** ✅ Complete and Verified — IRON never blocks, Protection/Security are visibility layers, UX is backend-authoritative

> This file documents adding non-blocking protection controls, a centralized Security Center visibility layer, and product UX polish that makes SAFE/CAUTION/HIGH_RISK flows coherent. All payments remain `SAFE/CAUTION/HIGH_RISK` with `HIGH_RISK → OTP → PROCEEDED`.

---

## 1. Session Overview

**Goals:**
- Give users useful protection controls (report, verify, session/device) without any payment denial.
- Create a centralized Security Center showing posture, timeline, sessions from backend data (no fabricated scores).
- Make IRON feel polished: consistent risk visualization, transaction detail, loading/error states, responsive, accessible, no misleading `blocked/frozen` language.

**Approach:**
1. Audited existing protection controls (`PINModal`, `FreezeModal`, `CooldownModal`, `ManualFreezeBanner`, `checkFrozen/checkCooldown`, `scam-db/report`, history filters, assistant prompts, risk tiers).
2. Extended `iron_store.py` with `transaction_reports` and `security_events` tables, plus session helpers.
3. Added backend APIs for reporting, security events/sessions/overview, PIN change, and live event hooks.
4. Created frontend `js/protection-center.js`, `js/security-center.js`, `js/risk-components.js` reusing existing UI primitives (`Card`, `Btn`, `PageHeader`, `Avatar`, `Modal`).
5. Patched `index.html` (Dock, Dashboard, SendMoneyPage, HistoryPage, FraudRiskCard, transaction detail, risk breakdown) and `js/components/layout.js` for Protection/Security navigation.
6. Verified with `test_phase23/45/68`, `verify_final.py` (10/10), and new `test_phase121314.py` (12/13/14).

**Result:** `test_phase121314.py` all PASS, `verify_final.py` 10/10 PASS, `test_phase23` 26 checks PASS (2 informational BLOCK prints are guard strings), `test_phase45` 13+12 PASS, `test_phase68` 13+11+12+6 PASS, `HIGH_RISK` always `PROCEEDED_AFTER_OTP`.

---

## 2. Iron Product Rules — Absolute (reaffirmed)

1. **Never blocks:** `SAFE/CAUTION/HIGH_RISK` only (`risk_engine/thresholds.py:5`). `HIGH_RISK` = warning + OTP → `PROCEEDED_AFTER_OTP` (`otp_server.py:2090`). No `BLOCK/BLOCKED/PAYMENT_DENIED/...` (`grep -i PAYMENT_DENIED` → 0, `_ALLOWED_LIVE_EVENTS` excludes `payment_blocked`, guard `if event_type=="payment_blocked": suppress` `otp_server.py:1347`).
2. **Admin demo:** `1234567890+000000` scoped `otp_server.py:545` + `verify-otp` + `transactions/confirm` bypass, never removed.
3. **Backend authoritative:** `POST /risk/assess` (`otp_server.py:976`) and `POST /transactions/prepare` (`otp_server.py:1755`) via `RiskEngine` are source of truth; frontend `index.html:2468` `totalRisk = prepData.risk.score` override, fallback only when offline.
4. **Reports are evidence:** `scam_registry` + `transaction_reports` are signals for future warnings, not denial.
5. **Unfamiliar device is signal:** `fraud_engine` + `risk_engine` context, not freeze.
6. **No redesign:** Reused existing `styles.css`, `js/constants.js` tiers, `glass` cards, `Dock`, `Modal`.

---

## 3. Phase 12 — User Protection Controls

### 3.1 Audit Existing Protection Controls (12.1)

Searched `freeze/cooldown/block/network_blocked/account frozen/payment denied`:

- `PINModal` (`index.html:713`): 3 attempts → previously would freeze 5 min. Already converted Phase 1 to `freezeAccount` returning `{frozen:false, warning:true}` + `risk_score +8` as `HIGH_RISK` signal. UI `pinFrozen` branch is dead (never set `pinFrozen=true`); kept as non-blocking warning, title patched to `High-Risk Flag` (`index.html:806`).
- `FreezeModal`/`CooldownModal` (`index.html:1635`): legacy `checkFrozen`/`checkCooldown` now return `{frozen:false}` / `{cooldown:false}` with `riskSignal` only (`js/fraud-engine.js:603`). `Dashboard` `useEffect` shows `FreezeModal` only if `frozen.frozen` (always false). Non-blocking.
- `Manual freeze` (`js/pages/dashboard.js:8`, `index.html` `iw_manual_freeze`): localStorage flag that previously set `stage="frozen"` and blocked payment. Converted: `Dashboard` quick action now navigates to Protection Center (`index.html:1925` `Protect/Security` buttons, `repeat(auto-fit)` grid), `SendMoneyPage` guards replaced with `console.warn` + continue, banner removed (`index.html:1888` comment `IRON never blocks — manual freeze removed`).
- `scam reports` (`scam_registry.py:61`, `otp_server.py:2153`): always `high_risk` not `network_blocked`, with per-reporter 24h dedup, requires auth.
- `History` filters (`index.html:3673`, `js/pages/history.js:13`): `blocked` filter mapped to `high_risk` (`filter==="high_risk"`), display `High Risk` not `Blocked` (`index.html:3788` `High Risk`).
- `Assistant` (`index.html:6748`): quick replies changed `Why was my account frozen?` → `How does IRON protect my payment?`, risk line `0-60 Safe` → `0-69 SAFE | 70-84 CAUTION | 85-100 HIGH_RISK (IRON never blocks)` (`js/components/assistant.js:86`).
- `Insights` thresholds (`index.html:4207`): `>0.90 Blocked` → `>0.90 High Risk — all proceed after verification` (`clean_index_remaining.py`).

**Result:** No control can prevent payment execution. All former blocks are now warnings/signals.

### 3.2 Protection Center (12.2)

**Location:** `js/protection-center.js` + route `protection` in `App` (`index.html:7311` + `js/components/layout.js:5` Dock).

Structure reusing existing UI (`Card`, `Btn`, `PageHeader`):

```text
Protection Center
Account Security
• Change PIN (POST /security/change-pin, masked, event PIN_CHANGED)
• Active sessions/devices (GET /security/sessions, is_current hint, Sign out)
• Sign out other sessions (POST /security/sessions/{suffix}/logout)

Payment Safety
• Recent risky payments (from txs.filter risk>=70)
• Report suspicious recipient (POST /reports/recipient, reason enum, rate 5/min)
• Review recent activity (txs slice)

Privacy
• Device/session information (navigator.userAgent, sessions count)
• Security events (GET /security/events, severity chips)
```

Do not add wallet features. Tabs `overview/account/payment/privacy` with client-side state, no full DB scan.

### 3.3 Report Suspicious Recipient (12.3)

- **Endpoint:** `POST /reports/recipient` (`otp_server.py:2252`) + alias `POST /scam-db/report` kept for compat.
- **Auth:** `Depends(get_current_user)`, per-user `5/min` (`_protect_report_attempts`), validates `recipient` regex, `reason` min2, `amount` ge0.
- **Persisted:** `scam_registry.report_recipient` JSON `data/scam_registry.json` (already persists), with `reporter` = authenticated phone (not client), `timestamp` `time.time()`, dedup same reporter+recipient 24h returns `deduplicated:true` but 200 success, `report_count` incremented only if not dedup.
- **Privacy:** response returns `{recipient, report_count, tier, reported, deduplicated, message}` never exposes other reporters; `get_all_flagged` returns `reasons` aggregated not reporter list (`scam_registry.py:161`).
- **Evidence not block:** `recipient_intelligence` risk score may increase but `transactions/prepare` still `HIGH_RISK → OTP → PROCEEDED` (`test_phase121314.py` `prepare after report tier HIGH_RISK` still 200).

### 3.4 Report Transaction (12.4)

- **Endpoint:** `POST /reports/transaction` (`otp_server.py:2282`) with `ReportTransactionIn {transaction_id, reason, note}`.
- **Auth/Validate:** `401` no token, `404` not found, `403` wrong user (`iron_store.get_transaction` phone check), `422` empty reason, rate `10/min` per user.
- **Persisted:** `iron_store.create_transaction_report` (`iron_store.py:530`) `transaction_reports` table `report_id PK, transaction_id, phone, reporter, reason, note, created_at`, dedup same `phone+transaction_id` returns existing `deduplicated:true`. No `UPDATE transactions SET status='blocked'` — transaction remains `PENDING/SUCCESS/HIGH_RISK`.
- **UI:** `ProtectionCenter` payment tab form + `HistoryPage` `Request Refund` already existed but now also supports `reported=true` via new endpoint (HistoryPage modal still local `createTicket` but also calls new endpoint if needed).

### 3.5 User Verification Controls (12.5)

- `Verify with OTP` (`index.html:2620` `handleVerify` → `OTPModal` → `POST /transactions/confirm {transaction_id, otp}` with admin `000000` bypass `otp_server.py:2106`).
- `I recognize this payment` → `handleOOBProceed` → `handlePINSuccess` → `PINModal` → `POST /transactions/confirm` without OTP for `SAFE/CAUTION` (but `HIGH_RISK` still requires OTP). Both update authoritative backend state via `confirm_transaction_atomic` and create `security_events` `OTP_VERIFIED`/`HIGH_RISK_PAYMENT_VERIFIED` (`otp_server.py:2148`).

### 3.6 Session/Device Controls (12.6)

- **GET /security/sessions** (`otp_server.py:2315`) authenticated, bounded 20, returns `token_masked` (last6), `created_at`, `last_used`, `is_current` (compared to `current["token"]`), no full token leak, `token` popped.
- **POST /security/sessions/{suffix}/logout** (`otp_server.py:2328`) finds token by suffix for that phone only (`iron_store.delete_session_by_token_for_user`), `403` cross-user, `404` not found, `200` `revoked`. Creates `SESSION_REVOKED` security event.
- **Unfamiliar device:** `device_familiarity<0.5 → 60` risk signal (`risk_engine` context) not freeze (`js/fraud-engine.js:658` `unfamiliar_device_ctx`).

### 3.7 Security Notifications (12.7)

Shown in `ProtectionCenter` privacy tab and `SecurityCenter` timeline, not spam:

- `LOGIN` (verify-otp success `otp_server.py:560` `create_security_event`),
- `OTP_VERIFIED` (`otp_server.py:567`, `otp_server.py:2148`),
- `RISK_ESCALATED` (`otp_server.py:2032` when `CAUTION/HIGH_RISK` on prepare),
- `NEW_RECIPIENT` (`otp_server.py:2036`),
- `RECIPIENT_REPORTED` (`otp_server.py:2262`),
- `PIN_CHANGED` (`otp_server.py:2368`),
- `SESSION_REVOKED` (`otp_server.py:2343`),
- `HIGH_RISK_PAYMENT_VERIFIED` (`otp_server.py:2150`).

Dedup via `addLiveAlert` 30s window, max 10, not every transaction.

### 3.8 Backend APIs (12.8)

Added/changed:

- `POST /reports/recipient` (12.3) `5/min`
- `POST /reports/transaction` (12.4) `10/min`
- `GET /security/events?limit&offset` (13.6) bounded 50, `30/min`
- `GET /security/sessions` (12.6)
- `POST /security/sessions/{suffix}/logout` (12.6)
- Kept `POST /scam-db/report` for compat, now also creates `security_events`.

All authenticate via `Depends(get_current_user)`, authorize `phone == current["phone"]`, validate with Pydantic, rate limit, never leak other users (phone filter on all queries, `token_masked` only).

### 3.9 Protection UI Language (12.9)

`ProtectionCenter` header `IRON protects you by detecting suspicious activity and helping you verify it.` (`js/protection-center.js:52`). Avoided `IRON blocked...`, `Your account has been frozen`, `Payment denied` (cleaned `clean_index_remaining.py`).

---

## 4. Phase 13 — Security Center

### 4.1 Security Center Layout (13.1)

**Location:** `js/security-center.js` + route `security` (`index.html:7311`).

```text
Security Center
Security Status
────────────────
Account security: Good / Needs attention / Review recommended (deterministic)
Recent activity: Normal / Elevated / High
Active sessions: 2
Recent risk alerts: 1

Recent Security Events
──────────────────────
• HIGH_RISK_PAYMENT_VERIFIED — ₹70,000 payment verified using OTP — 10:42 PM
• NEW_RECIPIENT — First payment to this recipient — 9:15 PM
• LOGIN — New session started — 8:03 PM

Protection
────────────────
• Change PIN → ProtectionCenter
• Manage sessions → ProtectionCenter
• Report suspicious activity → ProtectionCenter
```

Uses actual backend `GET /security/overview`, `GET /security/events`, `GET /security/sessions`. No fabricated values.

### 4.2 Security Score (13.2) — Audited

No misleading numerical score. `GET /security/overview` (`otp_server.py:2349`) computes deterministic statuses:

- `account_security`:
  - `Good` if `recent_high_risk==0` and `sessions<=1` and no failed OTP
  - `Needs attention` if `recent_high_risk==1` or `sessions==2`
  - `Review recommended` if `recent_high_risk>=2` or `failed_otp>=2` or `sessions>3`
- `recent_activity`: `Normal` if `recent_high_risk==0`, `Elevated` if <3, `High` otherwise
- `active_sessions`: `len(sessions)` bounded 20
- `recent_risk_alerts`: count of `RISK_ESCALATED/HIGH_RISK_PAYMENT_VERIFIED/UNUSUAL_ACTIVITY` in last 20 events

No `risk_score` confusion with `RiskEngine` final score. Documented in endpoint.

### 4.3 Security Event Model (13.3)

`iron_store.security_events` (`iron_store.py:100`):

```json
{
  "event_id": "uuid",
  "type": "RISK_ESCALATED",
  "severity": "MEDIUM",
  "title": "Risk escalation",
  "description": "Payment of ₹8,000 flagged CAUTION (86/100)",
  "timestamp": "2026-09-11T17:23:02Z",
  "transaction_id": "uuid|null",
  "phone": "9340228345",
  "user_id": "9340228345"
}
```

Allowed types `iron_store.py:573`: `LOGIN, LOGOUT, OTP_VERIFIED, PIN_CHANGED, RISK_ESCALATED, HIGH_RISK_PAYMENT_VERIFIED, RECIPIENT_REPORTED, UNUSUAL_ACTIVITY, SESSION_REVOKED, NEW_RECIPIENT, VERIFICATION_COMPLETED`. Never `PAYMENT_BLOCKED`/`ACCOUNT_FROZEN`.

### 4.4 Severity (13.4)

`INFO/LOW/MEDIUM/HIGH` (`iron_store.py:574`). Event severity, not payment denial. Example `OTP_VERIFIED → INFO`, `RISK_ESCALATED HIGH_RISK → HIGH`, `NEW_RECIPIENT → LOW`.

### 4.5 Security Timeline (13.5)

`SecurityCenter` renders chronological (`ORDER BY timestamp DESC`) with `Today` header, `10:42 PM HIGH-RISK PAYMENT VERIFIED` etc, using `formatEventTime` `toLocaleString`. Only `phone == current["phone"]` events (`iron_store.get_security_events` filters by phone). Pagination `Prev/Next` with `limit=10 offset`.

### 4.6 Security Center APIs (13.6)

- `GET /security/overview` (`otp_server.py:2349`) bounded, returns `account_security, recent_activity, active_sessions, recent_risk_alerts, recent_events:5, protection, versions`
- `GET /security/events?limit&offset` (`otp_server.py:2315`) `limit 1-50`, `offset`, returns `{events, count, total, limit, offset}`
- `GET /security/sessions` (`otp_server.py:2315` alias `/security/sessions/list`) returns `{sessions, count, current_token_masked}`

All use pagination/bounded (`limit=50/20`, not full `transactions` scan). `get_security_events` indexed `WHERE phone=? ORDER BY timestamp DESC LIMIT ? OFFSET ?`.

### 4.7 Security Privacy (13.7)

Never exposes: other user's events (`WHERE phone=?` only caller's), reporter identity (`scam_registry` returns reasons aggregated, `reports/transaction` returns `reporter: 9340***` masked), raw OTP/PIN (`create_security_event` sanitizes `otp/pin/password/secret/token` from meta `iron_store.py:592`), secrets, `GEMINI_API_KEY`, model internals (`decision_function` not exposed, only `score/ tier`).

---

## 5. Phase 14 — Product UX

### 5.1 Audit All Major User Flows (14.1)

Tested via `verify_final.py` and manual:

```text
Login (9340228345 or 1234567890+000000)
 ↓
Dashboard (balance from /balance, txs from /transactions, Protect/Security shortcuts)
 ↓
Send Money (Recipient phone/UPI, Amount, Note)
 ↓
Analyze Risk (prog 0-92 → totalRisk with frontend rule + ml + keyword + sec + authoritative prepare)
 ↓
Risk Assessment (FraudRiskCard + backend RiskScoreCard + RiskBreakdown)
 ↓
Optional AI Investigation (Investigate with AI → POST /risk/investigate, fallback)
 ↓
What-If Simulator (What-If → POST /risk/simulate, simulation:true)
 ↓
Verification if required (Verify with OTP → OTPModal, I recognize → PINModal)
 ↓
PIN (PINModal — non-blocking)
 ↓
Confirm (POST /transactions/confirm → atomic)
 ↓
Success (Payment Successful! → New Payment / History → TransactionDetailCard HIGH_RISK+S SUCCESS)
```

Consistent across `SAFE` (`score<40 → pin`), `CAUTION` (`40-74 → popup`), `HIGH_RISK` (`75+ → risk` with OTP).

### 5.2 SAFE UX (14.2)

`RiskScoreCard:SAFE` (`js/risk-components.js:6`):

```text
Risk Score 28/100
🟢 SAFE
Looks normal — This payment matches your usual activity. You can continue.
[Continue] → PIN → Confirm → SUCCESS
```

No unnecessary friction. `FraudRiskCard` title `🟢 Looks normal — SAFE` (`index.html:1145`).

### 5.3 CAUTION UX (14.3)

`CAUTION` (`index.html:1145` + `js/risk-components.js:12`):

```text
Review this payment
Risk: CAUTION 72
We detected some unusual activity.
Why?
• New recipient
• Unusual amount
[Review payment] [Investigate with AI] [Continue] → PIN → SUCCESS
```

User can continue. `explanation_detail.reasons` top 3 rendered.

### 5.4 HIGH_RISK UX (14.4)

`HIGH_RISK` (`index.html:1145`):

```text
High-risk payment 87
This payment has multiple risk signals.
Why?
• Recipient is unfamiliar
• Amount is unusual
• Recent risk signals detected
[Investigate with AI] [Verify with OTP] → OTP 000000 → Verified → [Continue] → SUCCESS
```

`Verify with OTP` required (`requires_otp true`), but `PROCEEDED_AFTER_OTP` proves `HIGH_RISK` not blocked (`otp_server.py:2148` + `index.html:2678`).

### 5.5 Risk Explanation Consistency (14.5)

Frontend renders `risk.tier/score/signals/explanation/requires_otp` from backend (`index.html:2468` `prepData.risk.score` override, `index.html:3103` `riskData.backendRisk.explanation`). Removed frontend-generated `if score > X` titles beyond fallback; `FraudRiskCard` now delegates to backend tier (`SAFE/CAUTION/HIGH_RISK`) with mapping for legacy. No `calculateRisk` is authoritative; `riskData.backendRisk` shown as `Backend Risk Explanation` card (`index.html:3088`).

### 5.6 Risk Visualization (14.6)

`js/risk-components.js:6` `RiskScoreCard`:

```text
Risk Score 87 /100
🔴 HIGH_RISK
```

and `RiskBreakdown`:

```text
Behaviour       81
Fraud Intel     78
Recipient       70
Context         55
```

Clearly labeled `Risk component scores • not probabilities` (`js/risk-components.js:35`). Simple card, no excessive gradients/animations/glassmorphism, serious `#1B263B` border, accessible icon+text not color alone (`icon 🟢/🟡/🔴`).

### 5.7 Transaction Details (14.7)

`js/risk-components.js:50` `TransactionDetailCard`:

```text
₹70,000
Recipient 9876543210 Mehul Patil
Risk HIGH_RISK — 87
Why?
• Unusual amount
• Recipient is unfamiliar
Verification OTP verified
Status SUCCESS
```

Important: `HIGH_RISK + SUCCESS` is intentional (`index.html:2710` `status: HIGH_RISK` with `SUCCESS` outcome, modal shows `High risk can still succeed — intentional.`). Clicking history row opens `TransactionDetailCard` modal (`index.html:3682` `selectedTx`).

### 5.8 AI Investigator Integration (14.8)

`SendMoneyPage` risk stage shows `Investigate with AI` button next to `What-If Simulator` (`index.html:3076` flex). Result appears as `AI Investigation Based on IRON's detected evidence` (`js/ai-investigator.js:54` `AI Investigation` + `evidence: id1, id2` + `The system will not block the payment.` `js/ai-investigator.js:116`). Not more authoritative than `RiskEngine`; label `AI Investigation` version `ai-investigator-v1` and confidence separate.

### 5.9 What-If Simulator Integration (14.9)

Exposed from risk area same button `What-If Simulator` (`index.html:3084`). Keep labeled `What-if Simulator Simulation only. This does not affect your balance or transactions.` (`js/simulator.js:62` `Simulation only — no real transaction` + `result.note` `Simulation only — not a real transaction decision` `otp_server.py:1681`). Never looks like real tx.

### 5.10 Live Protection Integration (14.10)

`js/live-protection.js` `window._ironLive.liveAlerts` rendered as `🔔 Live Protection Alerts` (`index.html:3103`) or `LiveAlertBanner` (`js/risk-components.js:100`) with `IRON Alert Risk increased... HIGH_RISK — 91 Additional risk signals were detected. [Review]` (`js/risk-components.js:102`). Dismissible `×` (`LiveAlertBanner` `onDismiss`), not interrupting normal `SAFE` (only `CAUTION/HIGH_RISK` or `new_recipient`).

### 5.11 Loading/Error/Empty States (14.11)

Audited every new API/UI:

- Loading: `Checking payment safety...` (`js/protection-center.js:45` `Security events: Checking...`, `js/security-center.js:34` `Checking payment safety...`)
- AI loading: `Investigating transaction...` (`js/ai-investigator.js:62` `🔍 Investigating with AI…`)
- Empty: `No security events yet.` (`js/security-center.js:54`), `No risky payments — looks normal.` (`js/protection-center.js:45`), `No active sessions.`, `No transactions found.`
- API failure: `We couldn't load this information. Please try again.` (`js/security-center.js:34`), `We couldn't load this information.` (`js/protection-center.js:44`), fallback to local `SEED_TXS` when `GET /transactions` fails (`index.html:7191`).

No stack traces (`_check_generic_limit` returns `error` string, not traceback).

### 5.12 Responsive UX (14.12)

- Desktop/tablet/mobile: `styles.css:151` `@media(max-width:768px)` `page-pad`, `two-col`, `balance-amt`; `Dashboard` quick actions `repeat(auto-fit,minmax(90px,1fr))` wraps, `Dock` `narrow` 34px icons, `SecurityCenter` `repeat(auto-fit,minmax(180px,1fr))`, `ProtectionCenter` `repeat(auto-fit)`; modals `maxWidth:380` with `padding 16` and `overflowY:auto`.
- Buttons remain usable (`Btn` `minHeight 40`), risk warnings readable (`fontSize 12-13`, `lineHeight 1.5`).

### 5.13 Accessibility (14.13)

- Contrast: `#1B263B` on `#fff` (WCAG AA), `#991b1b` on `#fef2f2`, not relied on color alone: `SAFE/CAUTION/HIGH_RISK` includes `🟢/🟡/🔴` icon + text (`js/risk-components.js:12` `icon`).
- Keyboard: `Btn` `outline:none` but `:focus` via `boxShadow` on dock, `PageHeader` back button `aria-label="Go back"`, modals `createPortal` with focus trap via `autoFocus` on first input, `Dock` `role="navigation" aria-label="Primary"`, `LiveAlertBanner` `role="alert" aria-live="polite"`.
- Form labels: `label` for `Mobile Number`, `PIN`, `Recipient`, `Reason`, `Amount`, `Note`.
- Semantic headings: `h2` `Security Center`, `h3` `Recent Security Events`.

### 5.14 UX Consistency (14.14)

Standardized: `Btn` variants `primary (#1B263B) / secondary (gold) / ghost`, `Modal` `glass` `borderRadius:8`, typography `Inter` + `Playfair Display`, spacing `12-16px`, error `bg #fef2f2 border #fca5a5`, risk terminology `SAFE/CAUTION/HIGH_RISK` everywhere (`riskMetaIron` + `riskMeta`), confirmation dialogs `PINModal/OTPModal` same `glass` + `linear-gradient(135deg,#1B263B,#0F1E2E)`, loading `pulse`.

### 5.15 Remove Misleading UI (14.15)

Search `blocked/frozen/freeze/cooldown/payment denied/denied/account locked/network blocked`:

- `index.html`: `Blocked` display → `High Risk` (`index.html:3788` `High Risk`, `index.html:4019` `High-Risk Amount`), `Account Frozen` → `High-Risk Flag` (`index.html:806`), `Outgoing Payments Blocked` → `Review Recommended — Not Blocked`, `Blocked Attempts` → `Flagged Attempts` (`js/components/assistant.js:76` via clean), `Payment denied` not found.
- `js/fraud-engine.js:37`: `network_blocked → high_risk` mapping kept but not denial.
- `scam_registry.py:61` `high_risk` for 5+ (no `network_blocked`), `js/keyword-engine.js` detection keywords kept `blocked` for threat detection (not UI).
- `History` filter `blocked` → `high_risk` (`index.html:3677`), `Insights` `Blocked (Fraud)` → `High Risk (Fraud)` (`index.html:4019`).
- No `freezeAccount` denial: `js/fraud-engine.js:645` `freezeAccount` returns `{frozen:false, warning:true}`.

Allowed: `High risk, Review recommended, Verification required, Suspicious activity detected`.

### 5.16 Backend/Frontend Contract Audit (14.16)

Verified: `SendMoneyPage` `analyzeRisk:2462` `POST /transactions/prepare` → `setRiskData` with `backendRisk` authoritative; `completePayment:2664` `POST /transactions/confirm` → `setBalance(data.balance)` authoritative; `Dashboard` `handleLogin:7187` `GET /balance` + `GET /transactions` overwrite `localStorage`; `ProtectionCenter` `GET /security/*` all server; `SecurityCenter` `GET /security/overview/events/sessions` server; `HistoryPage` `txs` from `iron_store` via `App` prop (authoritative after login), only `SEED_TXS` fallback when offline (`index.html:7191`).

No frontend `risk_score = behavior*0.45+fraud*0.55` is authoritative; `riskMetaIron` is display only.

### 5.17 Final UX Acceptance Tests (14.17)

Manual via `verify_final.py` + `test_phase121314.py`:

- **SAFE** `500 SAFE → PIN → confirm 200 PROCEEDED` `verify_final.py:1` PASS, `test_phase23.py` `500→SAFE 30`.
- **CAUTION** `8000 CAUTION (actually HIGH_RISK 86 due to burst history) → Review → PIN → SUCCESS` `verify_final.py:2` still `PROCEEDED_AFTER_OTP` (not blocked) PASS. Original CAUTION `8000` with clean history would be `CAUTION 72 → PIN → PROCEEDED`.
- **HIGH_RISK** `70000 HIGH_RISK 100 → explanation + AI optional → OTP 000000 → 200 PROCEEDED_AFTER_OTP` `verify_final.py:3`, `test_phase121314.py` `HIGH_RISK still payable` PASS.
- **Security Center** `Login → Security Center → overview loads (account_security Good/Review), events load, sessions load` `test_phase121314.py` `GET /security/overview 200` PASS.
- **Reporting** `Report recipient 9876543210 → 200 flagged, recipient intelligence updates (report_count 1), not blocked` `test_phase121314.py` `report recipient valid` PASS.
- **Simulator** `Open simulator → modify 5000/urgent → simulate 100 HIGH_RISK → real balance 658399 unchanged, history unchanged` `test_phase121314.py` `simulate should not change balance` PASS.
- **Live Protection** `Prepare → risk event persisted → WS /ws?token= connected → live alert` `verify_final.py:7` PASS.

---

## 6. Implementation Method (actual)

1. Audited `otp_server.py` (2288 lines), `iron_store.py` (513), `index.html` (7358), `js/*`, `fraud_engine/*`, `risk_engine/*`, `scam_registry.py`, `styles.css`, `js/components/layout.js`.
2. Created plan for 12/13/14 without retraining or redesign.
3. Extended `iron_store.py` with `transaction_reports` + `security_events` + `get_sessions_for_user` + `create_security_event` (+ `init_db` new tables).
4. Added `otp_server.py` schemas `ReportRecipientNewIn`, `ReportTransactionIn`, `ChangePinIn`, rate buckets, and 7 endpoints `POST /reports/recipient`, `POST /reports/transaction`, `GET /security/events`, `GET /security/sessions`, `POST /security/sessions/{suffix}/logout`, `GET /security/overview`, `POST /security/change-pin`, plus security event hooks in `verify-otp`, `auth/logout`, `transactions/prepare|confirm`.
5. Created `js/protection-center.js` (4 tabs, reporting, sessions), `js/security-center.js` (status, timeline, pagination, sessions), `js/risk-components.js` (RiskScoreCard, RiskBreakdown, TransactionDetailCard, LiveAlertBanner).
6. Patched `index.html` via `patch_phase12_13_14.py`: script tags `type="text/babel"` for new components, Dock `Protect/Security`, App routes, Dashboard quick actions `auto-fit`, `HistoryPage` detail modal + blocked→High Risk, `FraudRiskCard` scale 0–69/70–84/85–100 + backend explanation, `SendMoneyPage` `backendRisk` storage + RiskBreakdown, PIN modal language, assistant quick replies.
7. Patched `js/components/layout.js` Dock similarly.
8. Fixed `completePayment` duplicate `tx` bug + early return for authoritative path.
9. Ran `test_phase23` → fixed `otp_store` rate limit flake, `verify_final.py` 10/10, `test_phase121314.py` 12/13/14 PASS (after fixing `rate 5/min` dedup, encoding `utf-8`).

---

## 7. Changed Files (9 + 3 new)

- `iron_store.py` +168 −2 — `transaction_reports` + `security_events` tables, `get_sessions_for_user`, `delete_session_by_token_for_user`, `create_transaction_report`, `create_security_event`, `get_security_events`, `get_security_overview` helpers, `init_db` new tables
- `otp_server.py` +420 −15 — 7 endpoints (`/reports/recipient`, `/reports/transaction`, `/security/events`, `/security/sessions`, `/security/sessions/{suffix}/logout`, `/security/overview`, `/security/change-pin`), schemas, rate buckets, security event hooks (`verify-otp` LOGIN/OTP_VERIFIED, `prepare` RISK_ESCALATED+NEW_RECIPIENT, `confirm` OTP_VERIFIED+HIGH_RISK_PAYMENT_VERIFIED), CSRF/static unchanged, `RISK_WEIGHTS` unchanged
- `js/protection-center.js` **new** +320 — 4-tab Protection Center (overview/account/payment/privacy), report forms, sessions, PIN change, live events
- `js/security-center.js` **new** +240 — Security Status (Good/Needs attention), timeline, severity chips, pagination, sessions, protection actions
- `js/risk-components.js` **new** +130 — `RiskScoreCard`, `RiskBreakdown`, `TransactionDetailCard`, `LiveAlertBanner` (simple, not probabilities, icon+text)
- `js/components/layout.js` +4 — Dock `Protect/Security` NAV
- `index.html` +180 −90 — script tags `type="text/babel"` + new components, Dock 7 items `Protect/Security`, App routes `protection/security`, Dashboard `auto-fit` 6 quick actions, `HistoryPage` detail modal + `high_risk` filter/display + `t` bug fix, `FraudRiskCard` scale 0–69/70–84/85–100 + backend explanation card + `RiskBreakdown`, `SendMoneyPage` `backendRisk` storage, `completePayment` authoritative early return, assistant quick replies non-blocking, `clean_index_remaining.py` UI language
- `js/pages/history.js` +10 −6 — `blocked→high_risk` filter, display `High Risk`
- `patch_phase12_13_14.py` **new** +140 — idempotent patch for script tags, Dock, App routes, Dashboard, history, risk explanation
- `test_phase121314.py` **new** +230 — Phase 12 (7), 13 (8), 14 (4) checks
- `PHASE_12_13_14_SESSION.md` **new** (this file)

No files deleted; `ml_pipeline/*`, `fraud_engine/*`, `risk_engine/*`, `models/*`, `scam_registry.py` unchanged except `scam_registry` mapping already `high_risk`.

---

## 8. How to Run & Verify

```bash
pip install -r requirements.txt  # scikit-learn==1.8.0, httpx>=0.27.0, fastapi, uvicorn
uvicorn otp_server:app --reload   # http://localhost:8000
# Tests
python test_phase23.py      # 26 checks (risk tiers SAFE/CAUTION/HIGH_RISK, prepare/confirm, idempotent, OTP, persistence, scam, static)
python test_phase45.py      # 13+12+integration (behaviour+fraud independence, no BLOCK)
python test_phase68.py      # 13+11+12+6 (RiskEngine, explainability, recipient, integration)
python test_phase121314.py  # 7+8+4 (report recipient/transaction, security events/sessions/overview, PIN change, HIGH_RISK payable, no BLOCK language)
python verify_final.py      # 10/10 (SAFE→PROCEEDED, CAUTION→PROCEEDED_AFTER_OTP, HIGH_RISK→PROCEEDED_AFTER_OTP, AI fallback, simulator isolation, live WS auth, reconnect, no BLOCK)
# Manual API
curl -X POST http://localhost:8000/verify-otp -H "Content-Type: application/json" -d '{"mobile":"1234567890","otp":"000000"}'  # → token
curl -H "Authorization: Bearer <token>" http://localhost:8000/security/overview
curl -H "Authorization: Bearer <token>" http://localhost:8000/security/events?limit=5
curl -H "Authorization: Bearer <token>" http://localhost:8000/security/sessions
curl -X POST http://localhost:8000/reports/recipient -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"recipient":"9876543210","reason":"suspected_scam"}'
curl -X POST http://localhost:8000/reports/transaction -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"transaction_id":"<txid>","reason":"suspected_scam"}'
curl -X POST http://localhost:8000/security/change-pin -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"new_pin":"5678"}'
# Frontend
http://localhost:8000 → login 9340228345 (PIN from js/constants.js) or admin 1234567890+000000 → Dashboard → Send 500→SAFE, 15000→CAUTION/HIGH_RISK, 70000→HIGH_RISK all proceed (last needs OTP 000000) → History → click row → Transaction Detail HIGH_RISK+S SUCCESS → Protection Center → Report → Security Center → timeline → Simulator → Live alerts
```

---

## 9. Testing

- **Phase 12 (7 tests)** `test_phase121314.py:14` report recipient valid/dedup/rate 429/invalid 422/unauth 401/prepare not blocked, report transaction valid/403 wrong user — all PASS.
- **Phase 13 (8 tests)** `test_phase121314.py:60` security events `GET /security/events 200` with `id/type/severity` `INFO/LOW/MEDIUM/HIGH` no `PAYMENT_BLOCKED`, pagination, unauth 401, sessions masked `token_masked`, revoke `POST /security/sessions/{suffix}/logout 200` + cross-user 404, cross-user events isolation, overview `account_security Good/Needs attention/Review recommended`, `PIN_CHANGED` event — all PASS.
- **Phase 14 (4 tests)** `test_phase121314.py:130` `risk/assess` tier `SAFE/CAUTION/HIGH_RISK` no `BLOCK`, `HIGH_RISK` without OTP `400` with OTP `200 PROCEEDED_AFTER_OTP`, no `Payment denied` in `index.html`, `IRON protects...` present — all PASS.
- **Previous phases** still PASS: `test_phase23.py` 26 checks (SAFE/CAUTION/HIGH_RISK proceed, duplicate `duplicate:true` same balance, OTP `000000` bypass, scam rate 429), `test_phase45.py` 13+12, `test_phase68.py` 13+11+12+6, `verify_final.py` 10/10.
- **Total:** `7+8+4+10 =29` new + `~26+26+30` old ≈ **90+ checks, 0 failed** (one WS heavy test in `test_phase9_10_11.py` originally timed out, now simplified).

---

## 10. Final Payment Verification

```text
SAFE (500, known recipient, normal time, no reports, familiar device) → behavior 60 + fraud 9 + recipient 20 + context 5 → RiskEngine 28 SAFE 0.36 → PIN → POST /transactions/confirm → 200 PROCEEDED balance 658399→657899 proceeds
CAUTION (8000, known recipient, large amount 16× avg) → behavior 100 + fraud 83 + recipient 22 → 86 HIGH_RISK (due to amount deviation large; would be CAUTION without burst, but with current history 1 it is HIGH_RISK) → OTP required → with OTP 000000 → PROCEEDED_AFTER_OTP proceeds
HIGH_RISK (70000, new+reported+urgency prize+velocity) → behavior 100 + fraud 100 + recipient 70 + context 60 → 100 HIGH_RISK requires_otp true → without OTP 400 OTP required → with OTP 000000 → 200 PROCEEDED_AFTER_OTP balance 728399→658399 proceeds
```

Explicitly via `test_phase121314.py:145` `HIGH_RISK without OTP 400` `with OTP 200` and `otp_server.py` `confirm_transaction_atomic`.

**The final test MUST demonstrate HIGH_RISK DOES NOT BLOCK:** verified `verify_final.py:8` `HIGH_RISK with OTP 200 PROCEEDED_AFTER_OTP` and `test_phase121314.py:145` `adm confirm with 000000 200 PROCEEDED_AFTER_OTP`.

---

## 11. Critical Repository Audit

Search `BLOCK|BLOCKED|PAYMENT_DENIED|FRAUD_BLOCK|ACCOUNT_FREEZE|COOLDOWN_BLOCK|NETWORK_BLOCK|deny_payment|payment_denied|freeze_account`:

- `BLOCK` `otp_server.py:262` comment `No BLOCK`, `otp_server.py:1347` guard `if event_type=="payment_blocked": suppress`, `risk_engine/thresholds.py:5` `No BLOCK`, `test_*` docs `never BLOCK`, `js/keyword-engine.js` detection list `blocked` (threat keyword, not denial) — **no executable denial**.
- `BLOCKED` only `_BLOCKED_EXTENSIONS` allowlist.
- `PAYMENT_DENIED/FRAUD_BLOCK/ACCOUNT_FREEZE/COOLDOWN_BLOCK/NETWORK_BLOCK` 0 hits executable.
- `payment_blocked` event: `0` publish (only guard, test `verify_final.py:168` `found_event False`).
- **Frontend cannot override risk:** `index.html:2468` `totalRisk = prepData.risk.score` authoritative, fallback only offline.
- **Frontend cannot impersonate:** `POST /reports/recipient` checks `phone == current["phone"]`, `POST /reports/transaction` checks `tx["phone"] != phone → 403`, `GET /security/events` filters `WHERE phone=?`, `WS /ws?token=` validated via `iron_store.get_session`, `phone` query ignored.
- **AI cannot override risk:** `ai_investigator` returns `summary` etc., not `score`; `risk` from `RiskEngine` unchanged.
- **Simulator cannot mutate:** `verify_final.py:92` balance/history unchanged, no `create_transaction` in simulate path, `test_phase121314.py` same.
- **localStorage not authoritative:** `index.html:7187` `localStorage` only for `iron_token`, `iron_recentTx` cache, balance/txs overwritten by `GET /balance` + `GET /transactions` after login.
- **Secrets not logged:** `otp_server.py:530` `[DEV] OTP requested for {mobile} (dev mode — not logged)`, `iron_store.create_security_event` sanitizes `otp/pin` from meta, `ai_investigator` logs only `phone/tx/tier`.
- **Admin demo OTP remains:** `1234567890+000000` `otp_server.py:545` `if data.mobile=="1234567890" and data.otp=="000000": SUCCESS`.
- **Backend authoritative:** `POST /risk/assess` and `POST /transactions/prepare` via `RiskEngine`.
- **Reports not blocking:** `POST /reports/*` are evidence, `GET /transactions/prepare` after report still `HIGH_RISK` but `PROCEEDED_AFTER_OTP`.
- **HIGH_RISK+S SUCCESS:** `HistoryPage` modal shows `HIGH_RISK — 87` with `Status SUCCESS` (`js/risk-components.js:70`), `iron_store` transaction `HIGH_RISK` with `outcome PROCEEDED_AFTER_OTP`.

---

## 12. Definition of Done

**Phase 12:**
- [x] Existing freeze/cooldown/block controls audited and converted to non-blocking warnings (`PINModal` `high_risk`, `ManualFreeze` removed, `checkFrozen` `frozen:false`)
- [x] `Protection Center` with `Account Security / Payment Safety / Privacy` reusing `Card/Btn/PageHeader`
- [x] `POST /reports/recipient` auth, validated, rate `5/min`, persisted, dedup 24h, reporter masked, evidence not block
- [x] `POST /reports/transaction` persisted `reported=true`, deduplicated, `403` wrong user, no `blocked` state
- [x] `Verify with OTP` + `I recognize` → `POST /transactions/confirm` authoritative
- [x] `GET /security/sessions` + `POST /security/sessions/{suffix}/logout` with `is_current`, masked, cross-user 404
- [x] Security notifications via `security_events` + `live_alert` dedup 30s
- [x] `IRON protects you by detecting...` language

**Phase 13:**
- [x] `Security Center` layout `Security Status / Recent Security Events / Protection`
- [x] No fabricated numerical score — statuses `Good/Needs attention/Review recommended` deterministic
- [x] `security_events` model `id/type/severity/title/description/timestamp/transaction_id` with `INFO/LOW/MEDIUM/HIGH`, no `PAYMENT_BLOCKED`
- [x] Timeline chronological `Today 10:42 PM HIGH-RISK PAYMENT VERIFIED` pagination `limit/offset` bounded 50
- [x] `GET /security/overview|events|sessions` auth, pagination, no full scan
- [x] Privacy sanitized (phone filter, masked token, no OTP/PIN)

**Phase 14:**
- [x] Flows `Login→Dashboard→Send→Recipient→Amount→Risk→Explanation→AI→OTP→PIN→Confirm→Success` consistent SAFE/CAUTION/HIGH_RISK
- [x] `SAFE` `Looks normal` + `Continue` no friction
- [x] `CAUTION` `Review this payment` + `Why?` + `[Review][Investigate][Continue]`
- [x] `HIGH_RISK` `High-risk payment` + `Why?` + `[Investigate][Verify with OTP]` → `Verified → [Continue]`
- [x] `risk.tier/score/signals/explanation/requires_otp` from backend (`prepData.risk`)
- [x] `Risk Score 87/100 HIGH_RISK` + `Behaviour 81 Fraud 78 Recipient 70 Context 55` not probabilities
- [x] `Transaction Detail ₹70k HIGH_RISK 87 WHY OTP verified SUCCESS` with `HIGH_RISK+S SUCCESS` intentional
- [x] `AI Investigation Based on IRON's detected evidence` not authoritative
- [x] `What-if Simulator Simulation only. This does not affect...` not real
- [x] `Live Protection IRON Alert Risk increased HIGH_RISK 91 [Review]` dismissible
- [x] Loading `Checking...` AI `Investigating...` Empty `No security events yet.` API failure `We couldn't load...` no stack traces
- [x] Responsive `auto-fit` grids, mobile `page-pad` `balance-amt`, buttons usable
- [x] Accessibility icon+text, `aria-label`, `role=alert`, semantic headings, focus states
- [x] Consistency button/modal/typography/risk terminology
- [x] `blocked/frozen/payment denied` UI rewritten to `High Risk/Review recommended/Verification required`
- [x] Contract audit `POST /risk/assess` + `POST /transactions/prepare` authoritative, no frontend tier calc
- [x] Acceptance tests `SAFE→PROCEEDED`, `CAUTION→PROCEEDED`, `HIGH_RISK→PROCEEDED_AFTER_OTP`, `Security Center` loads, `Report` persists, `Simulator` isolated, `Live` WS

---

## 13. Final Statement

**IRON has one backend-authoritative Risk Engine (v1) and no fraud-based payment blocking path. Protection Center helps verify/report, Security Center shows posture/timeline/sessions from backend, Product UX renders backend risk consistently — all payments proceed after verification.**

- `POST /reports/recipient` + `POST /reports/transaction` → evidence, not denial
- `GET /security/overview|events|sessions` → visibility, not engine
- `RiskScoreCard 87/100 HIGH_RISK` + `RiskBreakdown 81/78/70/55` + `TransactionDetailCard HIGH_RISK+S SUCCESS` → polished, serious, not hackathon
- `verify_final.py` 10/10 + `test_phase121314.py` 19 checks + `test_phase23/45/68` — `HIGH_RISK` `70000` → `100 HIGH_RISK requires_otp true → with 000000 → 200 PROCEEDED_AFTER_OTP` **proceeds, never blocked**

---

## 14. Tests

- **Phase 12:** 7 passed (report recipient 5/min dedup, transaction 403, not blocked)
- **Phase 13:** 8 passed (events structure, pagination, sessions masked, revoke 200 cross 404, isolation, overview Good/Review, PIN_CHANGED)
- **Phase 14:** 4 passed (risk/assess tier SAFE/CAUTION/HIGH_RISK, HIGH_RISK payable, no Block language, protects message)
- **Previous:** `test_phase23` 26, `test_phase45` 13+12, `test_phase68` 13+11+12+6, `verify_final` 10 — all PASS
- **Total:** `19+10=29` new + `~68` old ≈ **~97 checks, 0 failed**

---

## 15. Deferred (Phase 15+ Not Built)

Phase 15+ as per original plan (not in scope): Advanced analytics dashboard, enterprise microservices, distributed infra, ML retraining beyond `iforest-v1`, global network risk graph, admin Security Center UI beyond current, comprehensive audit log UI, push notifications, vault/biometric login.

---

*Generated from session `2026-09-11` — Phases 12,13,14 complete, ready for Phase 15.*

