import pathlib

p = pathlib.Path("index.html")
s = p.read_text(encoding="utf-8")

# Store token handling: add helper to get auth header
if "function getAuthHeader" not in s:
    s = s.replace('const API=""; // FastAPI serves index.html — use relative paths',
                  'const API=""; // FastAPI serves index.html — use relative paths\nfunction getAuthHeader(){ try{ const t=localStorage.getItem("iron_token"); return t? {"Authorization":"Bearer "+t} : {}; }catch{ return {}; } }')
    print("added getAuthHeader")

# Update LoginPage handleLogin to store token
# Find verify-otp success branch
old_login_success = """        if(data.status==="SUCCESS"){
          setMsg({text:"Login Successful ✔",ok:true});
          const u=Object.entries(USERS).find(([,v])=>v.number===mobile);
          setTimeout(()=>onLogin({...u[1]}),500);"""
new_login_success = """        if(data.status==="SUCCESS"){
          // Phase 2B: store token for authenticated requests
          if(data.token){ try{ localStorage.setItem("iron_token", data.token); localStorage.setItem("iron_user", mobile); }catch{} }
          setMsg({text:"Login Successful ✔",ok:true});
          const u=Object.entries(USERS).find(([,v])=>v.number===mobile);
          // Also ensure backend user exists (seeded) — fetch authoritative profile
          try{ const tok=data.token||localStorage.getItem("iron_token"); if(tok){ fetch(`${API}/auth/me`,{headers:{...getAuthHeader(), "Authorization":"Bearer "+tok}}).then(r=>r.json()).then(j=>{ if(j.balance!=null) u[1].balance=j.balance; }).catch(()=>{}); } }catch{}
          setTimeout(()=>onLogin({...u[1]}),500);"""
if old_login_success in s:
    s = s.replace(old_login_success, new_login_success)
    print("updated LoginPage to store token")

# Also need to handle admin login via 000000 - same path
# That path already returns token from backend, so covered

# Update App handleLogin to fetch authoritative balance/txs
old_handleLogin = """  function handleLogin(u){
    setUser(u);
    // Phase 1G: if persisted balance/txs exist, keep them else use user default
    try{
      const pb=localStorage.getItem("iron_balance");
      if(pb!==null) setBalance(JSON.parse(pb));
      else setBalance(u.balance);
      const pt=localStorage.getItem("iron_txs");
      if(pt) setTxs(JSON.parse(pt));
      else setTxs(SEED_TXS);
    }catch{ setBalance(u.balance); setTxs(SEED_TXS); }
    setRequests(SEED_REQS);
    userRef.current = u;
    // Phase 1I: initialize geo/device baseline on login if available
    try{ if(typeof captureBaseline==="function") captureBaseline(()=>console.log("[IRON] captureBaseline done")); }catch(e){ console.warn("captureBaseline failed",e); }"""
new_handleLogin = """  function handleLogin(u){
    setUser(u);
    userRef.current = u;
    // Phase 2/3: fetch authoritative balance & transactions from backend
    try{
      const hdr=getAuthHeader();
      if(hdr.Authorization){
        fetch(`${API}/balance`,{headers: hdr}).then(r=>r.json()).then(j=>{ if(j.balance!=null) setBalance(j.balance); }).catch(()=>setBalance(u.balance));
        fetch(`${API}/transactions?limit=50`,{headers: hdr}).then(r=>r.json()).then(j=>{ if(j.transactions) setTxs(j.transactions.map(x=>({id:x.transaction_id, to:x.recipient_name||x.recipient, toNum:x.recipient, amt:x.amount, date:x.timestamp.slice(0,10), time:x.timestamp.slice(11,16), risk:x.risk_score, status:x.status==="SUCCESS"?"success":x.status==="HIGH_RISK"?"high_risk":x.status.toLowerCase(), type:"debit", note:x.note, isNew:false, risk_tag:x.risk_tier?.toLowerCase()||"normal", otp_used:x.verification_method==="OTP"}))); }).catch(()=>setTxs(SEED_TXS));
      } else {
        // Fallback to local if no token (should not happen)
        try{
          const pb=localStorage.getItem("iron_balance");
          if(pb!==null) setBalance(JSON.parse(pb));
          else setBalance(u.balance);
          const pt=localStorage.getItem("iron_txs");
          if(pt) setTxs(JSON.parse(pt));
          else setTxs(SEED_TXS);
        }catch{ setBalance(u.balance); setTxs(SEED_TXS); }
      }
    }catch{ setBalance(u.balance); setTxs(SEED_TXS); }
    setRequests(SEED_REQS);
    // Phase 1I: initialize geo/device baseline on login if available
    try{ if(typeof captureBaseline==="function") captureBaseline(()=>console.log("[IRON] captureBaseline done")); }catch(e){ console.warn("captureBaseline failed",e); }
    // Persist baseline to backend if location available
    try{ const dev = (typeof getDeviceInfo==="function"? getDeviceInfo():null); const loc = (typeof GeoDeviceBaseline!=="undefined"? GeoDeviceBaseline.location:null); const hdr=getAuthHeader(); if(hdr.Authorization) fetch(`${API}/device/baseline`,{method:"POST", headers:{...hdr, "Content-Type":"application/json"}, body: JSON.stringify({device:dev, location:loc})}).catch(()=>{}); }catch{}"""
