/* ═══ RECIPIENT RISK WARNING COMPONENT — Network-Level Reporting UI ═══ */
function RecipientRiskWarning({recipient, recipientType, userContacts, amount, userObj}){
  const[showWhy, setShowWhy] = useState(false);
  if(!recipient) return null;
  const targetNum = recipientType==='phone' ? recipient
    : (Object.entries(USERS).find(([,v])=>v.upi===recipient)||[])[0] || recipient;
  const rr = getRecipientRisk(targetNum);
  if(rr < 1) return null;

  const isHighRisk = rr > 3;
  const isNewRecipient = !(targetNum in (userContacts||{}));
  const inNetwork = targetNum in USERS;

  // Build explanation using getRiskExplanation if we have user context
  const expl = userObj && amount > 0
    ? getRiskExplanation(userObj, targetNum, amount)
    : null;

  const reasons = [];
  reasons.push(`Reported by ${rr} user${rr!==1?"s":""}`);
  if(isNewRecipient) reasons.push("New recipient — not in your contacts");
  if(!inNetwork) reasons.push("Unknown / off-network account");
  if(expl && expl.reasons.length > 0) {
    expl.reasons.forEach(r => { if(!reasons.some(x=>x.toLowerCase().includes(r.toLowerCase().slice(0,12)))) reasons.push(r); });
  }

  const tags = [];
  tags.push("Reported");
  if(isNewRecipient) tags.push("New Recipient");
  if(!inNetwork) tags.push("Off-Network");

  return(
    <div style={{marginTop:10,animation:"slideDown .25s ease"}}>
      {/* Primary banner */}
      <div style={{padding:"10px 14px",
        background: isHighRisk ? "#450a0a" : "#fef2f2",
        border:`1.5px solid ${isHighRisk?"#dc2626":"#fca5a5"}`,
        borderRadius: showWhy ? "12px 12px 0 0" : 12,
        display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:15,flexShrink:0}}>{isHighRisk?"🚨":"⚠"}</span>
        <span style={{fontSize:13,fontWeight:700,color:isHighRisk?"#fca5a5":"#dc2626",flex:1}}>
          {isHighRisk
            ? `🚨 High-risk recipient — reported ${rr} times`
            : `⚠ Reported ${rr} time${rr!==1?"s":""} in network`}
        </span>
        <button onClick={()=>setShowWhy(w=>!w)}
          style={{background:"none",border:"none",cursor:"pointer",fontSize:11,
            color:isHighRisk?"#fca5a5":"#0078FF",fontWeight:700,
            fontFamily:"'DM Sans',sans-serif",padding:0,whiteSpace:"nowrap"}}>
          {showWhy?"Hide ▲":"Details ▼"}
        </button>
      </div>

      {/* Expandable detail panel */}
      {showWhy && (
        <div style={{padding:"12px 14px",background:"#fff7ed",
          border:"1.5px solid #fdba74",borderTop:"none",
          borderRadius:"0 0 12px 12px"}}>
          <div style={{fontSize:11,fontWeight:800,color:"#92400e",
            textTransform:"uppercase",letterSpacing:.6,marginBottom:8}}>
            🤔 Why is this risky?
          </div>
          {reasons.map((r,i)=>(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:6,
              marginBottom:5,fontSize:12,color:"#92400e",fontWeight:600,lineHeight:1.4}}>
              <span style={{flexShrink:0}}>⚠</span><span>{r}</span>
            </div>
          ))}
          {/* Tag chips */}
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:8}}>
            {tags.map((tag,i)=>{
              const tc=tag==="Reported"?"#dc2626":tag==="New Recipient"?"#f59e0b":"#64748b";
              const tbg=tag==="Reported"?"#fef2f2":tag==="New Recipient"?"#fef3c7":"#f8faff";
              const tbd=tag==="Reported"?"#fca5a5":tag==="New Recipient"?"#fcd34d":"#e2e8f0";
              return(
                <span key={i} style={{display:"inline-flex",alignItems:"center",gap:4,
                  padding:"3px 10px",borderRadius:16,fontSize:11,fontWeight:700,
                  background:tbg,color:tc,border:`1.5px solid ${tbd}`}}>
                  {tag}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ SEND MONEY PAGE with PIN+OTP for suspicious ═══ */
function SendMoneyPage({user,balance,addTx,updateBalance,setPage,updateUser}){
  const[recipient, setRecipient] = useState("");
  const[recipientType, setRecipientType] = useState("phone");
  // -- Scam DB: network-wide check when recipient changes --
  const[networkCheckTick, setNetworkCheckTick] = useState(0);
  React.useEffect(() => {
    const info = getRecipientInfo();
    const numToCheck = info.targetNum || recipient;
    if (!numToCheck || numToCheck.length < 10) return;
    const t = setTimeout(() => {
      checkRecipientNetworkRisk(numToCheck)
        .then(() => setNetworkCheckTick(x => x + 1));
    }, 400);
    return () => clearTimeout(t);
  }, [recipient, recipientType]);
  const[amt, setAmt] = useState("");
  const[note, setNote] = useState("");
  const[stage, setStage] = useState("form");
  const[riskData, setRiskData] = useState({score:0,signals:[], action:'allow', tier:'normal', risk:0});
  // ── Stage 2: Fraud Intelligence Layer state ────────────────────────────────
  const[fraudIntelData,  setFraudIntelData]  = useState(null);   // Stage 2 result
  const[fraudIntelLoading, setFraudIntelLoading] = useState(false);
  const[mergedRisk, setMergedRisk] = useState(null);             // blended final score
  // ── Security monitor state ────────────────────────────────────────────────
  const[securityStatus, setSecurityStatus] = useState(
    window._ironWalletSecurity || { vpn:{checking:true,detected:false}, screenRecording:{detected:false} }
  );
  const[securityBannerDismissed, setSecurityBannerDismissed] = useState(false);
  // -- Cooling period state (90+ forces 30s wait before PIN) --
  const[showCooling, setShowCooling] = useState(false);
  React.useEffect(() => {
    if (window.onSecurityStatusChange) {
      window.onSecurityStatusChange(s => {
        setSecurityStatus({...s});
        setSecurityBannerDismissed(false);
      });
    }
  }, []);
  // ── PIN Timeout feature ───────────────────────────────────────────────────
  const PIN_TIMEOUT_MS  = 5 * 60 * 1000;                        // 5 minutes
  const lastActivityRef = React.useRef(Date.now());             // tracks last user action
  const[pinTimeoutActive, setPinTimeoutActive] = useState(false); // shows re-auth modal
  const[pendingAfterReauth, setPendingAfterReauth] = useState(null); // fn to run after reauth

  // Update lastActivity on any user interaction
  React.useEffect(() => {
    const update = () => { lastActivityRef.current = Date.now(); };
    const events = ["mousemove","keydown","touchstart","click","scroll"];
    events.forEach(e => window.addEventListener(e, update, { passive:true }));
    return () => events.forEach(e => window.removeEventListener(e, update));
  }, []);

  // Check if session has timed out; if so, show re-auth PIN and queue fn
  function checkPinTimeout(andThen) {
    const idle = Date.now() - lastActivityRef.current;
    if (idle >= PIN_TIMEOUT_MS) {
      setPendingAfterReauth(() => andThen);
      setPinTimeoutActive(true);
      return true;          // timed out — blocked
    }
    return false;           // still active — proceed
  }

  function handleReauthSuccess() {
    setPinTimeoutActive(false);
    lastActivityRef.current = Date.now();
    if (pendingAfterReauth) { pendingAfterReauth(); }
    setPendingAfterReauth(null);
  }

  function handleReauthCancel() {
    setPinTimeoutActive(false);
    setPendingAfterReauth(null);
  }
  const[prog, setProg] = useState(0);
  const[lastTx, setLastTx] = useState(null);
  const[balErr, setBalErr] = useState("");
  const[recipientErr, setRecipientErr] = useState(""); // FEATURE: mobile validation error
  const[showCooldown, setShowCooldown] = useState(false);
  const[cooldownData, setCooldownData] = useState(null);
  const[showFreeze, setShowFreeze] = useState(false);
  const[freezeData, setFreezeData] = useState(null);
  // ===== NEW: Smart Delay state =====
  const[showSmartDelay, setShowSmartDelay] = useState(false);
  // === Out-of-Band Verification Feature: modal state ===
  const[showOOBModal, setShowOOBModal] = useState(false);
  // ===== FEATURE: Duplicate Payment Warning — tracks recent same-amount/to recipient txs =====
  const[recentTxTimestamps, setRecentTxTimestamps] = useState([]); // [{toNum, amt, ts}]
  const[showDupWarning, setShowDupWarning] = useState(false);

  // ===== NEW: Record biometric interactions on mount and interactions =====
  useEffect(() => { recordInteraction(user.number, 'page_load'); }, [user.number]);

  useEffect(() => {
    const frozen = checkFrozen(user);
    if (frozen.frozen) {
      setFreezeData(frozen);
      setShowFreeze(true);
      return;
    }
    const cooldown = checkCooldown(user);
    if (cooldown.cooldown) {
      setCooldownData(cooldown);
      setShowCooldown(true);
    }
  }, [user]);

  const parsedAmt = parseFloat(amt)||0;
  const isInsufficient = parsedAmt>0 && parsedAmt>balance;

  const getRecipientInfo = () => {
    if (!recipient) return { name: "", targetNum: "", inUPI: false, inContacts: false, inHistory: false };
    let targetNum = recipient;
    if (recipientType === 'upi') {
      const u = Object.entries(USERS).find(([,v]) => v.upi === recipient);
      if (u) targetNum = u[0];
    }
    const inUPI = targetNum in USERS;
    const inContacts = targetNum in (user.contacts || {});
    const inHistory = user.known_recipients?.has(targetNum) || false;
    const name = inUPI ? USERS[targetNum].name : (inContacts ? user.contacts[targetNum] : recipient);
    return { name, targetNum, inUPI, inContacts, inHistory };
  };

  const isFormReady = recipient && amt && parsedAmt>0 && !isInsufficient && (recipientType==="upi" || recipient.replace(/\D/,"").length===10);

  function handleAmtChange(v){
    recordInteraction(user.number, 'amount_input'); // biometrics
    setAmt(v);
    setBalErr("");
  }

  // ===== FEATURE: Duplicate Payment Warning handlers =====
  function handleDupWarningProceed() {
    setShowDupWarning(false);
    // Record this attempt in recent timestamps so subsequent checks within 4 mins will trigger again
    const { targetNum } = getRecipientInfo();
    setRecentTxTimestamps(prev => [...prev, { toNum: targetNum || recipient, amt: parsedAmt, ts: Date.now() }]);
    // Resume risk analysis
    const { targetNum: tn } = getRecipientInfo();
    setStage("analyzing");
    setProg(0);
    const t = setInterval(() => setProg(p => { if(p>=92){ clearInterval(t); return 92; } return p + 7; }), 80);
    setTimeout(() => {
      clearInterval(t); setProg(100);
      const ruleResult = calculateRisk(user, parsedAmt, tn || recipient);
      if (ruleResult.action === 'cooldown') {
        const cd = applyCooldown(user, ruleResult.signals[0]);
        setCooldownData(cd); setShowCooldown(true); setStage("form"); return;
      }
      const mlProb = mlFraudScore(user, parsedAmt, tn || recipient);
      const mlSignals = []; let mlAdj = 0;
      if (mlProb !== null) {
        if (mlProb > 0.80) { mlSignals.push("\uD83E\uDD16 ML model: " + Math.round(mlProb*100) + "% fraud probability."); mlAdj = Math.round(mlProb * 25); }
        else if (mlProb > 0.50) { mlSignals.push("\uD83E\uDD16 ML model flagged: " + Math.round(mlProb*100) + "% fraud probability."); mlAdj = Math.round(mlProb * 18); }
        else if (mlProb < 0.15) { mlAdj = -8; }
      }
      const score = ruleResult.score + mlAdj;
      const tier = score >= RISK_OTP ? 'otp' : score >= RISK_INFO ? 'info' : 'normal';
      const action = ruleResult.action === 'block' ? 'block' : tier === 'otp' ? 'otp' : tier === 'info' ? 'info' : 'allow';
      setRiskData({ score, signals: [...ruleResult.signals, ...mlSignals], action, tier, risk: ruleResult.risk });
      // ── 4-tier routing ──────────────────────────────────────────────
      if (score <= RISK_SILENT) {
        setStage("pin");
      } else if (score < RISK_SCREEN) {
        setStage("popup");
      } else {
        setStage("risk");
        _runFraudIntelligence(score, user, parsedAmt, targetNum || recipient);
      }
      }, 600);
  }

  // ── Stage 2: async Fraud Intelligence Layer caller ─────────────────────────
  async function _runFraudIntelligence(jsBehaviorScore, user, amount, recipientId, extras={}) {
    setFraudIntelData(null);
    setMergedRisk(null);
    setFraudIntelLoading(true);

    /* ── Build shared transaction payload ─────────────────────────────── */
    const inContacts    = recipientId in (user.contacts || {});
    const inHistory     = user.known_recipients?.has(recipientId) || false;
    const avg           = calculateAvgTransaction(user);
    const spentToday    = getDailySpent(user);
    const recentTxAmts  = (user.transactions || []).slice(-5).map(t => t.amt).filter(Boolean);
    const now           = new Date();
    const dayNames      = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const isKnownUser   = Object.values(USERS||{}).some(
      u => u.number === recipientId || u.upi === recipientId
    );

    const txPayload = {
      user_id:                   user.number || "",
      amount,
      hour_of_day:               now.getHours(),
      day_of_week:               dayNames[now.getDay()],
      is_weekend:                [0,6].includes(now.getDay()) ? 1 : 0,
      is_salary_period:          (now.getDate() >= 1 && now.getDate() <= 5) ? 1 : 0,
      merchant_name:             "",
      merchant_category:         "Transfer",
      recipient_type:            (!inContacts && !inHistory) ? "individual" : "merchant",
      payment_method:            "UPI",
      device_familiarity:        1.0,
      location_familiarity:      1.0,
      balance_before:            Math.max(user.balance + amount, amount),
      account_age_days:          365,
      recipient_frequency_score: (inContacts || inHistory) ? 0.8 : 0.0,
      days_since_recipient_seen: inHistory ? 3 : 999,
      merchant_frequency_score:  isKnownUser ? 0.8 : 0.3,
      txn_velocity_1h:           getRecentTransactions(user, 60).length,
      txn_velocity_5m:           getRecentTransactions(user, 5).length,
      txn_velocity_24h:          getRecentTransactions(user, 1440).length,
      amount_velocity_24h:       spentToday,
      unique_recipients_30m:     1,
      recent_amounts:            recentTxAmts,
      daily_spend_today:         spentToday,
      ...extras,
    };

    const profilePayload = {
      user_id:         user.number || "",
      avg_amount:      avg   || 1000,
      daily_avg_spend: (avg * 3) || 3000,
    };

    /* ── Strategy: try /analyze first (real IF + FIL in one call) ──────
       Falls back to separate /fraud-intelligence call using the JS
       behavior score if the /analyze endpoint is unavailable.          */
    let finalBehaviorScore = jsBehaviorScore;
    let intelResult        = null;
    let mergedResult       = null;

    try {
      const combined = await callAnalyze(txPayload, profilePayload);

      if (combined && combined.stage1 && combined.stage2) {
        /* ✅ Real two-stage pipeline from server */
        finalBehaviorScore = combined.stage1.behavior_score;
        intelResult        = combined.stage2;
        mergedResult = {
          finalScore: combined.final.score,
          stage1:     combined.stage1.behavior_score,
          stage2:     combined.stage2.fraud_score,
          delta:      combined.final.score - combined.stage1.behavior_score,
          riskLevel:  combined.final.risk_level,
        };
      } else {
        throw new Error("Incomplete /analyze response");
      }
    } catch (_) {
      /* ⚠ Fallback: use JS behavior score + Stage 2 only */
      intelResult  = await callFraudIntelligence(jsBehaviorScore, txPayload, profilePayload);
      mergedResult = mergeFinalRisk(jsBehaviorScore, intelResult);
    }

    setFraudIntelData(intelResult);
    setMergedRisk(mergedResult);
    setFraudIntelLoading(false);
  }

  async function _runFraudIntelligence(jsBehaviorScore, user, amount, recipientId, extras={}) {
    setFraudIntelData(null); setMergedRisk(null); setFraudIntelLoading(true);
    const inContacts   = recipientId in (user.contacts || {});
    const inHistory    = user.known_recipients?.has(recipientId) || false;
    const avg          = calculateAvgTransaction(user);
    const spentToday   = getDailySpent(user);
    const recentTxAmts = (user.transactions || []).slice(-5).map(t=>t.amt).filter(Boolean);
    const now          = new Date();
    const dayNames     = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const txPayload = {
      user_id: user.number || "", amount,
      hour_of_day: now.getHours(),
      day_of_week: dayNames[now.getDay()],
      is_weekend: [0,6].includes(now.getDay()) ? 1 : 0,
      is_salary_period: (now.getDate()>=1 && now.getDate()<=5) ? 1 : 0,
      merchant_category: "Transfer", recipient_type: (!inContacts && !inHistory) ? "individual" : "merchant",
      payment_method: "UPI", device_familiarity: 1.0, location_familiarity: 1.0,
      balance_before: Math.max(user.balance + amount, amount),
      account_age_days: 365,
      recipient_frequency_score: (inContacts || inHistory) ? 0.8 : 0.0,
      days_since_recipient_seen: inHistory ? 3 : 999,
      merchant_frequency_score: 0.5,
      txn_velocity_1h: getRecentTransactions(user, 60).length,
      txn_velocity_5m: getRecentTransactions(user, 5).length,
      txn_velocity_24h: getRecentTransactions(user, 1440).length,
      amount_velocity_24h: spentToday,
      unique_recipients_30m: 1,
      recent_amounts: recentTxAmts,
      daily_spend_today: spentToday,
      recipient_report_count: getRecipientRisk(recipientId || ""),
      is_off_network: !((recipientId||"") in USERS),
      ...extras,
    };
    const profilePayload = {
      user_id: user.number||"", avg_amount: avg||1000, daily_avg_spend: (avg*3)||3000
    };
    let intelResult=null, mergedResult=null;
    try {
      const combined = await callAnalyze(txPayload, profilePayload);
      if (combined?.stage1 && combined?.stage2) {
        intelResult   = {
          ...combined.stage2,
          behavior_signals: combined.stage1.signals || [],
        };
        mergedResult  = {
          finalScore: combined.final.score,
          stage1: combined.stage1.behavior_score,
          stage2: combined.stage2.fraud_score,
          delta: combined.final.score - combined.stage1.behavior_score,
          riskLevel: combined.final.risk_level,
        };
      } else throw new Error("incomplete");
    } catch(_) {
      intelResult  = await callFraudIntelligence(jsBehaviorScore, txPayload, profilePayload);
      mergedResult = mergeFinalRisk(jsBehaviorScore, intelResult);
    }
    const behavioralSignals = (intelResult?.behavior_signals || [])
      .map(s => typeof s === "string" ? s : s.description)
      .filter(Boolean);
    if (behavioralSignals.length) {
      setRiskData(prev => ({
        ...prev,
        signals: [...new Set([...(prev.signals || []), ...behavioralSignals])],
      }));
    }
    setFraudIntelData(intelResult); setMergedRisk(mergedResult); setFraudIntelLoading(false);
  }

  function handleDupWarningCancel() {
    setShowDupWarning(false);
  }

  function analyzeRisk(){
    if(!isFormReady) return;
    // -- Manual freeze guard --
    if (localStorage.getItem("iw_manual_freeze_" + user.number) === "1") {
      setStage("frozen");
      return;
    }
    // ── Manual freeze guard ───────────────────────────────────────
    const _freezeKey = "iw_manual_freeze_" + user.number;
    if (localStorage.getItem(_freezeKey) === "1") {
      setStage("frozen");
      return;
    }
    // ── PIN timeout check ─────────────────────────────────────────────────
    if (checkPinTimeout(() => analyzeRisk())) return;
    if(parsedAmt>balance){
      setBalErr(`Insufficient balance. You have ₹${balance.toLocaleString("en-IN")} available.`);
      return;
    }

    const { targetNum } = getRecipientInfo();
    if (!targetNum && recipientType === 'phone') {
      setBalErr("Invalid recipient number");
      return;
    }

    // ===== FEATURE: Duplicate Payment Warning — check same amount + same recipient within 3 minutes =====
    const FOUR_MINS = 4 * 60 * 1000;
    const now = Date.now();
    const recentDuplicate = recentTxTimestamps.some(tx => tx.toNum === (targetNum || recipient) && tx.amt === parsedAmt && (now - tx.ts) < FOUR_MINS);
    if (recentDuplicate) {
      setShowDupWarning(true); // show warning modal, don't proceed
      return;
    }
    // -- Security monitor signals --
    const _sec = window._ironWalletSecurity || {};
    const _vpnRisk = _sec.vpn && _sec.vpn.detected ? (_sec.vpn.riskScore || 20) : 0;
    const _srRisk = _sec.screenRecording && _sec.screenRecording.detected ? (_sec.screenRecording.riskScore || 15) : 0;
    const _secRisk = Math.min(_vpnRisk + _srRisk, 35);

    // -- Security monitor signals --
    const _sec     = window._ironWalletSecurity || {};
    const _vpnRisk = _sec.vpn && _sec.vpn.detected   ? (_sec.vpn.riskScore   || 20) : 0;
    const _srRisk  = _sec.screenRecording && _sec.screenRecording.detected ? (_sec.screenRecording.riskScore || 15) : 0;
    const _secRisk = Math.min(_vpnRisk + _srRisk, 35);

    setStage("analyzing");
    setProg(0);
    
    const t = setInterval(() => setProg(p => {
      if(p>=92){ clearInterval(t); return 92; }
      return p + 7;
    }), 80);
    setTimeout(() => {
      clearInterval(t); setProg(100);
      const ruleResult = calculateRisk(user, parsedAmt, targetNum || recipient);
      if (ruleResult.action === 'cooldown') {
        const cd = applyCooldown(user, ruleResult.signals[0]);
        setCooldownData(cd); setShowCooldown(true); setStage("form"); return;
      }
      // GBM inference: pure JS tree traversal, synchronous
      const mlProb = mlFraudScore(user, parsedAmt, targetNum || recipient);
      const mlSignals = []; let mlAdj = 0;
      if (mlProb !== null) {
        if (mlProb > 0.80) {
          mlSignals.push("\uD83E\uDD16 ML model: " + Math.round(mlProb*100) + "% fraud probability.");
          mlAdj = Math.round(mlProb * 25); // calibrated: was 40, reduced to prevent over-penalising
        } else if (mlProb > 0.50) {
          mlSignals.push("\uD83E\uDD16 ML model flagged: " + Math.round(mlProb*100) + "% fraud probability.");
          mlAdj = Math.round(mlProb * 18); // calibrated: was 25, reduced to prevent over-penalising
        } else if (mlProb < 0.15) {
          mlAdj = -8; // ML says legit — silently reduce risk, no message shown
        }
      }
      // Keyword Risk Analysis Engine — runs on UPI input
      let kwScore = 0, kwSignals = [], kwMatched = [];
      if (recipientType === 'upi' && recipient) {
        const kwResult = analyzeUPIKeywords(recipient);
        kwScore   = kwResult.keywordScore;
        kwSignals = kwResult.signals;
        kwMatched = kwResult.matchedKeywords;
      }
      // If resolved by phone the recipient UPI is available too
      const resolvedUPI = targetNum && USERS[targetNum] ? USERS[targetNum].upi : null;
      if (recipientType === 'phone' && resolvedUPI && kwScore === 0) {
        const kwResult = analyzeUPIKeywords(resolvedUPI);
        kwScore   = kwResult.keywordScore;
        kwSignals = kwResult.signals;
        kwMatched = kwResult.matchedKeywords;
      }

      // === Urgency Detection Feature ===
      // Run urgency scan on both payment note and recipient UPI ID.
      // The resolved UPI (if phone mode) is used as fallback.
      const urgencyUPI = recipientType === 'upi' ? recipient : (resolvedUPI || '');
      const urgencyResult = detectUrgency(note, urgencyUPI);
      // Blend urgency score: small weight (+0.08) nudges risk without dominating
      const urgencyAdj = Math.round(urgencyResult.urgencyScore * 8); // max +8 pts
      // === End Urgency Detection Feature ===

      const totalRisk = Math.min(100, Math.max(0, user.risk_score + ruleResult.risk + mlAdj + kwScore + urgencyAdj + _secRisk));
      let tier = 'normal';
      if      (totalRisk >= RISK_OTP)    tier = 'otp';
      else if (totalRisk >= RISK_SCREEN) tier = 'info';
      else if (totalRisk >= RISK_POPUP)  tier = 'popup';

      // ── Signal deduplication: keep ONLY the single most severe amount-based signal ──
      // Patterns cover: calculateRisk balance-drain, behaviouralDeviation z-score,
      // scamPatternCheck large-amount, and checkHighValueTransaction outputs.
      // === Urgency Detection Feature ===
      // If urgency keywords were found, append warning signal into the insight list
      const urgencySignals = urgencyResult.urgencyScore > 0
        ? ["⚠️ This request uses urgency tactics often seen in scams — take a moment to verify"]
        : [];
      // === End Urgency Detection Feature ===

      let _secSignals = [];
      if (_sec.vpn && _sec.vpn.detected)
        _secSignals.push('[VPN] ' + (_sec.vpn.reason || 'VPN detected'));
      if (_sec.screenRecording && _sec.screenRecording.detected)
        _secSignals.push('[Recording] ' + (_sec.screenRecording.reason || 'Screen recording detected'));
      let allSignals = [...ruleResult.signals, ...mlSignals, ..._secSignals, ...kwSignals, ...urgencySignals];
      const amountSignalPriority = [
        /This transaction drains \d+% of your balance/i,
        /Large transfer:.*of your current balance/i,
        /Amount.*is unusually far outside your typical range/i,
        /Amount ₹[\d,]+ is (much higher|higher) than your usual/i,
        /This transaction.*is.*higher than your usual amount/i,
        /Large transaction for.*your age group/i,
        /High.?value transaction/i,
        /\d+(\.\d+)?× (your avg|higher than)/i,
      ];
      // Priority order: drain > large-transfer > z-score > scam-amount > high-value
      // Keep whichever appears first in the priority list; suppress the rest.
      let keptAmountSignal = null;
      const kept = [];
      for (const s of allSignals) {
        const isAmt = amountSignalPriority.some(rx => rx.test(s));
        if (!isAmt) { kept.push(s); continue; }
        if (!keptAmountSignal) { keptAmountSignal = s; kept.push(s); }
        // else: duplicate amount signal — drop silently
      }
      allSignals = kept;

      setRiskData({
        score: totalRisk,
        signals: allSignals,
        action: ruleResult.action, tier, risk: ruleResult.risk,
        kwMatched, kwScore,
        // === Urgency Detection Feature: persist urgency hits for UI rendering ===
        urgencyHits: urgencyResult.urgencyHits,
        urgencyScore: urgencyResult.urgencyScore
      });
      // ── 4-tier routing ──────────────────────────────────────────────────────────────────
      if (totalRisk <= RISK_SILENT) {
        setStage("pin");
      } else if (totalRisk < RISK_SCREEN) {
        setStage("popup");
        // Enrich even moderate warnings with the server-side history-aware
        // behavioral review; the user sees reasons, not internal scores.
        _runFraudIntelligence(totalRisk, user, parsedAmt, targetNum || recipient, {
          urgency_score:          urgencyResult.urgencyScore || 0,
          recipient_report_count: getRecipientRisk(targetNum || recipient),
          is_off_network:         !((targetNum || recipient) in USERS),
        });
      } else {
        setStage("risk");
        _runFraudIntelligence(totalRisk, user, parsedAmt, targetNum || recipient, {
          urgency_score:          urgencyResult.urgencyScore || 0,
          recipient_report_count: getRecipientRisk(targetNum || recipient),
          is_off_network:         !((targetNum || recipient) in USERS),
        });
      }   // end 4-tier routing

      // ── WebSocket: broadcast fraud_alert when risk ≥ 85 ──────────────
      if (totalRisk >= RISK_OTP && window._ptSocket?.connected) {
        const { targetNum: tn } = getRecipientInfo();
        window._ptSocket.emit("fraud_alert", {
          userNumber:      user.number,
          riskScore:       totalRisk,
          amount:          parsedAmt,
          recipientNumber: tn || "",
          reason:          allSignals.slice(0,2).join("; ") || "High risk payment",
        });
        console.log("[IronWallet WS] 🚨 fraud_alert emitted, score:", totalRisk);
      }
      // ─────────────────────────────────────────────────────────────────
    }, 1600);
  }

  async function handleVerify(){
    // -- Cooling period gate (score >= 90): forces 30s wait before PIN --
    if (riskData.score >= RISK_COOLING && !showCooling) {
      setShowCooling(true);
      return;   // CoolingPeriodModal will call handleVerify() again after countdown
    }
    setShowCooling(false);
    // === Self-payment guard: users cannot pay themselves ===
    const { targetNum } = getRecipientInfo();
    if (targetNum && targetNum === user.number) {
      alert("❌ Self-payment is not allowed. Please enter a different recipient.");
      return;
    }

    // === VPN Detection Check ===
    // Run this check before any payment or request
    const vpnCheck = await checkVPNDetection(user.number);
    if (vpnCheck.vpnDetected && vpnCheck.blocked) {
      alert("VPN detected. Please turn off VPN to proceed with payment.");
      return;
    }

    // === Location jump: show popup only, does NOT affect risk score ===
    // Only run if location permission was granted at login
    if (GeoDeviceBaseline.location_enabled) {
      const freshLoc = await getFreshLocation();
      const travelCheck = checkImpossibleTravel(
        user.number,
        freshLoc.lat,
        freshLoc.lng,
        Date.now()
      );
      if (travelCheck.triggered && travelCheck.risk_level === "popup") {
        const confirmed = confirm(
          travelCheck.reason
            ? travelCheck.reason
            : "Unusual location change detected.\nPlease confirm this activity."
        );
        if (!confirmed) {
          setStage("form");
          setRecipient("");
          setAmt("");
          setNote("");
          return;
        }
      }
    }

    // === Out-of-Band Verification Feature ===
    // Trigger the OOB modal BEFORE PIN/OTP if:
    //   (a) risk score > 75, OR
    //   (b) recipient is unknown to contacts AND amount is ≥ ₹2000
    const { inContacts, inHistory } = getRecipientInfo();
    const isUnknownContact = !inContacts && !inHistory;
    // Removed OOB Modal trigger to streamline flow
    /*
    const shouldShowOOB = riskData.score > 75 || (isUnknownContact && parsedAmt >= 2000);
    if (shouldShowOOB) {
      setShowOOBModal(true);
      return; // halt here — user must explicitly choose to proceed or cancel
    }
    */
    // === End Out-of-Band Verification Feature ===

    // ===== NEW: Show smart delay if high-value transaction =====
    if (riskData.requiresDelay) {
      setShowSmartDelay(true);
    } else {
      setStage("pin");
    }
  }

  // === Out-of-Band Verification Feature: handlers for the OOB modal ===
  function handleOOBProceed() {}

  function handleOOBCancel() {}
  // === End Out-of-Band Verification Feature ===

  function handleSmartDelayConfirm(){
    setShowSmartDelay(false);
    setStage("pin");
  }

  function handlePINSuccess() {
    const requiresOTP = riskData.tier === 'otp' || riskData.tier === 'high_risk';
    // ===== NEW: Also trigger OTP via smart OTP logic =====
    const smartOTP = shouldTriggerOTP(user, parsedAmt, getRecipientInfo().targetNum || recipient, riskData.score);
    if (requiresOTP || smartOTP) {
      setStage("otp");
    } else {
      completePayment();
    }
  }

  function handleOTPSuccess(otp) {
    setRiskData(prev => ({ ...prev, otpValue: otp }));
    completePayment();
  }

  const [reportModal, setReportModal] = useState(null); // null | target number

  function handleReport() {
    const { targetNum } = getRecipientInfo();
    if (targetNum) {
      setReportModal(targetNum);
    }
  }

  function completeReport(reason) {
    const { targetNum } = getRecipientInfo();
    if (targetNum) {
      reportRecipient(user.number, targetNum, parsedAmt, reason);
    }
    setReportModal(null);
    setStage("form");
    setRecipient("");
    setAmt("");
    setNote("");
  }

  function cancelReport() {
    setReportModal(null);
  }

  async function cancelPayment() {
    const transactionId = riskData.transaction_id || riskData.preparedId;
    if (transactionId) {
      try {
        await fetch(`${API}/security/ledger/events`, {
          method: "POST",
          headers: {...getAuthHeader(), "Content-Type": "application/json"},
          body: JSON.stringify({event_type: "PAYMENT_CANCELLED", transaction_id: transactionId, reason: "user_cancelled"})
        });
      } catch (e) {
        console.warn("[IRON] cancellation ledger event failed:", e);
      }
    }
    setRiskData({score:0, signals:[], action:"allow"});
    setStage("form");
  }

  async function completePayment(){
    const a = parsedAmt;
    const { date, time } = nowStamp();
    const { targetNum, name } = getRecipientInfo();
    // A completed payment must come from the backend prepare/confirm flow.
    // Local state is only a projection after the backend confirms success.
    if (!riskData.transaction_id && !riskData.preparedId) {
      setBalErr("Payment preparation has expired. Please assess the payment again.");
      setStage("form");
      return;
    }
    try {
      const hdr = getAuthHeader();
      const res = await fetch(`${API}/transactions/confirm`, {
        method: "POST",
        headers: {...hdr, "Content-Type": "application/json"},
        body: JSON.stringify({transaction_id: riskData.transaction_id || riskData.preparedId, otp: riskData.otpValue || null})
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.duplicate) throw new Error(data.error || data.detail || "Transaction confirmation failed.");
      if (data.balance != null) updateBalance(() => Number(data.balance));
      const confirmedTx = {
        id: data.transaction_id || riskData.transaction_id || riskData.preparedId,
        to: name || recipient,
        toNum: targetNum || recipient,
        amt: a,
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toISOString().slice(11, 16),
        risk: data.risk_score ?? riskData.score,
        status: data.status === "HIGH_RISK" ? "high_risk" : "success",
        type: "debit",
        note: note || "Payment",
        isNew: true,
        risk_tag: (data.risk_tier || riskData.tier || "normal").toLowerCase(),
        otp_used: !!riskData.otpValue
      };
      addTx(confirmedTx);
      setLastTx(confirmedTx);
      setStage("success");
      return;
    } catch (e) {
      setBalErr(e.message || "Transaction confirmation failed.");
      setStage("form");
      return;
    }
    
    const otpUsed = riskData.tier === 'otp' || riskData.tier === 'high_risk';
    const status = riskData.tier === 'high_risk' ? 'verified' : 'success';
    
    const _gdMeta = getTxGeoDeviceMeta();
    const _locationDisplay = MockLocation.active
      ? MockLocation.label
      : (_gdMeta.location || null);
    const tx = {
      id: Date.now(),
      to: name || recipient,
      toNum: targetNum || recipient,
      upi: recipientType === 'upi' ? recipient : (USERS[targetNum]?.upi || ''),
      amt: a,
      date, time,
      risk: riskData.score,
      status,
      type: "debit",
      note: note || "Payment",
      isNew: true,
      risk_tag: riskData.tier,
      otp_used: otpUsed,
      location: _locationDisplay,
      device: _gdMeta.device,
      new_device: _gdMeta.isNewDevice,
    };
    
    addTx(tx);
    updateBalance(b => b - a);

    // ===== FEATURE: Record this payment for duplicate warning detection (4-min window) =====
    setRecentTxTimestamps(prev => {
      const cutoff = Date.now() - 4 * 60 * 1000;
      const pruned = prev.filter(tx => tx.ts > cutoff);
      return [...pruned, { toNum: targetNum || recipient, amt: a, ts: Date.now() }];
    });

    // ── WebSocket: real-time push to recipient ────────────────────────
    if (window._ptSocket?.connected && targetNum && targetNum in USERS) {
      window._ptSocket.emit(
        "send_payment",
        {
          fromNumber: user.number,
          toNumber:   targetNum,
          amount:     a,
          txId:       tx.id,
          timestamp:  new Date().toISOString(),
          note:       note || "Payment",
        },
        (ack) => {
          if (ack?.delivered) {
            console.log("[IronWallet WS] ✅ Delivered to", targetNum);
          } else {
            console.log("[IronWallet WS] ℹ️ Recipient offline — local tx recorded");
          }
        }
      );
      console.log("[IronWallet WS] 📤 send_payment →", targetNum, "₹" + a);
    }
    // ─────────────────────────────────────────────────────────────────

    if (targetNum && targetNum in USERS) {
      USERS[targetNum].balance += a;
    }
    
    if (targetNum) {
      if (!user.known_recipients) user.known_recipients = new Set();
      user.known_recipients.add(targetNum);
    }
    
    user.risk_score = Math.max(0, user.risk_score + riskData.risk - (otpUsed ? OTP_DISCOUNT : 0));
    if (!user.risk_score_history) user.risk_score_history = [];
    user.risk_score_history.push({
      time: new Date(),
      score: user.risk_score,
      amount: a,
      receiver: targetNum,
      action: riskData.action
    });
    
    setLastTx(tx);
    setStage("success");

    // Record location for impossible travel detection on the NEXT transaction.
    const _freshLoc = getFreshLocation().then(loc => {
      recordTxLocation(user.number, loc.lat, loc.lng, Date.now());
    });

    // Record network info for VPN detection on the NEXT transaction.
    getNetworkInfo().then(netInfo => {
      recordTxNetwork(user.number, netInfo);
    });

    if (recordBlock(user)) {
      const freeze = freezeAccount(user, "3 blocked transactions in 5 minutes.");
      setFreezeData(freeze);
      setShowFreeze(true);
    }
  }

  if (showCooldown && cooldownData) {
    return <CooldownModal 
      remaining={cooldownData.remaining}
      reason={cooldownData.reason}
      onClose={() => setShowCooldown(false)}
    />;
  }

  if (showFreeze && freezeData) {
    return <FreezeModal 
      message={freezeData.message || freezeData.reason}
      permanent={freezeData.permanent}
      remaining={freezeData.remaining}
      onClose={() => setShowFreeze(false)}
    />;
  }

  if(stage==="success") return(
    <div className="page-pad page-enter" style={{padding:40,display:"flex",flexDirection:"column",
      alignItems:"center",minHeight:"60vh",justifyContent:"center"}}>
      <div style={{background:"#fff",borderRadius:24,padding:"40px 34px",maxWidth:380,width:"100%",
        boxShadow:"0 20px 56px rgba(0,120,255,.1)",textAlign:"center",animation:"scaleIn .4s cubic-bezier(.16,1,.3,1)"}}>
        <div style={{width:80,height:80,borderRadius:"50%",
          background:"linear-gradient(135deg,#dcfce7,#bbf7d0)",
          display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",
          boxShadow:"0 8px 24px rgba(34,197,94,.2)"}}>
          <svg width="40"height="40"viewBox="0 0 40 40">
            <polyline points="8 20 16 28 32 12"fill="none"stroke="#166534"strokeWidth="3.5"strokeLinecap="round"strokeLinejoin="round"
              strokeDasharray="36"strokeDashoffset="36"style={{animation:"drawCheck .4s .1s ease forwards"}}/>
          </svg>
        </div>
        <h2 style={{color:"#166534",fontSize:22,fontWeight:800,marginBottom:8}}>Payment Successful!</h2>
        <p style={{color:"#64748b",marginBottom:4,fontSize:15}}>
          <b style={{color:"#0f172a"}}>₹{parsedAmt.toLocaleString("en-IN")}</b> sent to
        </p>
        <p style={{color:"#0078FF",fontWeight:700,marginBottom:4,fontSize:14}}>{getRecipientInfo().name || recipient}</p>
        <p style={{color:"#94a3b8",fontSize:12,marginBottom:28}}>Ref: PT{lastTx&&lastTx.id}</p>
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={()=>{setStage("form");setRecipient("");setAmt("");setNote("");setRiskData({score:0,signals:[],action:'allow'});setBalErr("");}} variant="primary" style={{flex:1}}>
            New Payment
          </Btn>
          <Btn onClick={()=>setPage("history")} variant="secondary" style={{flex:1}}>History</Btn>
        </div>
      </div>
    </div>
  );

  return(
    <div className="page-pad page-enter" style={{padding:24,maxWidth:580,margin:"0 auto"}}>
      {/* ===== NEW: Smart Delay Modal for high-value transactions ===== */}
      {showSmartDelay && (
        <SmartDelayModal
          amount={parsedAmt}
          onConfirm={handleSmartDelayConfirm}
          onCancel={() => { setShowSmartDelay(false); setStage("risk"); }}
        />
      )}

      {/* ===== FEATURE: Duplicate Payment Warning Modal ===== */}
      {showDupWarning && (
        <Modal>
          <div style={{background:"#fff",borderRadius:24,padding:"32px 28px",maxWidth:380,width:"100%",
            boxShadow:"0 20px 56px rgba(0,0,0,.18)",textAlign:"center",animation:"scaleIn .3s cubic-bezier(.16,1,.3,1)"}}>
            <div style={{width:72,height:72,borderRadius:"50%",background:"#fef3c7",
              display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px",
              boxShadow:"0 8px 24px rgba(245,158,11,.2)"}}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3 style={{color:"#92400e",fontSize:18,fontWeight:800,marginBottom:10}}>Duplicate Payment Alert</h3>
            <p style={{color:"#78350f",fontSize:14,lineHeight:1.6,marginBottom:24}}>
              You recently sent <strong>₹{parsedAmt.toLocaleString("en-IN")}</strong> to{" "}
              <strong>{getRecipientInfo().name || recipient}</strong>.{" "}
              Please confirm this is intentional.
            </p>
            <div style={{display:"flex",gap:10}}>
              <button onClick={handleDupWarningCancel}
                style={{flex:1,padding:"12px",borderRadius:12,border:"1.5px solid #e2e8f0",
                  background:"#fff",color:"#374151",fontWeight:700,fontSize:14,cursor:"pointer",
                  fontFamily:"'DM Sans',sans-serif"}}>
                Cancel
              </button>
              <button onClick={handleDupWarningProceed}
                style={{flex:1,padding:"12px",borderRadius:12,border:"none",
                  background:"linear-gradient(135deg,#d97706,#b45309)",
                  color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",
                  fontFamily:"'DM Sans',sans-serif",
                  boxShadow:"0 4px 14px rgba(217,119,6,.3)"}}>
                Proceed Anyway
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* === Out-of-Band Verification Feature: modal rendered before PIN/OTP === */}
      {showOOBModal && (
        <OutOfBandVerificationModal
          recipientName={getRecipientInfo().name || recipient}
          recipientNum={getRecipientInfo().targetNum || recipient}
          inContacts={getRecipientInfo().inContacts}
          onProceed={handleOOBProceed}
          onCancel={handleOOBCancel}
        />
      )}
      {/* === End Out-of-Band Verification Feature === */}
      {reportModal && (
        <ReportReasonModal
          onSelect={completeReport}
          onCancel={cancelReport}
        />
      )}
      {/* ── PIN Timeout Re-authentication ─────────────────────────── */}
      {pinTimeoutActive && (
        <PinTimeoutModal
          userPin={user.pin}
          onSuccess={handleReauthSuccess}
          onCancel={handleReauthCancel}
        />
      )}

      {stage==="otp" && (
        <OTPModal
          mobile={user.number}
          onSuccess={handleOTPSuccess}
          onCancel={() => setStage("risk")}
        />
      )}
      {stage==="pin" && (
        <PINModal
          userPin={user.pin}
          user={user}
          onSuccess={handlePINSuccess}
          onCancel={() => setStage("risk")}
        />
      )}

      <div style={{marginBottom:22}}>
        <h2 style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Send Money</h2>
        <p style={{fontSize:14,color:"#64748b"}}>Every transfer is AI-analyzed for fraud in real-time</p>
      </div>

      {/* ── Score 40-74: sticky top-of-page warning banner (single render) ── */}
      {stage==="popup" && (
        <SoftRiskPopup
          score={riskData.score}
          signals={riskData.signals}
          amount={parsedAmt}
          recipient={getRecipientInfo().name || recipient}
          onProceed={() => setStage("pin")}
          onCancel={cancelPayment}
        />
      )}

      {(stage==="form"||stage==="analyzing")&&(
        <Card style={{padding:24}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"14px 16px",background:`linear-gradient(135deg,#0078FF,#0055cc)`,
            borderRadius:14,marginBottom:22,boxShadow:"0 6px 18px rgba(0,120,255,.22)"}}>
            <div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.7)",fontWeight:700,
                textTransform:"uppercase",letterSpacing:.6,marginBottom:4}}>Available Balance</div>
              <div style={{fontSize:22,fontWeight:800,color:"#fff"}}>₹{balance.toLocaleString("en-IN")}</div>
            </div>
            {balance===0&&(
              <div style={{background:"rgba(255,100,100,.25)",padding:"5px 12px",borderRadius:8,
                fontSize:12,fontWeight:700,color:"#fff",border:"1px solid rgba(255,255,255,.2)"}}>
                Zero Balance
              </div>
            )}
          </div>

          <div style={{marginBottom:18}}>
            <div style={{display:"flex",gap:10,marginBottom:10}}>
              <button
                onClick={() => { setRecipientType("phone"); setRecipient(""); setRecipientErr(""); }}
                style={{
                  flex:1,
                  padding:"8px",
                  borderRadius:8,
                  border:recipientType==="phone" ? "2px solid #0078FF" : "1px solid #e2e8f0",
                  background:recipientType==="phone" ? "#e8f1ff" : "#fff",
                  color:recipientType==="phone" ? "#0078FF" : "#64748b",
                  fontWeight:600,
                  cursor:"pointer",
                  fontFamily:"'DM Sans', sans-serif"
                }}
              >
                {Ic.phone(recipientType==="phone"?"#0078FF":"#64748b")} Phone
              </button>
              <button
                onClick={() => { setRecipientType("upi"); setRecipient(""); setRecipientErr(""); }}
                style={{
                  flex:1,
                  padding:"8px",
                  borderRadius:8,
                  border:recipientType==="upi" ? "2px solid #0078FF" : "1px solid #e2e8f0",
                  background:recipientType==="upi" ? "#e8f1ff" : "#fff",
                  color:recipientType==="upi" ? "#0078FF" : "#64748b",
                  fontWeight:600,
                  cursor:"pointer",
                  fontFamily:"'DM Sans', sans-serif"
                }}
              >
                {Ic.send(recipientType==="upi"?"#0078FF":"#64748b")} UPI
              </button>
            </div>
            
            <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:7}}>
              Recipient {recipientType === 'phone' ? 'Mobile Number' : 'UPI ID'}
              <span style={{fontSize:11,fontWeight:500,color:"#94a3b8",marginLeft:8}}>(You are SENDING money to this person)</span>
            </label>
            <input
              value={recipient}
              onChange={e => {
                recordInteraction(user.number,'recipient_input');
                // FEATURE: digit-only for phone type, max 10 digits
                const val = recipientType === 'phone'
                  ? e.target.value.replace(/\D/,"").slice(0,10)
                  : e.target.value;
                setRecipient(val);
                setRecipientErr("");
              }}
              placeholder={recipientType === 'phone' ? "10-digit mobile number" : "example@ironwallet"}
              style={{width:"100%",padding:"12px 14px",borderRadius:12,
                border:`1.5px solid ${recipientErr?"#fca5a5":recipient?"#93c5fd":"#e2e8f0"}`,
                fontSize:14,outline:"none",boxSizing:"border-box",
                color:"#0f172a",background:"#fff",fontFamily:"'DM Sans',sans-serif"}}
            />
            {/* FEATURE: Recipient mobile validation error */}
            {recipientErr && (
              <div style={{marginTop:6,fontSize:12,color:"#dc2626",fontWeight:600,animation:"slideDown .2s ease"}}>
                {recipientErr}
              </div>
            )}
            {recipient && recipientType === 'phone' && recipient in USERS && (
              <div style={{marginTop:6,fontSize:13,color:"#166534",display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                {Ic.check("#166534")} <strong>{USERS[recipient].name}</strong>
                {USERS[recipient].verified && (
                  <span style={{fontSize:11,background:"#e0f2fe",color:"#0369a1",padding:"2px 8px",
                    borderRadius:12,fontWeight:700,display:"flex",alignItems:"center",gap:3}}>
                    ✔ Verified
                  </span>
                )}
                {/* Network report count badge - network-wide */}
                {getRecipientRisk(getRecipientInfo().targetNum||recipient) > 0 && (
                  <span style={{fontSize:11,
                    background: getRecipientTier(getRecipientInfo().targetNum||recipient)==="network_blocked" ? "#450a0a" : "#fef2f2",
                    color: getRecipientTier(getRecipientInfo().targetNum||recipient)==="network_blocked" ? "#fca5a5" : "#dc2626",
                    padding:"2px 9px",borderRadius:12,fontWeight:700,
                    border: getRecipientTier(getRecipientInfo().targetNum||recipient)==="network_blocked" ? "none" : "1px solid #fca5a5"}}>
                    ⚠ Reported {getRecipientRisk(getRecipientInfo().targetNum||recipient)}× network-wide
                  </span>
                )}
                {getRecipientRisk(recipient) > 3 && (
                  <span style={{fontSize:11,background:"#450a0a",color:"#fca5a5",
                    padding:"2px 9px",borderRadius:12,fontWeight:700}}>
                    🚨 High-risk
                  </span>
                )}
              </div>
            )}
            {/* ===== Recipient Risk Warning (network-level reporting) ===== */}
            <RecipientRiskWarning recipient={recipient} recipientType={recipientType} userContacts={user.contacts} amount={parsedAmt} userObj={user}/>
          </div>

          <div style={{marginBottom:18}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
              <label style={{fontSize:12,fontWeight:700,color:"#374151"}}>Amount (₹)</label>
              {isInsufficient&&(
                <span style={{fontSize:11,fontWeight:700,color:"#dc2626",display:"flex",alignItems:"center",gap:4}}>
                  {Ic.warn("#dc2626")} Exceeds balance
                </span>
              )}
            </div>
            <input type="number" value={amt} onChange={e=>handleAmtChange(e.target.value)}
              placeholder="0"
              style={{width:"100%",padding:"12px 14px",borderRadius:12,
                border:`1.5px solid ${isInsufficient?"#fca5a5":amt?"#93c5fd":"#e2e8f0"}`,
                fontSize:24,fontWeight:800,outline:"none",boxSizing:"border-box",
                color:isInsufficient?"#dc2626":"#0f172a",background:isInsufficient?"#fef2f2":"#fff"}}/>
            {isInsufficient&&(
              <div style={{display:"flex",alignItems:"center",gap:7,marginTop:8,padding:"9px 12px",
                background:"#fef2f2",borderRadius:10,border:"1px solid #fca5a5"}}>
                {Ic.warn("#dc2626")}
                <span style={{fontSize:13,color:"#dc2626",fontWeight:600}}>
                  You only have ₹{balance.toLocaleString("en-IN")} available.
                </span>
              </div>
            )}
            <div style={{marginTop:10,display:"flex",gap:7,flexWrap:"wrap"}}>
              {[500,1000,5000,10000].map(v=>(
                <button key={v} onClick={()=>handleAmtChange(String(v))}
                  style={{padding:"5px 12px",background:amt==v?"#e8f1ff":"#f8faff",
                    border:`1.5px solid ${amt==v?"#93c5fd":"#e2e8f0"}`,borderRadius:20,
                    color:amt==v?"#0078FF":"#64748b",cursor:"pointer",fontSize:13,fontWeight:600}}>
                  ₹{v.toLocaleString("en-IN")}
                </button>
              ))}
            </div>
          </div>

          <div style={{marginBottom:22}}>
            <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:7}}>Note (optional)</label>
            <input value={note} onChange={e=>setNote(e.target.value)} placeholder="What's this for?"
              style={{width:"100%",padding:"12px 14px",borderRadius:12,border:"1.5px solid #e2e8f0",
                fontSize:14,outline:"none",boxSizing:"border-box",color:"#0f172a"}}/>
          </div>

          {stage==="analyzing"&&(
            <div style={{marginBottom:20,padding:"16px",background:"#e8f1ff",borderRadius:14,
              border:"1px solid #93c5fd"}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:10}}>
                <span style={{display:"flex",alignItems:"center",gap:7,color:"#0078FF",fontWeight:800}}>
                  {Ic.shield("#0078FF")} Analyzing transaction…
                </span>
                <span style={{fontWeight:800,color:"#0078FF"}}>{Math.round(prog)}%</span>
              </div>
              <div style={{height:6,background:"#dbeafe",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${prog}%`,
                  background:`linear-gradient(90deg,#0078FF,#0055cc)`,
                  borderRadius:3,transition:"width .1s"}}/>
              </div>
              <div style={{display:"flex",gap:7,marginTop:12,flexWrap:"wrap"}}>
                {["History baseline","Spending pattern","Recipient context","Security signals","Decision"].map((s,i)=>(
                  <span key={s} style={{padding:"4px 10px",
                    background:prog>(i+1)*20?"#dbeafe":"#f8faff",
                    border:`1px solid ${prog>(i+1)*20?"#93c5fd":"#e2e8f0"}`,borderRadius:16,
                    fontSize:11,color:prog>(i+1)*20?"#0078FF":"#94a3b8",fontWeight:600,
                    display:"flex",alignItems:"center",gap:5}}>
                    {prog>(i+1)*20?Ic.check("#0078FF"):<svg width="11"height="11"viewBox="0 0 12 12"><circle cx="6"cy="6"r="5"fill="none"stroke="#e2e8f0"strokeWidth="1.5"/></svg>}
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button onClick={analyzeRisk} disabled={!isFormReady||stage==="analyzing"}
            className="btn-primary"
            style={{width:"100%",padding:"14px",fontSize:16,borderRadius:14,border:"none",
              background:(!isFormReady||stage==="analyzing")?"#93c5fd":`linear-gradient(135deg,#0078FF,#0055cc)`,
              color:"#fff",fontWeight:700,
              cursor:(!isFormReady||stage==="analyzing")?"not-allowed":"pointer",
              boxShadow:(!isFormReady||stage==="analyzing")?"none":"0 6px 18px rgba(0,120,255,.28)"}}>
            {stage==="analyzing"?"Analyzing…":"Analyze & Send →"}
          </button>
        </Card>
      )}

                  {/* -- Cooling Period Modal (score 90+) -- */}
      {showCooling && (
        <CoolingPeriodModal
          score={riskData.score}
          signals={riskData.signals}
          recipient={getRecipientInfo().name || recipient}
          amount={parsedAmt}
          onComplete={handleVerify}
          onCancel={() => { setShowCooling(false); setStage("risk"); }}
        />
      )}

      {/* -- Security Warning Banner -- */}
      {!securityBannerDismissed && (
        <SecurityWarningBanner
          status={securityStatus}
          onDismiss={() => setSecurityBannerDismissed(true)}
        />
      )}

      {/* -- Account Frozen Screen -- */}
      {stage==="frozen" && (
        <AccountFrozenScreen
          user={user}
          onUnfreeze={() => setStage("form")}
          onBack={() => setStage("form")}
        />
      )}

      {/* -- PIN Timeout Re-auth -- */}
      {pinTimeoutActive && (
        <PinTimeoutModal userPin={user.pin}
          onSuccess={handleReauthSuccess}
          onCancel={handleReauthCancel} />
      )}

      {stage==="risk" && (
        <>
          {/* ===== FEATURE 2: Behavioral Biometrics alert ===== */}
          {getBiometricRisk(user.number).risk >= 5 && (
            <div style={{padding:"12px 16px",background:"#fff7ed",border:"1px solid #fdba74",
              borderRadius:12,marginBottom:14,display:"flex",alignItems:"center",gap:10,
              animation:"slideDown .3s ease"}}>
              {Ic.warn("#f97316")}
              <span style={{fontSize:13,color:"#92400e",fontWeight:600}}>
                Unusual behavior detected — additional verification applied
              </span>
            </div>
          )}
          <FraudRiskCard
            score={mergedRisk?.finalScore ?? riskData.score}
            recipient={getRecipientInfo().name || recipient}
            recipientNum={getRecipientInfo().targetNum || recipient}
            amount={parsedAmt}
            signals={riskData.signals}
            onVerify={handleVerify}
            onCancel={() => setStage("form")}
            onReport={handleReport}
            tier={riskData.tier}
            kwMatched={riskData.kwMatched || []}
            urgencyHits={riskData.urgencyHits || []}
            urgencyScore={riskData.urgencyScore || 0}
          />
          {/* ── Stage 2: Fraud Intelligence Layer panel ───────────────── */}
          {(fraudIntelLoading || fraudIntelData) && (
            <FraudIntelPanel
              intelResult={fraudIntelData}
              mergedRisk={mergedRisk}
              loading={fraudIntelLoading}
              stage1Score={mergedRisk?.stage1 ?? riskData.score}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ═══ REQUESTS PAGE — Fully Upgraded ═══ */