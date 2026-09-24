// ═══ RECIPIENT RISK REGISTRY ═══

/* ═══ RECIPIENT RISK REGISTRY (Network-wide, backend-synced) ═══
   Local Map = instant-feedback cache (works offline / before sync)
   Backend   = persistent, network-wide, visible to ALL users
   ═══════════════════════════════════════════════════════════════ */
const RecipientRiskRegistry = new Map(); // number -> {count: 0, reports: []}
const _scamDbCache = new Map();          // number -> {report_count, tier, reasons} (from backend)

function incRecipientRisk(number) {
  if (!RecipientRiskRegistry.has(number)) {
    RecipientRiskRegistry.set(number, { count: 0, reports: [] });
  }
  RecipientRiskRegistry.get(number).count += 1;
}

function getRecipientRisk(number) {
  // Prefer backend-synced count if available (network-wide truth)
  const cached = _scamDbCache.get(number);
  if (cached) return cached.report_count;
  return RecipientRiskRegistry.get(number)?.count || 0;
}

function getRecipientReportReason(number) {
  const cached = _scamDbCache.get(number);
  if (cached && cached.reasons && cached.reasons.length) {
    return cached.reasons[cached.reasons.length - 1];
  }
  const entry = RecipientRiskRegistry.get(number);
  if (!entry || !entry.reports || entry.reports.length === 0) return null;
  return entry.reports[entry.reports.length - 1].reason || null;
}

function getRecipientTier(number) {
  const cached = _scamDbCache.get(number);
  if (cached) return cached.tier;
  const count = getRecipientRisk(number);
  if (count >= 5) return "network_blocked";
  if (count >= 3) return "high_risk";
  if (count >= 1) return "flagged";
  return "clean";
}