if old_handleLogin in s:
    s = s.replace(old_handleLogin, new_handleLogin)
    print("updated handleLogin to fetch authoritative")

# Update handleLogout to clear token
old_logout = """  function handleLogout(){
    if (socketRef.current && userRef.current) {
      socketRef.current.emit("user_leave", userRef.current.number);
      console.log("[IronWallet WS] user_leave:", userRef.current.number);
    }
    userRef.current = null;
    setUser(null);
    setPage("dashboard");
  }"""
new_logout = """  function handleLogout(){
    if (socketRef.current && userRef.current) {
      socketRef.current.emit("user_leave", userRef.current.number);
      console.log("[IronWallet WS] user_leave:", userRef.current.number);
    }
    try{ localStorage.removeItem("iron_token"); localStorage.removeItem("iron_user"); }catch{}
    // Optionally call backend to delete session
    try{ const hdr=getAuthHeader(); if(hdr.Authorization) fetch(`${API}/auth/logout`,{method:"POST", headers: hdr}).catch(()=>{}); }catch{}
    userRef.current = null;
    setUser(null);
    setPage("dashboard");
  }"""
if old_logout in s:
    s = s.replace(old_logout, new_logout)
    print("updated handleLogout")

# Update WebSocket to send token
old_ws = """      // Re-register on every (re)connect — covers page reload + reconnection
      if (userRef.current) {
        socket.emit("user_register", userRef.current.number, (ack) => {
          console.log("[IronWallet WS] Re-registered:", userRef.current?.number, ack);
        });
      }"""
new_ws = """      // Re-register on every (re)connect — Phase 2K: send token for auth
      if (userRef.current) {
        const tok = (()=>{ try{ return localStorage.getItem("iron_token"); }catch{ return null; } })();
        socket.emit("user_register", {number: userRef.current.number, token: tok}, (ack) => {
          console.log("[IronWallet WS] Re-registered:", userRef.current?.number, ack);
        });
      }"""
if old_ws in s:
    s = s.replace(old_ws, new_ws)
    print("updated WS re-register to send token")

old_ws2 = """    // Register with WS server as soon as the user is known
    if (socketRef.current?.connected) {
      socketRef.current.emit("user_register", u.number, (ack) => {
        if (ack?.success) console.log("[IronWallet WS] Registered:", u.number, `(${ack.connections} conn)`);
      });
    }"""
new_ws2 = """    // Register with WS server as soon as the user is known — Phase 2K token
    if (socketRef.current?.connected) {
      const tok = (()=>{ try{ return localStorage.getItem("iron_token"); }catch{ return null; } })();
      socketRef.current.emit("user_register", {number: u.number, token: tok}, (ack) => {
        if (ack?.success) console.log("[IronWallet WS] Registered:", u.number, `(${ack.connections} conn)`);
      });
    }"""
if old_ws2 in s:
    s = s.replace(old_ws2, new_ws2)
    print("updated WS initial register")

# Phase 2D/E: make SendMoneyPage use POST /transactions/prepare and /transactions/confirm authoritative
# Replace completePayment to call backend
old_complete = """  function completePayment(){
    const a = parsedAmt;
    const { date, time } = nowStamp();
    const { targetNum, name } = getRecipientInfo();
    
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
    updateBalance(b => b - a);"""