function reportRecipient(reporter, target, amount, reason) {
  // 1. Local immediate update (instant UI feedback)
  if (!RecipientRiskRegistry.has(target)) {
    RecipientRiskRegistry.set(target, { count: 0, reports: [] });
  }
  const entry = RecipientRiskRegistry.get(target);
  entry.count += 2;
  entry.reports.push({ reporter, amount, reason, time: new Date() });

  // 2. Sync to backend -- network-wide, persistent, visible to all users
  try {
    const base = typeof API !== "undefined" ? API : "";
    fetch(`${base}/scam-db/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: target, reporter, reason, amount }),
    })
      .then(r => r.json())
      .then(data => {
        _scamDbCache.set(target, {
          report_count: data.report_count,
          tier: data.tier,
          reasons: _scamDbCache.get(target)?.reasons || [reason],
        });
      })
      .catch(() => {});   // backend unreachable -- local cache still works
  } catch (_) {}
}

/**
 * checkRecipientNetworkRisk
 * --------------------------
 * Async pre-check called when a recipient is entered in the send form.
 * Fetches the network-wide risk status and updates the local cache so
 * getRecipientRisk()/getRecipientTier() reflect it immediately after.
 */
async function checkRecipientNetworkRisk(number) {
  if (!number) return null;
  try {
    const base = typeof API !== "undefined" ? API : "";
    const res = await fetch(`${base}/scam-db/check/${encodeURIComponent(number)}`);
    if (!res.ok) return null;
    const data = await res.json();
    _scamDbCache.set(number, {
      report_count: data.report_count,
      tier: data.tier,
      reasons: data.reasons || [],
    });
    return data;
  } catch (_) {
    return null;
  }
}


// ═══ ML FRAUD SCORER + RISK EXPLANATION ═══

/* ═══ LIGHTWEIGHT FRAUD SCORER ═══
   Weights derived from feature importances of the original model:
   Large Balance Drain 87.58% · Daily Spend 6.36% · Recipient Risk 3.01%
   Z-Score Dev 2.34% · Amt/Bal 0.62% · Odd Hour 0.06% · Freq 0.02%

   CALIBRATION POLICY (v2):
   · Normal new recipient + high amount  → 75–84 (Suspicious)
   · Score of 95–100 RESERVED exclusively for recipients in RecipientRiskRegistry (Blacklist)
   · This prevents spurious 100/100 spikes from everyday large transfers
   =========================================================== */

function mlFraudScore(user, amount, receiverNum) {
  try {
    const bal        = Math.max(user.balance || 1, 1);
    const avg        = calculateAvgTransaction(user);
    const std        = calculateStdDeviation(user, avg);
    const hour       = new Date().getHours();
    const inContacts = receiverNum in (user.contacts || {});
    const inHistory  = user.known_recipients?.has(receiverNum) || false;
    const inUPI      = receiverNum in USERS;
    const spentToday = getDailySpent(user);
    const startBal   = Math.max(bal + spentToday, 1);
    const z          = std > 0 ? Math.abs(amount - avg) / std : 0;

    // ── Feature vector ──
    const f0 = Math.min(amount / bal, 1.0);                               // amt/bal ratio
    const f1 = (hour>=1&&hour<5)?1.0:(hour>=22||hour<7)?0.5:0.0;         // odd hour
    const f2 = (!inContacts && !inHistory) ? 1.0 : 0.0;                  // unknown recip
    const f3 = Math.min(getRecentTransactions(user,5).length / 10, 1.0); // tx frequency
    const f4 = Math.min((spentToday + amount) / startBal, 1.0);          // daily spend
    const f6 = Math.min(getRecipientRisk(receiverNum) / 10, 1.0);        // recipient risk (registry)
    const f7 = Math.min(z / 4, 1.0);                                     // z-score dev
    const f8 = inUPI ? 0.0 : 1.0;                                        // off-network

    // ── Weighted linear combination ──
    const rawScore = (
      0.8758 * f4 +
      0.0636 * f4 * (f0 > 0.5 ? 1.5 : 1.0) +  // daily spend × balance pressure
      0.0301 * f6 +
      0.0234 * f7 +
      0.0062 * f0 +
      0.0006 * f1 +
      0.0002 * f3 +
      0.05   * f2 +   // unknown recipient signal
      0.03   * f8     // off-network penalty
    );

    // ── Sigmoid ──
    const logit = -1.77185 + 8.5 * rawScore;
    let prob = 1 / (1 + Math.exp(-logit));

    // ── CALIBRATION CAP: non-blacklisted recipients are capped at 0.84 ──
    // This ensures a new recipient + large amount lands in Suspicious (75–84),
    // not at 100. A score of 0.95+ is reserved for confirmed registry entries.
    const isBlacklisted = getRecipientRisk(receiverNum) >= 1;
    if (!isBlacklisted) {
      // Soft-cap at 0.84 using a compression curve
      prob = Math.min(prob, 0.84);
    } else {
      // Blacklisted: allow full range; boost proportional to registry count
      const registryBoost = Math.min(getRecipientRisk(receiverNum) / 5, 1.0) * 0.15;
      prob = Math.min(prob + registryBoost, 1.0);
    }

    return prob;
  } catch(e) {
    console.warn('[IronWallet ML] scoring error:', e);
    return null;
  }
}


/* ═══ RISK EXPLANATION ENGINE ═══
   getRiskExplanation(user, receiverNum, amount)
   Returns { score, level, insights:[], reasons:[], tags:[] }
   THREE CLEAN LAYERS — no cross-layer duplication:
     insights = full sentences for Engine Insights
     reasons  = short phrases for "Why is this risky?"
     tags     = 1-2 word chip labels
   Uses existing helpers only — does NOT touch mlFraudScore scoring.
   =========================================================== */
function getRiskExplanation(user, receiverNum, amount) {
  const probRaw = mlFraudScore(user, amount, receiverNum);
  const score   = probRaw !== null ? Math.round(probRaw * 100) : 0;

  let level = "Safe";
  if (score >= 85)      level = "OTP Required";
  else if (score >= 60) level = "Caution";

  const insights = [];  // full sentences → Engine Insights
  const reasons  = [];  // short phrases  → Why is this risky?
  const tags     = [];  // 1-2 word chips → chip row

  const rr          = getRecipientRisk(receiverNum);
  const inContacts  = receiverNum in (user.contacts || {});
  const inHistory   = user.known_recipients?.has(receiverNum) || false;
  const avg         = calculateAvgTransaction(user);
  const bal         = Math.max(user.balance || 1, 1);
  const spentToday  = getDailySpent(user);
  const startBal    = Math.max(bal + spentToday, 1);
  const hour        = new Date().getHours();
  const inNetwork   = receiverNum in USERS;

  // A) NETWORK REPORTS
  if (rr > 0) {
    insights.push(`Recipient has been reported by ${rr} user${rr > 1 ? "s" : ""} for suspicious activity`);
    reasons.push(`Reported by ${rr} user${rr > 1 ? "s" : ""}`);
    tags.push("Reported");
  }

  // B) NEW RECIPIENT
  if (!inContacts && !inHistory) {
    insights.push("Recipient is not in your contacts or transaction history");
    reasons.push("New recipient");
    tags.push("New");
  }

  // C) HIGH AMOUNT
  if (amount > avg * 2) {
    insights.push(`Amount ₹${amount.toLocaleString("en-IN")} is unusually high compared to your typical transactions`);
    reasons.push("High amount");
    tags.push("High Amount");
  }

  // D) LARGE BALANCE USAGE
  if (startBal > 0 && (spentToday + amount) / startBal > 0.5) {
    insights.push("This transaction uses a large portion of your balance");
    reasons.push("Large spend");
    tags.push("Large Spend");
  }

  // E) ODD HOUR
  if (hour >= 1 && hour < 5) {
    insights.push("Transaction initiated at an unusual time (1–5 AM)");
    reasons.push("Odd hour");
    tags.push("Odd Hour");
  }

  // F) OFF-NETWORK
  if (!inNetwork) {
    insights.push("Recipient is outside the trusted UPI network");
    reasons.push("Off-network account");
    tags.push("Off-Network");
  }

  // Deduplicate
  return {
    score,
    level,
    insights: [...new Set(insights)],
    reasons:  [...new Set(reasons)],
    tags:     [...new Set(tags)],
  };
}

// === Urgency Detection Feature ===
/* ─────────────────────────────────────────────────────────────────────────────
   URGENCY / PANIC DETECTION ENGINE
   Scans payment note and UPI ID for urgency-loaded language commonly used
   in social-engineering scams. Returns a normalized score 0–1.
   This score is then blended into the main risk scoring pipeline with a
   small weight (+0.08 * urgencyScore) so it nudges the total without
   dominating legitimate urgent transfers.
   ───────────────────────────────────────────────────────────────────────── */

// Curated urgency keyword list — words scammers use to create time pressure
const URGENCY_KEYWORDS = [
  "urgent", "urgently", "immediately", "now", "asap", "fast", "last chance",
  "expire", "expires", "expiring", "limited", "today only", "hurry", "quick",
  "quickly", "deadline", "do it now", "right now", "no delay", "time sensitive",
  "act now", "running out", "don't wait", "instant", "immediately required"
];

/**
 * detectUrgency(note, upiId)
 * Checks both payment note and UPI ID for urgency language.
 * @param {string} note     - Payment note/description entered by user
 * @param {string} upiId    - Recipient UPI ID string
 * @returns {{ urgencyScore: number, urgencyHits: string[] }}
 *   urgencyScore: 0 (none) to 1 (maximum urgency detected)
 *   urgencyHits:  array of matched urgency keywords for display
 */
function detectUrgency(note, upiId) {
  // Combine both inputs into a single lowercase search space
  const searchText = `${note || ""} ${upiId || ""}`.toLowerCase();

  const matched = [];

  // Check each urgency keyword against the combined text
  for (const kw of URGENCY_KEYWORDS) {
    if (searchText.includes(kw)) {
      matched.push(kw);
    }
  }

  if (matched.length === 0) {
    return { urgencyScore: 0, urgencyHits: [] };
  }

  // Normalize: 1 hit → ~0.4, 2 hits → ~0.7, 3+ hits → 1.0
  // Uses a soft saturation curve so a single mild keyword doesn't over-penalize
  const rawScore = Math.min(matched.length / 2.5, 1.0);

  return {
    urgencyScore: rawScore,
    urgencyHits: matched
  };
}
// === End Urgency Detection Feature ===


// ═══ URGENCY DETECTION ═══

/* ═══ KEYWORD RISK ANALYSIS ENGINE ═══ */

/* ═══ UPI KEYWORD & PATTERN ANALYSIS ENGINE ═══ */

// ═══ FRAUD DETECTION ENGINE ═══

/* ═══ FRAUD DETECTION ENGINE ═══ */
const ODD_HOUR_START = 1;
const ODD_HOUR_END = 5;
const FREEZE_BLOCK_COUNT = 10;
const FREEZE_WINDOW_SEC = 180;
const COOLDOWN_SEC = 60;
const MAX_DAILY_FREEZE = 5;
const OTP_DISCOUNT = 15;

function isOddHour(date = new Date()) {
  const hour = date.getHours();
  return hour >= ODD_HOUR_START && hour < ODD_HOUR_END;
}

function getRecentTransactions(user, minutes) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - minutes * 60000);
  return (user.transactions || []).filter(tx => {
    if (!tx.date || !tx.time) return false;
    const txDate = new Date(`${tx.date} ${tx.time}`);
    return txDate > cutoff;
  });
}

function calculateAvgTransaction(user) {
  const txs = (user.transactions || []).filter(t =>
    Number(t.amt) > 0 && !["pending","cancelled","failed","blocked"].includes(String(t.status || "").toLowerCase())
  );
  if (txs.length === 0) return 1000;
  const sum = txs.reduce((s, t) => s + Number(t.amt || 0), 0);
  return sum / txs.length;
}

function calculateStdDeviation(user, avg) {
  const txs = user.transactions || [];
  if (txs.length < 2) return avg * 0.5;
  const squaredDiffs = txs.map(t => Math.pow(t.amt - avg, 2));
  const variance = squaredDiffs.reduce((s, d) => s + d, 0) / txs.length;
  return Math.sqrt(variance);
}

function getDailySpent(user) {
  const today = new Date().toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'2-digit'}).replace(/ /g,' ');
  return (user.transactions || [])
    .filter(tx => tx.date === today && tx.type === 'debit' && tx.status !== 'blocked')
    .reduce((s, t) => s + t.amt, 0);
}

function behaviouralDeviation(user, amount) {
  const avg = calculateAvgTransaction(user);
  const std = calculateStdDeviation(user, avg);
  if (std === 0) return { risk: 0, signals: [] };
  
  const zScore = Math.abs(amount - avg) / std;
  if (zScore > 3.5) {
    return {
      risk: 12,
      signals: [`Amount ₹${amount.toLocaleString()} is unusually far outside your typical range (avg ₹${avg.toLocaleString()} ± ₹${std.toLocaleString()})`]
    };
  }
  return { risk: 0, signals: [] };
}

function scamPatternCheck(user, amount, receiverNum) {
  const avg = calculateAvgTransaction(user);
  const bal = user.balance;
  const inContacts = receiverNum in (user.contacts || {});
  const inHistory = user.known_recipients?.has(receiverNum) || false;
  const inUPI = receiverNum in USERS;
  
  const isUnknown = !inContacts && !inHistory;
  // Treat an amount as unusual only when it is materially above this
  // account's observed history. Low-value payments must not be flagged just
  // because the account also has large payments.
  const isLarge = amount > Math.max(8 * avg, avg + 3 * calculateStdDeviation(user, avg));
  const drainsBalance = amount > 0.65 * bal;
  const oddHour = isOddHour();
  
  let signals = 0;
  const reasons = [];
  
  if (isUnknown) { signals++; reasons.push("Recipient is not in your contacts or transaction history."); }
  if (isLarge) { signals++; reasons.push(`Amount ₹${amount.toLocaleString()} is much higher than your usual payments.`); }
  if (drainsBalance) { signals++; reasons.push(`This would use ${Math.round(amount/bal*100)}% of your current balance.`); }
  if (!inUPI) { signals += 1; reasons.push("⚠️ Recipient UPI ID is not registered in the network — verify before paying."); }
  if (oddHour) { signals++; reasons.push("Transaction attempted during late-night hours."); }
  
  if (signals >= 3) {
    reasons.push("If someone asked you to make this payment, please verify first.");
    return { risk: 15, autoBlock: true, signals: reasons };
  }
  if (signals === 2 && amount > 0.5 * bal) {
    return { risk: 10, autoBlock: false, signals: ["Multiple risk signals active on this payment — please review carefully."] };
  }
  return { risk: 0, autoBlock: false, signals: [] };
}

function checkMicroPaymentAttack(user) {
  const recent1min = getRecentTransactions(user, 1).filter(tx => tx.amt >= 1 && tx.amt <= 50);
  const recent2min = getRecentTransactions(user, 2).filter(tx => tx.amt >= 1 && tx.amt <= 50);
  
  if (recent1min.length >= 10) {
    return {
      attack: true,
      risk: 60,
      signal: `🚨 ${recent1min.length} rapid small payments (₹1–₹50) in 1 minute.`
    };
  }
  if (recent2min.length >= 12) {
    return {
      attack: true,
      risk: 55,
      signal: `🚨 ${recent2min.length} rapid small payments in 2 minutes.`
    };
  }
  return { attack: false, risk: 0, signal: null };
}

function checkRapidLargeTransfers(user, amount) {
  const avg = calculateAvgTransaction(user);
  const recent2min = getRecentTransactions(user, 2).filter(tx => tx.amt > avg * 1.4);
  const recent3min = getRecentTransactions(user, 3).filter(tx => tx.amt > avg * 1.4);
  const total3min = recent3min.reduce((s, t) => s + t.amt, 0);
  const bal = user.balance;
  
  if (recent3min.length >= 4 && total3min > bal * 0.4) {
    return {
      risk: 38,
      signal: `Multiple rapid transfers: ${recent3min.length} large payments totalling ₹${total3min.toLocaleString()} in 3 minutes.`
    };
  }
  if (recent2min.length >= 3 && total3min > bal * 0.35) {
    return {
      risk: 22,
      signal: `${recent2min.length} large payments in 2 minutes — monitoring.`
    };
  }
  return { risk: 0, signal: null };
}

function calculateRisk(user, amount, receiverNum) {
  let risk = 0;
  const signals = [];
  const bal = user.balance;
  const avg = calculateAvgTransaction(user);

  // 1. Micro-payment attack
  const micro = checkMicroPaymentAttack(user);
  if (micro.attack) {
    risk += micro.risk;
    signals.push(micro.signal);
    incRecipientRisk(receiverNum);
    return { risk, signals, action: 'cooldown' };
  }

  // 2. Rapid large transfers
  const rapid = checkRapidLargeTransfers(user, amount);
  if (rapid.risk > 0) {
    risk += rapid.risk;
    signals.push(rapid.signal);
    incRecipientRisk(receiverNum);
  }

  // 3. Balance drain
  const balPct = (amount / Math.max(bal, 1)) * 100;
  if (balPct > 80) {
    risk += 30;
    signals.push(`This transaction drains ${balPct.toFixed(0)}% of your balance.`);
  } else if (balPct > 65) {
    risk += 16;
    signals.push(`Large transfer: ${balPct.toFixed(0)}% of your current balance.`);
  }

  // 4. Recipient checks
  const inUPI = receiverNum in USERS;
  const inContacts = receiverNum in (user.contacts || {});
  const inHistory = user.known_recipients?.has(receiverNum) || false;

  if (!inUPI) {
    signals.push("ℹ️ Sending to a number outside the UPI network — verify before proceeding.");
  } else if (!inContacts && !inHistory) {
    risk += 8;
    signals.push("New recipient — not seen in your contacts or history.");
  }

  // ===== NEW: Verified identity trust bonus =====
  if (inUPI && USERS[receiverNum] && USERS[receiverNum].verified) {
    risk = Math.max(0, risk - 5);
  }

  // 5. Daily spending
  const spentToday = getDailySpent(user);
  const startBal = Math.max(bal + spentToday, 1);
  const dailyPct = ((spentToday + amount) / startBal) * 100;
  if (dailyPct >= 88) {
    risk += 15;
    signals.push(`Daily spending would reach ${dailyPct.toFixed(0)}% of your starting balance.`);
  } else if (dailyPct >= 75) {
    risk += 7;
    signals.push(`Daily spending at ${dailyPct.toFixed(0)}% of starting balance.`);
  }

  // 6. Recipient risk registry
  const recRisk = getRecipientRisk(receiverNum);
  if (recRisk >= 4) {
    risk += 18;
    signals.push(`⚠️ Recipient flagged in ${recRisk} suspicious patterns network-wide.`);
  } else if (recRisk >= 2) {
    risk += 8;
    signals.push(`Recipient has ${recRisk} previous flagged pattern(s).`);
  }

  // 7. Odd hour
  if (isOddHour() && risk > 0) {
    risk += 8;
    signals.push(`Late-night transaction (${ODD_HOUR_START}AM–${ODD_HOUR_END}AM).`);
  }

  // 8. Behavioural deviation
  const behav = behaviouralDeviation(user, amount);
  risk += behav.risk;
  signals.push(...behav.signals);

  // ===== NEW: Dynamic High-Value Detection (age-based threshold) =====
  const hv = checkHighValueTransaction(user, amount);
  if (hv.isHighValue) {
    risk += hv.risk;
    signals.push(hv.signal);
  }

  // ===== NEW: Behavioral Biometrics signal =====
  const bio = getBiometricRisk(user.number);
  if (bio.risk > 0) {
    risk += bio.risk;
    if (bio.signal) signals.push(bio.signal);
  }

  // ===== NEW: Context-Aware Score Modifier =====
  const ctx = getContextScore(user, amount, receiverNum);
  risk += ctx.contextScore;
  signals.push(...ctx.contextSignals);

  // 9. Trust reduction for contacts
  let finalRisk = risk;
  if (receiverNum in (user.contacts || {})) {
    finalRisk = Math.floor(risk * 0.75);
  } else if (user.known_recipients?.has(receiverNum)) {
    finalRisk = Math.floor(risk * 0.88);
  }

  // 10. Scam pattern
  const scam = scamPatternCheck(user, amount, receiverNum);
  finalRisk += scam.risk;
  signals.push(...scam.signals);

  const totalRisk = user.risk_score + finalRisk;

  if (totalRisk >= RISK_OTP) {
    return { risk: finalRisk, signals, action: 'otp', requiresDelay: needsSmartDelay(user, amount) };
  }
  if (totalRisk >= RISK_INFO) {
    return { risk: finalRisk, signals, action: 'info', requiresDelay: needsSmartDelay(user, amount) };
  }
  return { risk: finalRisk, signals, action: 'allow', requiresDelay: needsSmartDelay(user, amount) };
}

/* ═══ FREEZE MANAGEMENT ═══ */
function checkFrozen(user) {
  if (user.permanent_frozen) {
    return { frozen: true, message: "Your account is locked. Please visit a branch to reactivate." };
  }
  if (user.frozen_until && new Date() < new Date(user.frozen_until)) {
    const remaining = Math.ceil((new Date(user.frozen_until) - new Date()) / 1000);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return { frozen: true, message: `Account paused for your safety. Try again in ${mins}m ${secs}s.`, remaining };
  }
  return { frozen: false };
}

function checkCooldown(user) {
  if (user.cooldown_until && new Date() < new Date(user.cooldown_until)) {
    const remaining = Math.ceil((new Date(user.cooldown_until) - new Date()) / 1000);
    return { cooldown: true, remaining };
  }
  return { cooldown: false };
}

function applyCooldown(user, reason) {
  user.cooldown_until = new Date(Date.now() + COOLDOWN_SEC * 1000).toISOString();
  user.blocked_attempts = (user.blocked_attempts || 0) + 1;
  return { cooldown: true, remaining: COOLDOWN_SEC, reason };
}

function recordBlock(user) {
  const now = new Date();
  if (!user.recent_blocks) user.recent_blocks = [];
  user.recent_blocks.push(now);
  user.recent_blocks = user.recent_blocks.filter(t => 
    (now - new Date(t)) / 1000 <= FREEZE_WINDOW_SEC
  );
  return user.recent_blocks.length >= FREEZE_BLOCK_COUNT;
}

function recordBypassAttempt(user) {
  user.bypass_attempts = (user.bypass_attempts || 0) + 1;
  return user.bypass_attempts >= 3;
}

function freezeAccount(user, reason, minutes = 5) {
  const today = new Date().toDateString();
  if (!user.daily_freeze_log) user.daily_freeze_log = [];
  
  const todayFreezes = user.daily_freeze_log.filter(d => 
    new Date(d).toDateString() === today
  ).length;
  
  if (todayFreezes >= MAX_DAILY_FREEZE) {
    user.permanent_frozen = true;
    return { frozen: true, permanent: true, message: "Multiple suspicious activities detected today. Please visit your nearest branch." };
  }
  
  user.daily_freeze_log.push(new Date().toISOString());
  user.freeze_count = (user.freeze_count || 0) + 1;
  user.frozen_until = new Date(Date.now() + minutes * 60000).toISOString();
  user.blocked_attempts = (user.blocked_attempts || 0) + 1;
  
  return { 
    frozen: true, 
    minutes, 
    message: reason,
    remainingToday: MAX_DAILY_FREEZE - todayFreezes - 1
  };
}

function emergencyLock(user) {
  user.permanent_frozen = true;
  user.freeze_count = (user.freeze_count || 0) + 1;
  if (!user.daily_freeze_log) user.daily_freeze_log = [];
  user.daily_freeze_log.push(new Date().toISOString());
  return { locked: true };
}

// ===== NEW FEATURE: Behavioral Biometrics Tracker =====
// Passively tracks typing speed, click intervals, session timing
// Stores baseline per user and detects deviations silently
const BiometricBaseline = new Map();

function recordInteraction(userNum, type = 'click') {
  const now = Date.now();
  if (!BiometricBaseline.has(userNum)) {
    BiometricBaseline.set(userNum, { interactions: [], sessionStart: now, avgInterval: null, lastInteraction: null });
  }
  const b = BiometricBaseline.get(userNum);
  if (b.lastInteraction) {
    const interval = now - b.lastInteraction;
    b.interactions.push({ type, interval, ts: now });
    if (b.interactions.length > 30) b.interactions.shift();
    const ints = b.interactions.map(i => i.interval).filter(i => i > 0 && i < 30000);
    b.avgInterval = ints.length ? ints.reduce((s, x) => s + x, 0) / ints.length : null;
  }
  b.lastInteraction = now;
}

function getBiometricRisk(userNum) {
  const b = BiometricBaseline.get(userNum);
  if (!b || b.interactions.length < 5 || !b.avgInterval) return { risk: 0, signal: null };
  const recent = b.interactions.slice(-5);
  const recentAvg = recent.reduce((s, i) => s + i.interval, 0) / recent.length;
  const deviation = Math.abs(recentAvg - b.avgInterval) / Math.max(b.avgInterval, 1);
  if (deviation > 2.0) return { risk: 8, signal: "Unusual interaction pattern detected (behavioral biometrics)" };
  if (deviation > 1.2) return { risk: 5, signal: null };
  return { risk: 0, signal: null };
}

// ===== NEW FEATURE: Dynamic High-Value Transaction Detection (Age-Based) =====
// Age 20–60: 5× avg threshold. Others (seniors/young): 3× avg threshold
function getHighValueThreshold(user) {
  const avg = calculateAvgTransaction(user);
  const age = user.age || 30;
  return (age >= 20 && age <= 60) ? avg * 5 : avg * 3;
}

function checkHighValueTransaction(user, amount) {
  const avg = calculateAvgTransaction(user);
  const threshold = getHighValueThreshold(user);
  if (amount > threshold) {
    const mult = (amount / Math.max(avg, 1)).toFixed(1);
    return {
      isHighValue: true,
      risk: 20,
      signal: `This transaction (₹${amount.toLocaleString()}) is ${mult}× higher than your usual amount — significantly above your normal behaviour`
    };
  }
  return { isHighValue: false, risk: 0, signal: null };
}

// ===== NEW FEATURE: Smart Delay (10s countdown for high-value) =====
function needsSmartDelay(user, amount) {
  return checkHighValueTransaction(user, amount).isHighValue;
}

// ===== NEW FEATURE: Smart OTP Logic (Adaptive Authentication) =====
function shouldTriggerOTP(user, amount, receiverNum, riskScore) {
  // Admin accounts skip OTP — they have a static OTP (000000) used only at login.
  if (user && user.isAdmin) return false;
  const highValue = checkHighValueTransaction(user, amount).isHighValue;
  const isNewRecipient = !user.known_recipients?.has(receiverNum) && !(receiverNum in (user.contacts || {}));
  const highRisk = riskScore >= 70;
  const biometric = getBiometricRisk(user.number).risk > 0;
  const flaggedRecipient = getRecipientRisk(receiverNum) >= 3;
  // Trusted contact + low risk = reduce OTP requirement
  const isTrusted = (receiverNum in (user.contacts || {})) && riskScore < 50;
  if (isTrusted) return false;
  return highValue || isNewRecipient || highRisk || biometric || flaggedRecipient;
}

// ===== NEW FEATURE: Enhanced Freeze Level System =====
function getFreezeLevel(user) {
  if (user.permanent_frozen) return 5;
  if (user.frozen_until && new Date() < new Date(user.frozen_until)) return 4;
  if ((user.bypass_attempts || 0) >= 2) return 3;
  if ((user.blocked_attempts || 0) >= 3) return 2;
  if ((user.risk_score || 0) >= 60) return 1;
  return 0;
}

function getFreezeLevelLabel(level) {
  const labels = ["Safe","⚠️ Warning","⏳ Delay Active","🔐 OTP Enforced","🚫 Temp Blocked","❄️ Account Frozen"];
  return labels[level] || "Safe";
}

// ===== NEW FEATURE: Context-Aware Score Modifier =====
// Combines time, frequency spike, new recipient, amount anomaly, biometrics
function getContextScore(user, amount, receiverNum) {
  let score = 0;
  const signals = [];
  const hour = new Date().getHours();

  // Time of day (enhanced weight)
  if (hour >= 1 && hour < 5) { score += 12; signals.push("Late-night transaction (1AM–5AM)"); }
  else if (hour >= 22 || hour < 7) { score += 5; }

  // Transaction frequency spike (5 txns in 5 min)
  const recent5 = getRecentTransactions(user, 5);
  if (recent5.length >= 5) { score += 15; signals.push(`Frequency spike: ${recent5.length} transactions in 5 minutes`); }
  else if (recent5.length >= 3) { score += 5; }

  // New recipient flag
  const isNew = !user.known_recipients?.has(receiverNum) && !(receiverNum in (user.contacts || {}));
  if (isNew && !(receiverNum in USERS)) { score += 10; signals.push("New unverified recipient"); }

  // Amount anomaly integration — NOTE: checkHighValueTransaction already adds risk
  // in calculateRisk directly; we do NOT add it again here to avoid double-counting.

  // Biometric signal
  const bio = getBiometricRisk(user.number);
  if (bio.risk > 0) score += bio.risk;

  // Verified recipient trust reduction
  if (receiverNum in USERS && USERS[receiverNum].verified) score = Math.max(0, score - 8);

  return { contextScore: Math.min(score, 35), contextSignals: signals };
}

/* ═══ HELPERS ═══ */