new_complete = """  async function completePayment(){
    const a = parsedAmt;
    const { targetNum, name } = getRecipientInfo();
    // Phase 2G: authoritative backend — prepare was already done in analyzeRisk, now confirm
    // If we have a prepared transaction_id from prepare step, use it; else fallback to legacy
    const preparedId = riskData.transaction_id || riskData.preparedId;
    if (!preparedId) {
      // Fallback legacy path (should not happen after Phase 2) — keep for offline demo
      const { date, time } = nowStamp();
      const _gdMeta = getTxGeoDeviceMeta();
      const _locationDisplay = MockLocation.active ? MockLocation.label : (_gdMeta.location || null);
      const otpUsed = riskData.tier === 'high_risk' || riskData.tier === 'HIGH_RISK';
      const status = riskData.tier === 'high_risk' ? 'high_risk' : 'success';
      const tx = { id: Date.now(), to: name || recipient, toNum: targetNum || recipient, upi: recipientType === 'upi' ? recipient : (USERS[targetNum]?.upi || ''), amt: a, date, time, risk: riskData.score, status, type: "debit", note: note || "Payment", isNew: true, risk_tag: riskData.tier, otp_used: otpUsed, location: _locationDisplay, device: _gdMeta.device, new_device: _gdMeta.isNewDevice };
      addTx(tx); updateBalance(b => b - a);
      setLastTx(tx); setStage("success");
      return;
    }
    // Authenticated confirm
    try{
      const otpVal = riskData.otpValue || null; // set when OTP verified
      const hdr = getAuthHeader();
      const res = await fetch(`${API}/transactions/confirm`, {method:"POST", headers:{...hdr, "Content-Type":"application/json"}, body: JSON.stringify({transaction_id: preparedId, otp: otpVal})});
      const data = await res.json().catch(()=>({}));
      if(!res.ok){
        alert(data.error || "Transaction failed");
        // For idempotency, if duplicate, treat as success
        if(data.duplicate || res.status===409){ /* ignore */ }
        else return;
      }
      // Update authoritative balance & tx
      if(data.balance != null) setBalance(data.balance);
      // Map backend tx to frontend format
      const tx = { id: data.transaction_id || preparedId, to: name || recipient, toNum: targetNum || recipient, upi: recipientType === 'upi' ? recipient : (USERS[targetNum]?.upi || ''), amt: a, date: new Date().toISOString().slice(0,10), time: new Date().toISOString().slice(11,16), risk: data.risk_score ?? riskData.score, status: (data.status==="HIGH_RISK"||data.status==="high_risk")?"high_risk": (data.status==="SUCCESS"?"success":data.status?.toLowerCase()||"success"), type: "debit", note: note || "Payment", isNew: true, risk_tag: (data.risk_tier||riskData.tier||"normal").toLowerCase(), otp_used: !!otpVal, location: (typeof MockLocation!=="undefined"&&MockLocation.active?MockLocation.label:null), device: (typeof getTxGeoDeviceMeta==="function"?getTxGeoDeviceMeta().device:null) };
      addTx(tx);
      // Do not locally deduct — backend already did; ensure UI reflects backend balance
      setLastTx(tx); setStage("success");
    }catch(e){
      console.error("confirm failed", e);
      alert("Transaction failed: "+(e.message||"unknown"));
    }"""

if old_complete in s:
    s = s.replace(old_complete, new_complete)
    print("updated completePayment to authoritative")

# Also need to update handlePINSuccess/handleOTPSuccess to pass OTP value
# Find handlePINSuccess
old_pinSuccess = """  function handlePINSuccess() {
    // Admin accounts skip OTP — go straight to payment after PIN
    if (user && user.isAdmin) { completePayment(); return; }
    // OTP only required when risk score is 70+ (or the tier is already otp/high_risk).
    // Removed the broad smartOTP path (high value / new recipient / biometric / flagged recipient)
    // so low-risk payments don't get an extra OTP step.
    const requiresOTP = riskData.tier === 'otp' || riskData.tier === 'high_risk' || riskData.score >= 70;
    if (requiresOTP) {
      setStage("otp");
    } else {
      completePayment();
    }
  }"""
new_pinSuccess = """  function handlePINSuccess() {
    if (user && user.isAdmin) { completePayment(); return; }
    const requiresOTP = riskData.tier === 'high_risk' || riskData.tier === 'caution' && riskData.score>=85 || riskData.score >= 85 || riskData.requires_otp;
    if (requiresOTP) {
      setStage("otp");
    } else {
      completePayment();
    }
  }
  function setOTPForConfirm(otp){ setRiskData(prev=>({...prev, otpValue: otp})); }"""
if old_pinSuccess in s:
    s = s.replace(old_pinSuccess, new_pinSuccess)
    print("updated handlePINSuccess")

old_otpSuccess = """  function handleOTPSuccess() {
    completePayment();
  }"""
new_otpSuccess = """  function handleOTPSuccess(otp) {
    // Store OTP for confirm step (Phase 2E)
    const val = otp || (typeof otp==="string"?otp:null);
    if(val) setRiskData(prev=>({...prev, otpValue: val}));
    // Slight delay to ensure state updated before confirm
    setTimeout(()=>completePayment(), 50);
  }"""
# The OTPModal calls onSuccess without args currently; we need to capture digits
if old_otpSuccess in s:
    s = s.replace(old_otpSuccess, new_otpSuccess)
    print("updated handleOTPSuccess to capture OTP")

# Update OTPModal to pass code to onSuccess
old_otpModal_success = """      if(data.status==="SUCCESS"){onSuccess();}"""
if old_otpModal_success in s:
    s = s.replace(old_otpModal_success, """      if(data.status==="SUCCESS"){onSuccess(code);}""")
    print("updated OTPModal onSuccess to pass code")

# Update analyzeRisk to use prepare API for authoritative risk
# Find analyzeRisk's setTimeout block where it sets riskData
# We already have authoritative totalRisk logic, need to also store transaction_id from prepare
# Instead, replace analyzeRisk to call POST /transactions/prepare
old_analyze_start = "  function analyzeRisk(){"
new_analyze_start = """  async function analyzeRisk(){
    // Phase 2D: use backend prepare for authoritative risk
    // Keep local fallback if backend unreachable"""
if old_analyze_start in s and new_analyze_start not in s:
    s = s.replace(old_analyze_start, new_analyze_start)
    print("made analyzeRisk async")

# Find the part where it does setRiskData after analysis and add prepare call
# Look for the section after totalRisk tier logic where it sets riskData
old_setRisk = """      setRiskData({
        score: totalRisk,
        signals: allSignals,
        action: ruleResult.action, tier, risk: ruleResult.risk,
        kwMatched, kwScore,
        // === Urgency Detection Feature: persist urgency hits for UI rendering ===
        urgencyHits: urgencyResult.urgencyHits,
        urgencyScore: urgencyResult.urgencyScore
      });"""
new_setRisk = """      // Try authoritative prepare (Phase 2D) — if backend reachable, use its transaction_id and risk
      let preparedId = null;
      let authoritativeRisk = null;
      try{
        const hdr = getAuthHeader();
        if(hdr.Authorization){
          const prepRes = await fetch(`${API}/transactions/prepare`, {method:"POST", headers:{...hdr, "Content-Type":"application/json"}, body: JSON.stringify({recipient: targetNum||recipient, amount: parsedAmt, note: note||""})});
          const prepData = await prepRes.json().catch(()=>({}));
          if(prepRes.ok && prepData.transaction_id){
            preparedId = prepData.transaction_id;
            authoritativeRisk = prepData.risk;
            // Override totalRisk/tier with authoritative if available
            totalRisk = prepData.risk.score;
            tier = prepData.risk.tier==="HIGH_RISK"?"high_risk": prepData.risk.tier==="CAUTION"?"caution":"normal";
            allSignals = prepData.risk.signals || allSignals;
            console.log("[IRON] prepare authoritative", prepData);
          }
        }
      }catch(e){ console.warn("prepare failed, fallback to local", e); }
      setRiskData({
        score: totalRisk,
        signals: allSignals,
        action: ruleResult.action, tier, risk: ruleResult.risk,
        kwMatched, kwScore,
        urgencyHits: urgencyResult.urgencyHits,
        urgencyScore: urgencyResult.urgencyScore,
        transaction_id: preparedId,
        preparedId: preparedId,
        authoritative: !!authoritativeRisk,
        requires_otp: authoritativeRisk?.requires_otp ?? (tier==="high_risk")
      });"""
if old_setRisk in s:
    s = s.replace(old_setRisk, new_setRisk)
    print("updated setRiskData to include prepare")

# Write back
p.write_text(s, encoding="utf-8")
print("patch_frontend_phase2 done")
