/* ═══ OTP MODAL ═══ */
function OTPModal({mobile,onSuccess,onCancel}){
  const[digits,setDigits]=useState(["","","","","",""]);
  const[error,setError]=useState(false);
  const[errMsg,setErrMsg]=useState("Invalid OTP.");
  const[timer,setTimer]=useState(30);
  const[resend,setResend]=useState(false);
  const[loading,setLoad]=useState(false);
  const refs=[useRef(),useRef(),useRef(),useRef(),useRef(),useRef()];

  useEffect(()=>{refs[0].current&&refs[0].current.focus();},[]);
  useEffect(()=>{
    if(timer<=0){setResend(true);return;}
    const t=setTimeout(()=>setTimer(p=>p-1),1000);
    return()=>clearTimeout(t);
  },[timer]);
  /* Auto-send OTP as soon as this modal opens (skip for admin - uses static OTP) */
  useEffect(()=>{
    if (mobile === "1234567890") return;
    fetch(`${API}/send-otp`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mobile})}).catch(()=>{});
  },[]);

  function type(i,e){
    const v=e.target.value.replace(/\D/,"");
    const d=[...digits];d[i]=v;setDigits(d);
    if(v&&i<5)refs[i+1].current&&refs[i+1].current.focus();
    if(d.every(x=>x))submit(d.join(""));
  }
  function bk(i,e){
    if(e.key==="Backspace"&&!digits[i]&&i>0){
      refs[i-1].current&&refs[i-1].current.focus();
      const d=[...digits];d[i-1]="";setDigits(d);
    }
  }
  async function submit(code){
    // Admin user - skip OTP server call, accept constant OTP 000000
    if (mobile === "1234567890" && code === "000000") {
      onSuccess(code);
      return;
    }
    setLoad(true);
    try{
      const res=await fetch(`${API}/verify-otp`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mobile,otp:code})});
      const data=await res.json();
      if(data.status==="SUCCESS"){onSuccess(code);}
      else{
        setErrMsg(data.status==="OTP_EXPIRED"?"OTP expired. Resend.":"Invalid OTP.");
        setError(true);
        setTimeout(()=>{setError(false);setDigits(["","","","","",""]);refs[0].current&&refs[0].current.focus();},750);
      }
    }catch(e){
      setErrMsg("Server unreachable.");setError(true);
      setTimeout(()=>{setError(false);setDigits(["","","","","",""]);},750);
    }finally{setLoad(false);}
  }
  async function resendOTP(){
    if (mobile === "1234567890") return;
    setTimer(999); setResend(true);
    try{await fetch(`${API}/send-otp`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mobile})});}catch(e){}
  }

  useEffect(()=>{
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow="";};
  },[]);

  return(
    <Modal>
      <div style={{
        position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:9999,
        display:"flex",alignItems:"center",justifyContent:"center",
        padding:"20px",boxSizing:"border-box",
        background:"rgba(10,25,70,.65)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)"}}>
        <div style={{background:"#fff",borderRadius:24,width:"100%",maxWidth:380,
          boxShadow:"0 32px 80px rgba(0,0,0,.28)",animation:"scaleIn .28s cubic-bezier(.16,1,.3,1)",
          overflow:"hidden",flexShrink:0}}>
            <div style={{background:`linear-gradient(135deg,#0078FF,#0055cc)`,padding:"20px 24px 16px",textAlign:"center"}}>
              <div style={{width:50,height:50,borderRadius:"50%",background:"rgba(255,255,255,.2)",
                display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px"}}>
                <svg width="24"height="24"viewBox="0 0 48 48">
                  <path d="M24 4L6 12v14c0 12 7.6 23.2 18 26 10.4-2.8 18-14 18-26V12L24 4z"fill="rgba(255,255,255,.2)"stroke="#fff"strokeWidth="2.5"/>
                  <polyline points="16 24 22 30 34 18"fill="none"stroke="#fff"strokeWidth="2.8"strokeLinecap="round"strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 style={{fontWeight:800,fontSize:18,color:"#fff",marginBottom:3}}>OTP Verification</h3>
              <p style={{fontSize:12,color:"rgba(255,255,255,.75)"}}>6-digit code sent to +91 {mobile}</p>
            </div>
            <div style={{padding:"20px 22px 22px"}}>
              <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:12,
                animation:error?"shake .4s ease":"none"}}>
                {digits.map((d,i)=>(
                  <input key={i} ref={refs[i]} maxLength={1} value={d}
                    onChange={e=>type(i,e)} onKeyDown={e=>bk(i,e)}
                    style={{width:44,height:52,textAlign:"center",fontSize:22,fontWeight:700,
                      border:`2px solid ${error?"#fca5a5":d?"#93c5fd":"#e2e8f0"}`,
                      borderRadius:12,outline:"none",color:"#0f172a",fontFamily:"'DM Sans',sans-serif",
                      background:error&&!d?"#fef2f2":d?"#f0f6ff":"#f8faff",
                      transition:"all .15s",boxSizing:"border-box"}}/>
                ))}
              </div>
              {error&&<p style={{color:"#dc2626",textAlign:"center",fontSize:13,marginBottom:10,fontWeight:600}}>{errMsg}</p>}
              {loading&&<p style={{textAlign:"center",fontSize:13,color:"#0078FF",marginBottom:10,fontWeight:600,animation:"pulse 1s infinite"}}>Verifying…</p>}
              <div style={{textAlign:"center",color:"#94a3b8",fontSize:13,marginBottom:16}}>
                {resend
                  ?<button onClick={resendOTP} style={{background:"none",border:"none",color:"#0078FF",
                    fontSize:13,cursor:"pointer",fontWeight:700,fontFamily:"'DM Sans',sans-serif"}}>
                    Resend OTP →</button>
                  :`Resend in ${timer}s`}
              </div>
              <Btn onClick={onCancel} variant="ghost" fullWidth>Cancel</Btn>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ═══ PIN MODAL ═══ */
/* ===== ENHANCED PINModal: 3 wrong attempts → 5-min account freeze ===== */
function PINModal({userPin, onSuccess, onCancel, user}){
  const[digits,setDigits]=useState(["","","",""]);
  const[error,setError]=useState(false);
  const[loading,setLoad]=useState(false);
  const[attempts,setAttempts]=useState(0);
  const[pinFrozen,setPinFrozen]=useState(false);
  const[freezeSecs,setFreezeSecs]=useState(300);
  const[errMsg,setErrMsg]=useState("Incorrect PIN. Try again.");
  const refs=[useRef(),useRef(),useRef(),useRef()];
  const MAX_ATTEMPTS=3;
  const FREEZE_SECS=300;

  useEffect(()=>{
    if(refs[0].current) refs[0].current.focus();
  },[]);

  // Countdown when frozen
  useEffect(()=>{
    if(!pinFrozen) return;
    if(freezeSecs<=0){setPinFrozen(false);setAttempts(0);setFreezeSecs(FREEZE_SECS);return;}
    const t=setTimeout(()=>setFreezeSecs(s=>s-1),1000);
    return()=>clearTimeout(t);
  },[pinFrozen,freezeSecs]);

  function type(i,e){
    if(pinFrozen) return;
    const v=e.target.value.replace(/\D/,"");
    const d=[...digits];d[i]=v;setDigits(d);
    if(v&&i<3)refs[i+1].current&&refs[i+1].current.focus();
    if(d.every(x=>x))submit(d.join(""));
  }
  function bk(i,e){
    if(pinFrozen) return;
    if(e.key==="Backspace"&&!digits[i]&&i>0){
      refs[i-1].current&&refs[i-1].current.focus();
      const d=[...digits];d[i-1]="";setDigits(d);
    }
  }
  function submit(code){
    setLoad(true);
    setTimeout(()=>{
      if(code===String(userPin)){
        onSuccess();
      } else {
        const newAttempts=attempts+1;
        setAttempts(newAttempts);
        setError(true);
        if(newAttempts>=MAX_ATTEMPTS){
          if(user) freezeAccount(user,"3 incorrect PIN attempts — account paused for 5 minutes.",5);
          setPinFrozen(true);
          setFreezeSecs(FREEZE_SECS);
          setErrMsg("3 wrong PINs — account frozen for 5 minutes");
        } else {
          setErrMsg(`Incorrect PIN. ${MAX_ATTEMPTS-newAttempts} attempt${MAX_ATTEMPTS-newAttempts===1?"":"s"} left.`);
        }
        setTimeout(()=>{
          setError(false);
          setDigits(["","","",""]);
          if(!pinFrozen) refs[0].current&&refs[0].current.focus();
        },700);
      }
      setLoad(false);
    },600);
  }
  useEffect(()=>{
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow="";};
  },[]);

  const mins=Math.floor(freezeSecs/60);
  const secs=freezeSecs%60;
  const pct=((FREEZE_SECS-freezeSecs)/FREEZE_SECS)*100;

  return(
    <Modal>
      <div style={{
        position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:9999,
        display:"flex",alignItems:"center",justifyContent:"center",
        padding:"20px",boxSizing:"border-box",
        background:"rgba(10,25,70,.65)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)"}}>
        <div style={{background:"#fff",borderRadius:24,width:"100%",maxWidth:320,flexShrink:0,
          boxShadow:"0 30px 70px rgba(0,0,0,.26)",animation:"scaleIn .28s cubic-bezier(.16,1,.3,1)",overflow:"hidden"}}>
            {pinFrozen ? (
              <>
                <div style={{background:"linear-gradient(135deg,#dc2626,#991b1b)",padding:"20px 24px 16px",textAlign:"center"}}>
                  <div style={{width:54,height:54,borderRadius:"50%",background:"rgba(255,255,255,.15)",
                    display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px",fontSize:26}}>
                    ❄️
                  </div>
                  <h3 style={{fontWeight:800,fontSize:17,color:"#fff",marginBottom:3}}>Account Frozen</h3>
                  <p style={{fontSize:12,color:"rgba(255,255,255,.8)"}}>3 incorrect PIN attempts detected</p>
                </div>
                <div style={{padding:"24px 22px",textAlign:"center"}}>
                  <p style={{fontSize:13,color:"#64748b",marginBottom:16,lineHeight:1.5}}>
                    Your account is paused for <strong>5 minutes</strong> to protect against unauthorised access.
                  </p>
                  <div style={{fontSize:44,fontWeight:800,color:"#dc2626",fontFamily:"monospace",marginBottom:14}}>
                    {mins}:{secs.toString().padStart(2,"0")}
                  </div>
                  <div style={{height:6,background:"#f1f5f9",borderRadius:4,overflow:"hidden",marginBottom:16}}>
                    <div style={{height:"100%",width:`${pct}%`,
                      background:"linear-gradient(90deg,#dc2626,#f97316)",
                      borderRadius:4,transition:"width 1s linear"}}/>
                  </div>
                  <p style={{fontSize:12,color:"#94a3b8",marginBottom:16}}>You can cancel and try again after the timer ends</p>
                  <Btn onClick={onCancel} variant="ghost" fullWidth>Cancel Payment</Btn>
                </div>
              </>
            ) : (
              <>
                <div style={{background:`linear-gradient(135deg,#0078FF,#0055cc)`,padding:"20px 24px 16px",textAlign:"center"}}>
                  <div style={{width:50,height:50,borderRadius:"50%",background:"rgba(255,255,255,.2)",
                    display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px"}}>
                    {Ic.lock("#fff")}
                  </div>
                  <h3 style={{fontWeight:800,fontSize:18,color:"#fff",marginBottom:3}}>Enter PIN</h3>
                  <p style={{fontSize:12,color:"rgba(255,255,255,.75)"}}>Confirm your 4-digit IronWallet PIN</p>
                </div>
                <div style={{padding:"20px 22px 22px"}}>
                  {/* Attempt dots */}
                  {attempts>0&&(
                    <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:10}}>
                      {Array.from({length:MAX_ATTEMPTS}).map((_,i)=>(
                        <div key={i} style={{width:8,height:8,borderRadius:"50%",
                          background:i<attempts?"#dc2626":"#e2e8f0",transition:"background .3s"}}/>
                      ))}
                    </div>
                  )}
                  <div style={{display:"flex",gap:12,justifyContent:"center",marginBottom:14,
                    animation:error?"shake .4s ease":"none"}}>
                    {digits.map((d,i)=>(
                      <input key={i} ref={refs[i]} maxLength={1} type="password" value={d}
                        onChange={e=>type(i,e)} onKeyDown={e=>bk(i,e)}
                        style={{width:54,height:60,textAlign:"center",fontSize:28,fontWeight:700,
                          border:`2px solid ${error?"#fca5a5":d?"#93c5fd":"#e2e8f0"}`,
                          borderRadius:14,outline:"none",color:"#0f172a",fontFamily:"'DM Sans',sans-serif",
                          background:error&&!d?"#fef2f2":d?"#f0f6ff":"#f8faff",transition:"all .15s",boxSizing:"border-box"}}/>
                    ))}
                  </div>
                  {error&&<p style={{color:"#dc2626",textAlign:"center",fontSize:13,marginBottom:12,fontWeight:600}}>{errMsg}</p>}
                  {loading&&<p style={{textAlign:"center",fontSize:13,color:"#0078FF",marginBottom:12,fontWeight:600,animation:"pulse 1s infinite"}}>Verifying…</p>}
                  <Btn onClick={onCancel} variant="ghost" fullWidth>Cancel</Btn>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}


// === Out-of-Band Verification Feature ===
/* ─────────────────────────────────────────────────────────────────────────────
   OUT-OF-BAND VERIFICATION MODAL
   Appears BEFORE the PIN/OTP step when risk is high (score > 75) OR when the
   recipient is unknown AND the amount is substantial.
   Encourages users to verify via a trusted channel (call/message) before paying.
   Per product rule: Payment is NEVER blocked — "Proceed Anyway" is always shown.
   ───────────────────────────────────────────────────────────────────────── */
function OutOfBandVerificationModal({ recipientName, recipientNum, inContacts, onProceed, onCancel }) {
  const [copied, setCopied] = useState(false);

  // Attempt to get a display phone number for the recipient
  const displayNum = recipientNum && recipientNum.match(/^\d{10}$/) ? recipientNum : null;

  function handleCopy() {
    if (displayNum) {
      try {
        navigator.clipboard.writeText(displayNum);
      } catch (_) {
        // fallback: select and copy via execCommand
        const el = document.createElement('textarea');
        el.value = displayNum;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleCall() {
    if (displayNum) {
      window.location.href = `tel:${displayNum}`;
    }
  }

  return (
    <Modal>
      <div style={{
        position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
        zIndex: 9999, background: "rgba(10,25,70,.72)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20
      }}>
        <div style={{
          background: "#fff", borderRadius: 24, maxWidth: 420, width: "100%",
          overflow: "hidden", animation: "scaleIn .28s cubic-bezier(.16,1,.3,1)",
          boxShadow: "0 32px 80px rgba(0,0,0,.28)"
        }}>
          {/* Header */}
          <div style={{
            background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
            padding: "22px 24px 18px"
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: "rgba(255,255,255,.18)", display: "flex",
              alignItems: "center", justifyContent: "center", margin: "0 auto 14px"
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.44 2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16z"/>
              </svg>
            </div>
            <h3 style={{
              fontSize: 18, fontWeight: 800, color: "#fff",
              textAlign: "center", marginBottom: 4
            }}>Verify before paying</h3>
            <p style={{
              fontSize: 13, color: "rgba(255,255,255,.8)",
              textAlign: "center", lineHeight: 1.45
            }}>
              This request may be risky. Contact the sender using a trusted method.
            </p>
          </div>

          {/* Body */}
          <div style={{ padding: "22px 24px" }}>
            {/* Recipient info row */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", background: "#f8faff",
              borderRadius: 12, marginBottom: 16,
              border: "1px solid #e2e8f0"
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "linear-gradient(135deg,#0078FF,#0055cc)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 700, color: "#fff", flexShrink: 0
              }}>
                {(recipientName || "?").charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                  {recipientName || "Unknown Recipient"}
                </div>
                {displayNum && (
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    +91 {displayNum.slice(0,5)} {displayNum.slice(5)}
                  </div>
                )}
              </div>
              {/* Contact badge */}
              {!inContacts && (
                <span style={{
                  padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5",
                  whiteSpace: "nowrap", flexShrink: 0
                }}>
                  Not in contacts
                </span>
              )}
              {inContacts && (
                <span style={{
                  padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: "#dcfce7", color: "#166534", border: "1px solid #86efac",
                  whiteSpace: "nowrap", flexShrink: 0
                }}>
                  ✔ In contacts
                </span>
              )}
            </div>

            {/* Safety tip */}
            <div style={{
              padding: "11px 14px", background: "#f0f9ff",
              border: "1px solid #bae6fd", borderRadius: 10, marginBottom: 18
            }}>
              <p style={{ fontSize: 12, color: "#0c4a6e", fontWeight: 600, lineHeight: 1.5, margin: 0 }}>
                📞 <strong>Safe practice:</strong> Call or message this person on a number
                you already know — not one they just sent you — to confirm the payment request is genuine.
              </p>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Call & Copy row — only if phone number available */}
              {displayNum && (
                <div style={{ display: "flex", gap: 10 }}>
                  {/* Call Contact — only shown if in contacts */}
                  {inContacts && (
                    <button onClick={handleCall}
                      style={{
                        flex: 1, padding: "11px 14px",
                        background: "linear-gradient(135deg,#22c55e,#16a34a)",
                        border: "none", borderRadius: 12, color: "#fff",
                        fontWeight: 700, fontSize: 13, cursor: "pointer",
                        fontFamily: "'DM Sans',sans-serif",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                        boxShadow: "0 4px 12px rgba(34,197,94,.28)"
                      }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff"
                        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.44 2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16z"/>
                      </svg>
                      Call Contact
                    </button>
                  )}
                  <button onClick={handleCopy}
                    style={{
                      flex: 1, padding: "11px 14px",
                      background: copied ? "#dcfce7" : "#f0f6ff",
                      border: `1.5px solid ${copied ? "#86efac" : "#bfdbfe"}`,
                      borderRadius: 12, color: copied ? "#166534" : "#0078FF",
                      fontWeight: 700, fontSize: 13, cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      transition: "all .2s"
                    }}>
                    {copied ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="#166534" strokeWidth="2.5" strokeLinecap="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="#0078FF" strokeWidth="2" strokeLinecap="round">
                          <rect x="9" y="9" width="13" height="13" rx="2"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copy Number
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Cancel Payment */}
              <button onClick={onCancel}
                style={{
                  width: "100%", padding: "11px",
                  background: "#fef2f2", border: "1.5px solid #fecaca",
                  borderRadius: 12, color: "#dc2626", fontWeight: 700,
                  fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Cancel Payment
              </button>

              {/* Proceed Anyway — MUST always be available per product rule */}
              <button onClick={onProceed}
                style={{
                  width: "100%", padding: "11px",
                  background: "transparent", border: "1px solid #e2e8f0",
                  borderRadius: 12, color: "#64748b", fontWeight: 600,
                  fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif"
                }}>
                Proceed Anyway →
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
// === End Out-of-Band Verification Feature ===

/* ═══ FRAUD RISK CARD with PIN+OTP for suspicious ═══ */
function FraudRiskCard({score, recipient, recipientNum, amount, signals, onVerify, onCancel, onReport, tier, kwMatched=[], urgencyHits=[], urgencyScore=0}){
  const [countdown, setCountdown] = useState(10);
  const [timerActive, setTimerActive] = useState(false);

  useEffect(() => {
    if (score >= 90) {
      setCountdown(10);
      setTimerActive(true);
    } else {
      setTimerActive(false);
    }
  }, [score]);

  useEffect(() => {
    if (!timerActive) return;
    if (countdown <= 0) { setTimerActive(false); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [timerActive, countdown]);

  const m=riskMeta(score);
  const R=36,cx=52,cy=52;
  const sa=Math.PI*.75,sw=Math.PI*1.5*(score/100);
  function p2r(a){return{x:cx+R*Math.cos(a),y:cy+R*Math.sin(a)};}
  function arc(from,to){
    const f=p2r(from),t=p2r(to),lg=(to-from)>Math.PI?1:0;
    return`M ${f.x} ${f.y} A ${R} ${R} 0 ${lg} 1 ${t.x} ${t.y}`;
  }

  // 90+ score → button becomes "Verify with OTP"
  // Below 90 → "Pay with PIN →"  (OTP is still triggered internally for otp/high_risk tier)
  const useOTPButton = score >= 90;

  // Determine the correct title based on tier
  let title = '';
  if (tier === 'normal') title = '🟢 Safe Transaction';
  else if (tier === 'info') title = '🟡 Caution — Low Risk';
  else if (tier === 'otp') title = '🟠 Suspicious Payment Detected';
  else if (tier === 'high_risk') title = '🔴 High Risk Transaction';

  return(
    <Card style={{padding:0,overflow:"hidden",border:`1.5px solid ${m.border}`}}>
      <div style={{height:4,background:`linear-gradient(90deg,${m.dot},${m.color})`,borderRadius:"18px 18px 0 0"}}/>
      <div style={{padding:"20px 22px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              {Ic.warn(m.dot)}
              <span style={{fontWeight:800,fontSize:15,color:m.color}}>
                {title}
              </span>
            </div>
            <p style={{fontSize:12,color:"#94a3b8"}}>Adaptive behavioral security review</p>
          </div>
        </div>
        <div style={{background:"#f8faff",borderRadius:12,padding:"14px 16px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:13,color:"#64748b"}}>Sending to</span>
            <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{recipient}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,color:"#64748b"}}>Amount</span>
            <span style={{fontSize:19,fontWeight:800,color:"#0f172a"}}>₹{Number(amount).toLocaleString("en-IN")}</span>
          </div>
        </div>
        <div style={{marginBottom:14,padding:"10px 12px",background:"#f8faff",border:"1px solid #e2e8f0",borderRadius:8}}>
          <div style={{fontSize:11,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:.7,marginBottom:4}}>
            Review basis
          </div>
          <div style={{fontSize:12,color:"#475569",lineHeight:1.45}}>
            Iron compared this payment with your usual spending pattern, recipient familiarity, recent activity, and account context.
          </div>
        </div>
        {/* ===== Network Fraud Intelligence — recipient report count ===== */}
        {recipientNum&&getRecipientRisk(recipientNum)>=1&&(
          <div style={{marginBottom:12}}>
            <div style={{padding:"10px 14px",background:"#fef2f2",border:"1px solid #fca5a5",
              borderRadius:10,display:"flex",alignItems:"center",gap:8,marginBottom:getRecipientRisk(recipientNum)>3?6:0}}>
              {Ic.warn("#dc2626")}
              <span style={{fontSize:13,color:"#dc2626",fontWeight:600}}>
                ⚠ Reported {getRecipientRisk(recipientNum)} time{getRecipientRisk(recipientNum)>1?"s":""} in our network
              </span>
            </div>
            {getRecipientRisk(recipientNum)>3&&(
              <div style={{padding:"8px 14px",background:"#450a0a",border:"1.5px solid #dc2626",
                borderRadius:10,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:14}}>🚨</span>
                <span style={{fontSize:13,color:"#fca5a5",fontWeight:700}}>
                  High-risk recipient — multiple users have flagged this account
                </span>
              </div>
            )}
          </div>
        )}

        {/* ===== ENGINE INSIGHTS + WHY IS THIS RISKY — clean 3-layer separation ===== */}
        {(()=>{
          // Build explanation from getRiskExplanation (if user context available via recipientNum)
          // We also incorporate the existing signals[] for full engine detail
          // LAYER 1 — Engine Insights: full technical sentences from the fraud engine
          // LAYER 2 — Why is this risky?: short human reasons from getRiskExplanation
          // LAYER 3 — Tags: 1-2 word chips
          // No signal repeats across layers.

          // Collect all engine insight sentences (existing signals array, deduplicated)
          const engineInsights = signals ? [...new Set(signals)] : [];

          // Build explanation layers from recipientNum context
          const rr = recipientNum ? getRecipientRisk(recipientNum) : 0;
          const whyReasons = [];
          const whyTags    = [];

          // Network
          if (rr > 0) {
            whyReasons.push(`Reported by ${rr} user${rr > 1 ? "s" : ""}`);
            whyTags.push("Reported");
          }

          // Parse short reasons from signals — avoid duplicating what engine insights say
          if (signals) {
            signals.forEach(s => {
              const sl = s.toLowerCase();
              if ((sl.includes("new recipient") || sl.includes("not seen in your contacts")) &&
                  !whyReasons.some(r => r.toLowerCase().includes("new recipient"))) {
                whyReasons.push("New recipient");
                whyTags.push("New");
              }
              if ((sl.includes("drain") || sl.includes("large transfer") || sl.includes("higher than your usual") || sl.includes("unusually far outside")) &&
                  !whyReasons.some(r => r.toLowerCase().includes("amount") || r.toLowerCase().includes("spend"))) {
                whyReasons.push("High amount");
                if (!whyTags.includes("High Amount")) whyTags.push("High Amount");
              }
              if ((sl.includes("daily spending") || sl.includes("starting balance") || sl.includes("portion")) &&
                  !whyReasons.some(r => r.toLowerCase().includes("spend") || r.toLowerCase().includes("balance"))) {
                whyReasons.push("Large spend");
                if (!whyTags.includes("Large Spend")) whyTags.push("Large Spend");
              }
              if ((sl.includes("off-network") || sl.includes("outside the upi network") || sl.includes("outside the trusted")) &&
                  !whyReasons.some(r => r.toLowerCase().includes("off-network") || r.toLowerCase().includes("network"))) {
                whyReasons.push("Off-network account");
                if (!whyTags.includes("Off-Network")) whyTags.push("Off-Network");
              }
              if ((sl.includes("late-night") || sl.includes("odd hour") || sl.includes("unusual time") || sl.includes("1–5")) &&
                  !whyReasons.some(r => r.toLowerCase().includes("hour"))) {
                whyReasons.push("Odd hour");
                if (!whyTags.includes("Odd Hour")) whyTags.push("Odd Hour");
              }
            });
          }

          const dedupeReasons = [...new Set(whyReasons)];
          const dedupeTags    = [...new Set(whyTags)];

          const TAG_STYLE = (tag) => {
            const map = {
              "Reported":    {c:"#dc2626", bg:"#fef2f2", bd:"#fca5a5"},
              "New":         {c:"#f59e0b", bg:"#fef3c7", bd:"#fcd34d"},
              "High Amount": {c:"#f97316", bg:"#fff7ed", bd:"#fdba74"},
              "Large Spend": {c:"#ea580c", bg:"#fff7ed", bd:"#fb923c"},
              "Odd Hour":    {c:"#7c3aed", bg:"#f5f3ff", bd:"#c4b5fd"},
              "Off-Network": {c:"#0369a1", bg:"#e0f2fe", bd:"#7dd3fc"},
            };
            return map[tag] || {c:"#64748b", bg:"#f8faff", bd:"#e2e8f0"};
          };

          return (
            <>
              {/* 10-SECOND COUNTDOWN TIMER — shown when risk score >= 85 */}
              {score >= 85 && (
                <div style={{
                  padding:"12px 16px",
                  background:"linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)",
                  border:"2px solid #f97316",
                  borderRadius:12,
                  marginBottom:16,
                  display:"flex",
                  alignItems:"center",
                  justifyContent:"space-between",
                  gap:12,
                  animation:"slideInL .3s ease both"
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:22}}>⏱️</span>
                    <div>
                      <p style={{fontSize:13,fontWeight:800,color:"#9a3412",margin:0,lineHeight:1.3}}>
                        High Risk — 10 Second Review Required
                      </p>
                      <p style={{fontSize:11,color:"#92400e",margin:"3px 0 0",fontWeight:500}}>
                        Please review all details carefully before proceeding
                      </p>
                    </div>
                  </div>
                  <div style={{
                    width:48,height:48,borderRadius:"50%",
                    background:"#fff",
                    border:"3px solid #f97316",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:22,fontWeight:900,color:"#f97316",
                    boxShadow:"0 2px 8px rgba(249,115,22,.3)",
                    flexShrink:0
                  }}>
                    {countdown}
                  </div>
                </div>
              )}

              {/* SECTION 1: Engine Insights — full technical sentences */}
              {engineInsights.length > 0 && (
                <div style={{marginBottom:14}}>
                  <p style={{fontSize:11,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",
                    letterSpacing:.8,marginBottom:8}}>
                    🔍 Engine Insights
                  </p>
                  {engineInsights.slice(0,6).map((s,i)=>{
                    const isKW = s.startsWith("⚠️") || s.startsWith("🚨");
                    return(
                      <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:6,
                        padding:"7px 10px",
                        background:isKW?"#fff7ed":m.bg,
                        borderRadius:8,border:`1px solid ${isKW?"#fdba74":m.border}`,
                        animation:`slideInL .2s ${i*.06}s ease both`}}>
                        <svg width="6"height="6"style={{flexShrink:0,marginTop:5}}>
                          <circle cx="3"cy="3"r="3"fill={isKW?"#f59e0b":m.dot}/>
                        </svg>
                        <span style={{fontSize:13,color:isKW?"#92400e":m.color,
                          fontWeight:isKW?600:500,lineHeight:1.4}}>{s}</span>
                      </div>
                    );
                  })}

                  {/* Urgency Detection — kept inside Engine Insights, no duplication */}
                  {urgencyHits.length>0&&(
                    <div style={{marginTop:8,padding:"10px 14px",background:"#fff7ed",
                      border:"1.5px solid #f97316",borderRadius:10,
                      display:"flex",alignItems:"flex-start",gap:10,
                      animation:"slideInL .25s ease both"}}>
                      <span style={{fontSize:18,flexShrink:0}}>⚡</span>
                      <div>
                        <p style={{fontSize:13,fontWeight:700,color:"#9a3412",marginBottom:4,lineHeight:1.4}}>
                          ⚠️ This request uses urgency tactics often seen in scams
                        </p>
                        <p style={{fontSize:11,color:"#92400e",fontWeight:500,lineHeight:1.4,margin:0}}>
                          Detected: {urgencyHits.slice(0,4).map(h=>`"${h}"`).join(", ")}
                          {urgencyHits.length>4?` +${urgencyHits.length-4} more`:""}
                          {" "}— Scammers often create false urgency to bypass your judgement.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* UPI Keyword badges — kept inside Engine Insights */}
                  {kwMatched.length>0&&(
                    <div style={{marginTop:10,padding:"10px 12px",
                      background:kwMatched.some(k=>k.tier==="critical")?"#fff1f2":"#fff7ed",
                      borderRadius:10,
                      border:kwMatched.some(k=>k.tier==="critical")?"1px solid #fda4af":"1px solid #fdba74"}}>
                      <p style={{fontSize:10,fontWeight:800,
                        color:kwMatched.some(k=>k.tier==="critical")?"#881337":"#92400e",
                        textTransform:"uppercase",letterSpacing:.7,marginBottom:7}}>
                        🔍 Flagged UPI Keywords
                      </p>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {kwMatched.map((kw,i)=>{
                          const chipColor=kw.tier==="critical"?"#9f1239":kw.tier==="high"?"#dc2626":kw.tier==="medium"?"#f97316":"#f59e0b";
                          const chipBg=kw.tier==="critical"?"#fff1f2":kw.tier==="high"?"#fef2f2":kw.tier==="medium"?"#fff7ed":"#fefce8";
                          const chipBord=kw.tier==="critical"?"#fda4af":kw.tier==="high"?"#fca5a5":kw.tier==="medium"?"#fdba74":"#fde68a";
                          const tierLabel=kw.tier==="critical"?"🚨 CRIT":kw.tier==="high"?"HIGH":kw.tier==="medium"?"MED":"LOW";
                          return(
                            <span key={i} title={kw.desc} style={{display:"inline-flex",alignItems:"center",gap:4,
                              padding:"3px 10px",borderRadius:20,fontSize:12,fontWeight:700,
                              background:chipBg,color:chipColor,border:`1.5px solid ${chipBord}`}}>
                              <svg width="7"height="7"><circle cx="3.5"cy="3.5"r="3.5"fill={chipColor}/></svg>
                              {kw.canonical}
                              <span style={{fontSize:10,opacity:.75,fontWeight:600}}>{tierLabel}</span>
                            </span>
                          );
                        })}
                      </div>
                      <p style={{fontSize:10,color:"#94a3b8",marginTop:7,lineHeight:1.4}}>
                        Hover a badge for scam description · Keywords are weighted by fraud frequency
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 2: Why is this risky? — short human reasons only */}
              {dedupeReasons.length > 0 && score >= 60 && (
                <div style={{marginBottom:14,padding:"12px 14px",background:"#fff7ed",
                  border:"1.5px solid #fdba74",borderRadius:12,animation:"slideInL .3s ease both"}}>
                  <p style={{fontSize:11,fontWeight:800,color:"#92400e",textTransform:"uppercase",
                    letterSpacing:.7,marginBottom:8}}>
                    🤔 Why is this risky?
                  </p>
                  {dedupeReasons.map((r,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"flex-start",gap:7,marginBottom:5,
                      fontSize:13,color:"#9a3412",fontWeight:600,lineHeight:1.4}}>
                      <span style={{flexShrink:0,marginTop:1}}>⚠</span><span>{r}</span>
                    </div>
                  ))}

                  {/* 💡 Test-Payment Suggestion for very high risk (score >= 90) */}
                  {score >= 90 && (
                    <div style={{marginTop:12,padding:"10px 12px",background:"#f0f9ff",
                      border:"1.5px solid #38bdf8",borderRadius:10,
                      display:"flex",alignItems:"flex-start",gap:10,
                      animation:"slideInL .25s ease both"}}>
                      <span style={{fontSize:18,flexShrink:0}}>💡</span>
                      <div>
                        <p style={{fontSize:13,fontWeight:700,color:"#0369a1",marginBottom:3,lineHeight:1.4}}>
                          Try confirming with a ₹1 test payment first
                        </p>
                        <p style={{fontSize:11,color:"#075985",fontWeight:500,lineHeight:1.4,margin:0}}>
                          For high-risk payments, sending a small ₹1 amount helps verify the recipient's UPI ID is active and owned by the correct person — before committing the full amount.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* SECTION 3: Tag chips — 1-2 word labels only */}
                  {dedupeTags.length > 0 && (
                    <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:10}}>
                      {dedupeTags.map((tag,i)=>{
                        const ts = TAG_STYLE(tag);
                        return(
                          <span key={i} style={{display:"inline-flex",alignItems:"center",gap:4,
                            padding:"3px 10px",borderRadius:16,fontSize:11,fontWeight:700,
                            background:ts.bg,color:ts.c,border:`1.5px solid ${ts.bd}`}}>
                            {tag}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })()}


        {/* ===== 90+ WARNING: Extra caution text above button ===== */}
        {score >= 90 && (
          <div style={{marginBottom:12,padding:"10px 14px",background:"#fef2f2",
            border:"2px solid #dc2626",borderRadius:10,textAlign:"center"}}>
            <p style={{fontSize:14,fontWeight:800,color:"#dc2626",margin:0}}>
              ⚠️ BE EXTRA CAREFUL: This transaction has multiple high-risk signals.
            </p>
          </div>
        )}

        <div style={{display:"flex",gap:10}}>
          <button onClick={onVerify} className="btn-primary"
            style={{flex:1,padding:"12px",background:`linear-gradient(135deg,#0078FF,#0055cc)`,border:"none",
              borderRadius:12,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif",boxShadow:"0 4px 14px rgba(0,120,255,.28)"}}>
            {useOTPButton ? "Verify with OTP →" : "Pay with PIN →"}
          </button>
          <button onClick={onReport}
            style={{padding:"12px 18px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:12,
              color:"#dc2626",cursor:"pointer",fontSize:14,fontFamily:"'DM Sans',sans-serif",fontWeight:600,transition:"all .15s"}}
            onMouseEnter={e=>e.target.style.background="#fee2e2"}
            onMouseLeave={e=>e.target.style.background="#fef2f2"}>
            {Ic.flag("#dc2626")} Report
          </button>
        </div>
      </div>
    </Card>
  );
}

/* ===== FEATURE 3: Smart Delay Modal — psychological warning + animated countdown ===== */
function SmartDelayModal({amount, onConfirm, onCancel}){
  const DELAY=10;
  const[secs,setSecs]=useState(DELAY);
  const[done,setDone]=useState(false);
  const[hesStart]=useState(Date.now()); // track hesitation time for biometrics

  useEffect(()=>{
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow="";};
  },[]);

  useEffect(()=>{
    if(secs<=0){setDone(true);return;}
    const t=setInterval(()=>setSecs(s=>s-1),1000);
    return()=>clearInterval(t);
  },[secs]);

  const pct=((DELAY-secs)/DELAY)*100;
  const circumference=2*Math.PI*34;

  return(
    <Modal>
      <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:9999,
        background:"rgba(10,25,70,.72)",backdropFilter:"blur(8px)",
        display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{background:"#fff",borderRadius:24,maxWidth:400,width:"100%",
          padding:"32px 28px",textAlign:"center",
          boxShadow:"0 32px 80px rgba(0,0,0,.28)",animation:"scaleIn .28s cubic-bezier(.16,1,.3,1)"}}>

          {/* Icon */}
          <div style={{width:72,height:72,borderRadius:"50%",
            background:"linear-gradient(135deg,#fff7ed,#fef3c7)",
            display:"flex",alignItems:"center",justifyContent:"center",
            margin:"0 auto 18px",border:"2px solid #fcd34d",
            boxShadow:"0 8px 24px rgba(245,158,11,.18)"}}>
            <svg width="32"height="32"viewBox="0 0 24 24"fill="none"stroke="#f59e0b"strokeWidth="2.2"strokeLinecap="round">
              <circle cx="12"cy="12"r="10"/><line x1="12"y1="8"x2="12"y2="12"/><line x1="12"y1="16"x2="12.01"y2="16"/>
            </svg>
          </div>

          <h3 style={{fontSize:18,fontWeight:800,color:"#92400e",marginBottom:6}}>Large Transaction Detected</h3>
          <p style={{color:"#64748b",fontSize:14,marginBottom:10}}>
            You are sending <strong style={{color:"#0f172a"}}>₹{Number(amount).toLocaleString("en-IN")}</strong>
          </p>

          {/* Psychological safety warning */}
          <div style={{padding:"12px 16px",background:"#fef3c7",border:"1px solid #fcd34d",
            borderRadius:12,marginBottom:20,textAlign:"left"}}>
            <p style={{fontSize:12,color:"#92400e",fontWeight:600,lineHeight:1.5}}>
              ⚠️ <strong>Scammers often create urgency.</strong> Take a moment to verify:
              <br/>• Do you personally know this recipient?
              <br/>• Did anyone ask you to make this payment urgently?
              <br/>• Is the amount what you intended?
            </p>
          </div>

          {/* SVG countdown ring */}
          <div style={{position:"relative",width:88,height:88,margin:"0 auto 18px"}}>
            <svg width="88"height="88"viewBox="0 0 88 88"style={{transform:"rotate(-90deg)"}}>
              <circle cx="44"cy="44"r="34"fill="none"stroke="#f1f5f9"strokeWidth="8"/>
              <circle cx="44"cy="44"r="34"fill="none"stroke={done?"#22c55e":"#f59e0b"}strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference*(1-pct/100)}
                style={{transition:"stroke-dashoffset 1s linear,stroke .3s"}}/>
            </svg>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",
              justifyContent:"center",fontSize:26,fontWeight:800,
              color:done?"#166534":"#f59e0b",fontFamily:"monospace"}}>
              {done?"✓":secs}
            </div>
          </div>

          {/* Countdown bar */}
          <div style={{height:4,background:"#f1f5f9",borderRadius:2,overflow:"hidden",marginBottom:20}}>
            <div style={{height:"100%",width:`${pct}%`,
              background:`linear-gradient(90deg,#f59e0b,${done?"#22c55e":"#f97316"})`,
              borderRadius:2,transition:"width 1s linear,background .3s"}}/>
          </div>

          <p style={{fontSize:12,color:"#94a3b8",marginBottom:16}}>
            {done?"You may now confirm your payment":"Please review the details above"}
          </p>

          <div style={{display:"flex",gap:10}}>
            <button onClick={onCancel}
              style={{flex:1,padding:"11px",background:"#f8faff",border:"1px solid #e2e8f0",
                borderRadius:12,fontWeight:600,fontSize:14,cursor:"pointer",color:"#64748b",
                fontFamily:"'DM Sans',sans-serif"}}>
              Cancel
            </button>
            <button onClick={()=>{if(done)onConfirm();}} disabled={!done}
              className="btn-primary"
              style={{flex:2,padding:"11px",border:"none",borderRadius:12,fontWeight:700,fontSize:14,
                cursor:done?"pointer":"not-allowed",fontFamily:"'DM Sans',sans-serif",
                background:done?"linear-gradient(135deg,#22c55e,#16a34a)":"#93c5fd",
                color:"#fff",boxShadow:done?"0 4px 14px rgba(34,197,94,.3)":"none",
                transition:"all .3s"}}>
              {done?"✓ Confirm Payment →":"Reviewing…"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}


/* ═══ COOLDOWN MODAL with working timer ═══ */
function CooldownModal({remaining, reason, onClose}){
  const [seconds, setSeconds] = useState(remaining);
  
  useEffect(() => {
    if (seconds <= 0) {
      onClose();
      return;
    }
    const timer = setInterval(() => setSeconds(s => s - 1), 1000);
    return () => clearInterval(timer);
  }, [seconds, onClose]);
  
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  return (
    <Modal>
      <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:9999,
        background:"rgba(10,25,70,.65)",backdropFilter:"blur(8px)",
        display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{background:"#fff",borderRadius:24,maxWidth:380,padding:"30px",textAlign:"center"}}>
          <div style={{width:70,height:70,borderRadius:"50%",background:"#fef2f2",
            display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
            {Ic.warn("#dc2626")}
          </div>
          <h3 style={{fontSize:20,fontWeight:800,color:"#0f172a",marginBottom:8}}>Unusual Activity Detected</h3>
          <p style={{color:"#64748b",marginBottom:16}}>{reason || "Too many rapid small payments detected."}</p>
          <div style={{fontSize:48,fontWeight:800,color:"#0078FF",marginBottom:16,fontFamily:"monospace"}}>
            {mins}:{secs.toString().padStart(2,'0')}
          </div>
          <div style={{width:"100%",height:4,background:"#f1f5f9",borderRadius:2,marginBottom:16}}>
            <div style={{height:"100%",width:`${(seconds/remaining)*100}%`,background:"#0078FF",
              borderRadius:2,transition:"width 1s linear"}}/>
          </div>
          <p style={{fontSize:13,color:"#94a3b8"}}>Please wait before your next transaction</p>
        </div>
      </div>
    </Modal>
  );
}

/* ═══ FREEZE MODAL with working timer ═══ */
function FreezeModal({message, permanent, remaining, onClose}){
  const [seconds, setSeconds] = useState(remaining || 0);
  
  useEffect(() => {
    if (permanent || seconds <= 0) return;
    
    const timer = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) {
          onClose();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds, permanent, onClose]);
  
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  return (
    <Modal>
      <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:9999,
        background:"rgba(10,25,70,.65)",backdropFilter:"blur(8px)",
        display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{background:"#fff",borderRadius:24,maxWidth:380,padding:"30px",textAlign:"center"}}>
          <div style={{width:70,height:70,borderRadius:"50%",background:permanent?"#fef2f2":"#fff7ed",
            display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
            {Ic.freeze(permanent?"#dc2626":"#f97316")}
          </div>
          <h3 style={{fontSize:20,fontWeight:800,color:permanent?"#dc2626":"#f97316",marginBottom:8}}>
            {permanent ? "Account Locked" : "Account Paused"}
          </h3>
          <p style={{color:"#64748b",marginBottom:16}}>{message}</p>
          {!permanent && seconds > 0 && (
            <>
              <div style={{fontSize:36,fontWeight:800,color:"#0078FF",marginBottom:16,fontFamily:"monospace"}}>
                {mins}:{secs.toString().padStart(2,'0')}
              </div>
              <div style={{width:"100%",height:4,background:"#f1f5f9",borderRadius:2,marginBottom:16}}>
                <div style={{height:"100%",width:`${(seconds/(remaining||1))*100}%`,background:"#0078FF",
                  borderRadius:2,transition:"width 1s linear"}}/>
              </div>
            </>
          )}
          <button onClick={onClose}
            style={{width:"100%",padding:"12px",background:permanent?"#f1f5f9":"#0078FF",
              border:"none",borderRadius:12,fontWeight:600,cursor:"pointer",
              color:permanent?"#0f172a":"#fff"}}>
            {permanent ? "Contact Support" : "OK"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ═══ SIDEBAR ═══ */

// ═══════════════════════════════════════════════════════════════════════════
//  SoftRiskPopup  —  Score 40–74  (sticky top-of-page warning banner)
//
//  Renders as a slim, sticky banner pinned to the top of the Send Money
//  form (not a modal). User can read the signal, then either cancel or
//  proceed straight to PIN. No full-screen takeover.
// ═══════════════════════════════════════════════════════════════════════════
function SoftRiskPopup({ score, signals, amount, recipient, onProceed, onCancel }) {
  const [dismissed, setDismissed] = React.useState(false);
  if (dismissed) return null;

  const isHighEnd = score >= 60;   // 60-74 — orange tint, more urgent
  const topSignal = signals && signals.length > 0 ? signals[0] : "Mildly unusual transaction detected.";

  // Color palette: yellow → orange as the score climbs through 40-74
  const palette = isHighEnd
    ? { bg: "#fff7ed", border: "#fdba74", headColor: "#9a3412", subColor: "#c2410c",
        barTrack: "#fed7aa", barFrom: "#fb923c", barTo: "#ea580c", chip: "#ea580c" }
    : { bg: "#fffbeb", border: "#fcd34d", headColor: "#92400e", subColor: "#b45309",
        barTrack: "#fde68a", barFrom: "#fbbf24", barTo: "#f59e0b", chip: "#d97706" };

  return (
    <div style={{
      position: "sticky",
      top: 0,
      zIndex: 50,
      marginBottom: 16,
      animation: "slideDown .25s cubic-bezier(.16,1,.3,1)",
    }}>
      <div style={{
        background: palette.bg,
        border: `1.5px solid ${palette.border}`,
        borderRadius: 12,
        padding: "12px 14px",
        boxShadow: "0 6px 18px rgba(245,158,11,.10)",
      }}>
        {/* Top row: icon + headline + close */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
            background: `linear-gradient(135deg, ${palette.barFrom}, ${palette.barTo})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, color: "#fff",
            boxShadow: `0 2px 6px rgba(245,158,11,.30)`,
          }}>⚠</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: palette.headColor, lineHeight: 1.25 }}>
              Mild risk detected
            </div>
            <div style={{ fontSize: 11, color: palette.subColor, marginTop: 1, lineHeight: 1.35 }}>
              ₹{Number(amount).toLocaleString("en-IN")} to <strong>{recipient}</strong> — review before paying
            </div>
          </div>
          <button onClick={() => setDismissed(true)} aria-label="Dismiss"
            style={{ background: "transparent", border: "none", cursor: "pointer",
              padding: 4, marginLeft: 2, color: palette.subColor, lineHeight: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Single signal line */}
        <div style={{
          fontSize: 12, color: palette.headColor, lineHeight: 1.45,
          background: "rgba(255,255,255,.55)", borderRadius: 8, padding: "7px 10px",
          border: `1px solid ${palette.border}`, marginBottom: 10,
        }}>
          {topSignal}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "9px 0",
            background: "#fff", border: `1.5px solid ${palette.border}`,
            borderRadius: 8, fontSize: 12, fontWeight: 700,
            color: palette.headColor, cursor: "pointer",
            fontFamily: "'Inter', sans-serif",
          }}>
            Cancel
          </button>
          <button onClick={onProceed} style={{
            flex: 2, padding: "9px 0",
            background: `linear-gradient(135deg, ${palette.barFrom}, ${palette.barTo})`,
            border: "none", borderRadius: 8,
            fontSize: 12, fontWeight: 700,
            color: "#fff", cursor: "pointer",
            fontFamily: "'Inter', sans-serif",
            boxShadow: "0 2px 6px rgba(245,158,11,.30)",
          }}>
            I understand, pay with PIN →
          </button>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
//  PinTimeoutModal  —  Re-authentication after 5 min inactivity
// ═══════════════════════════════════════════════════════════════════════════
function PinTimeoutModal({ userPin, onSuccess, onCancel }) {
  const [entered, setEntered]   = React.useState("");
  const [error,   setError]     = React.useState("");
  const [shake,   setShake]     = React.useState(false);
  const PIN_LENGTH = 4;

  function handleDigit(d) {
    if (entered.length >= PIN_LENGTH) return;
    const next = entered + d;
    setEntered(next);
    setError("");
    if (next.length === PIN_LENGTH) {
      setTimeout(() => verify(next), 120);
    }
  }

  function handleDelete() {
    setEntered(e => e.slice(0, -1));
    setError("");
  }

  function verify(pin) {
    if (pin === String(userPin)) {
      onSuccess();
    } else {
      setShake(true);
      setError("Incorrect PIN");
      setEntered("");
      setTimeout(() => setShake(false), 500);
    }
  }

  const digits = [1,2,3,4,5,6,7,8,9,null,0,"⌫"];

  return (
    <Modal>
      <div style={{
        padding: "28px 24px 20px",
        animation: shake ? "shake .4s ease" : "slideDown .25s ease",
        maxWidth: 340, margin: "0 auto",
      }}>

        {/* Icon + headline */}
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{
            width:56, height:56, borderRadius:"50%", margin:"0 auto 14px",
            background:"linear-gradient(135deg,#f59e0b,#ef4444)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:26, boxShadow:"0 4px 16px rgba(239,68,68,.25)",
          }}>🔒</div>
          <h3 style={{
            fontSize:18, fontWeight:800, color:"#0f172a", marginBottom:6
          }}>
            Session Timed Out
          </h3>
          <p style={{ fontSize:13, color:"#64748b", lineHeight:1.5 }}>
            You've been inactive for 5 minutes.<br/>
            Enter your PIN to continue.
          </p>
        </div>

        {/* PIN dots */}
        <div style={{
          display:"flex", justifyContent:"center", gap:14, marginBottom:6
        }}>
          {Array.from({length: PIN_LENGTH}).map((_, i) => (
            <div key={i} style={{
              width:14, height:14, borderRadius:"50%",
              background: i < entered.length ? "#0078FF" : "#e2e8f0",
              border: `2px solid ${i < entered.length ? "#0078FF" : "#cbd5e1"}`,
              transition:"background .15s, border .15s",
              transform: i < entered.length ? "scale(1.15)" : "scale(1)",
            }}/>
          ))}
        </div>

        {/* Error */}
        <div style={{
          textAlign:"center", fontSize:12, color:"#ef4444",
          fontWeight:600, minHeight:18, marginBottom:16,
        }}>
          {error}
        </div>

        {/* Numpad */}
        <div style={{
          display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10,
          marginBottom:16,
        }}>
          {digits.map((d, i) => {
            if (d === null) return <div key={i}/>;
            const isDelete = d === "⌫";
            return (
              <button key={i}
                onClick={() => isDelete ? handleDelete() : handleDigit(String(d))}
                style={{
                  padding:"15px 0",
                  background: isDelete ? "#f8faff" : "#fff",
                  border:`1.5px solid ${isDelete ? "#e2e8f0" : "#e8f0fe"}`,
                  borderRadius:12,
                  fontSize: isDelete ? 18 : 20,
                  fontWeight: 700,
                  color: isDelete ? "#94a3b8" : "#0f172a",
                  cursor:"pointer",
                  fontFamily:"'DM Sans',sans-serif",
                  transition:"background .1s, transform .1s",
                  active: { transform:"scale(.95)" },
                }}
                onMouseDown={e => e.currentTarget.style.transform="scale(.95)"}
                onMouseUp={e => e.currentTarget.style.transform="scale(1)"}
              >
                {d}
              </button>
            );
          })}
        </div>

        {/* Timeout info strip */}
        <div style={{
          background:"#fff7ed", border:"1px solid #fed7aa",
          borderRadius:8, padding:"8px 12px", marginBottom:14,
          fontSize:11, color:"#c2410c", textAlign:"center", lineHeight:1.4,
        }}>
          🛡 For your security, we require PIN re-entry after 5 minutes of inactivity
        </div>

        {/* Cancel */}
        <button onClick={onCancel} style={{
          width:"100%", padding:"11px 0",
          background:"#f8faff", border:"1.5px solid #e2e8f0",
          borderRadius:10, fontSize:13, fontWeight:700,
          color:"#64748b", cursor:"pointer",
          fontFamily:"'DM Sans',sans-serif",
        }}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
//  SecurityWarningBanner  —  shown when VPN or screen recording detected
// ═══════════════════════════════════════════════════════════════════════════
function SecurityWarningBanner({ status, onDismiss }) {
  const vpn = status?.vpn;
  const sr  = status?.screenRecording;

  const hasVPN = vpn?.detected;
  const hasSR  = sr?.detected;

  if (!hasVPN && !hasSR) return null;

  // Both detected → critical; one detected → high
  const isCritical = hasVPN && hasSR;

  const bg     = isCritical ? "#7c3aed" : hasVPN ? "#dc2626" : "#f97316";
  const border = isCritical ? "#a855f7" : hasVPN ? "#ef4444" : "#fb923c";
  const icon   = isCritical ? "🚨" : hasVPN ? "🛡" : "📹";

  return React.createElement("div", {
    style: {
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: bg,
      borderBottom: `2px solid ${border}`,
      padding: "10px 16px",
      display: "flex", alignItems: "flex-start", gap: 10,
      animation: "slideDown .3s ease",
      boxShadow: "0 4px 20px rgba(0,0,0,.25)",
    }
  },
    // icon
    React.createElement("span", { style: { fontSize: 18, flexShrink: 0, marginTop: 1 } }, icon),

    // text block
    React.createElement("div", { style: { flex: 1, minWidth: 0 } },
      React.createElement("div", {
        style: { fontSize: 12, fontWeight: 800, color: "#fff",
                 textTransform: "uppercase", letterSpacing: .6, marginBottom: 3 }
      }, isCritical ? "⚠ Security Alert — VPN & Screen Recording Detected"
         : hasVPN   ? "⚠ VPN / Proxy Connection Detected"
                    : "⚠ Screen Recording Detected"),

      hasVPN && React.createElement("div", {
        style: { fontSize: 11, color: "rgba(255,255,255,.85)", lineHeight: 1.4, marginBottom: hasSR ? 4 : 0 }
      }, `🌐 ${vpn.reason}`),

      hasSR && React.createElement("div", {
        style: { fontSize: 11, color: "rgba(255,255,255,.85)", lineHeight: 1.4 }
      }, `📹 ${sr.reason}`),

      React.createElement("div", {
        style: { fontSize: 10, color: "rgba(255,255,255,.7)", marginTop: 4 }
      }, "Payments on IronWallet should only be made on a secure, private connection.")
    ),

    // dismiss button
    React.createElement("button", {
      onClick: onDismiss,
      style: {
        background: "rgba(255,255,255,.2)", border: "none",
        borderRadius: 6, color: "#fff", fontSize: 11,
        fontWeight: 700, padding: "4px 10px", cursor: "pointer",
        flexShrink: 0, fontFamily: "'DM Sans',sans-serif",
        whiteSpace: "nowrap",
      }
    }, "Dismiss")
  );
}


// ═══════════════════════════════════════════════════════════════════════════
//  SecurityStatusChip  —  small inline chip inside send-money form
//  Shows a green "Secure" or red "VPN / Recording" chip
// ═══════════════════════════════════════════════════════════════════════════
function SecurityStatusChip({ status }) {
  const vpn = status?.vpn;
  const sr  = status?.screenRecording;
  const checking = vpn?.checking;

  if (checking) {
    return React.createElement("div", {
      style: {
        display: "flex", alignItems: "center", gap: 5,
        fontSize: 10, color: "#94a3b8",
        padding: "3px 8px", background: "#f8faff",
        borderRadius: 20, border: "1px solid #e2e8f0",
        width: "fit-content",
      }
    },
      React.createElement("span", {
        style: {
          width: 6, height: 6, borderRadius: "50%",
          background: "#94a3b8",
          animation: "pulse 1s ease infinite",
        }
      }),
      "Checking connection…"
    );
  }

  const hasIssue = vpn?.detected || sr?.detected;

  return React.createElement("div", {
    style: {
      display: "flex", alignItems: "center", gap: 5,
      fontSize: 10, fontWeight: 700,
      color: hasIssue ? "#dc2626" : "#16a34a",
      padding: "3px 8px",
      background: hasIssue ? "#fef2f2" : "#f0fdf4",
      borderRadius: 20,
      border: `1px solid ${hasIssue ? "#fca5a5" : "#86efac"}`,
      width: "fit-content",
    }
  },
    React.createElement("span", {
      style: {
        width: 6, height: 6, borderRadius: "50%",
        background: hasIssue ? "#dc2626" : "#16a34a",
      }
    }),
    hasIssue
      ? [vpn?.detected && "VPN", sr?.detected && "Recording"].filter(Boolean).join(" + ") + " Detected"
      : "Connection Secure"
  );
}


// ═══════════════════════════════════════════════════════════════════════════
//  CoolingPeriodModal  —  Forced 30-second wait for score >= 90
//  Shows countdown + all risk reasons so the user is actively reading.
//  Cannot confirm early. Can cancel anytime.
// ═══════════════════════════════════════════════════════════════════════════
function CoolingPeriodModal({ score, signals, recipient, amount, onComplete, onCancel }) {
  const COOLING_SECS = 30;
  const [timeLeft,  setTimeLeft]  = React.useState(COOLING_SECS);
  const [readCount, setReadCount] = React.useState(0);   // signals scrolled past
  const [canProceed, setCanProceed] = React.useState(false);
  const timerRef = React.useRef(null);
  const listRef  = React.useRef(null);

  // Countdown
  React.useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          setCanProceed(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Track scroll through signals list
  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      const pct = el.scrollTop / Math.max(el.scrollHeight - el.clientHeight, 1);
      setReadCount(Math.round(pct * (signals || []).length));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [signals]);

  const progress  = ((COOLING_SECS - timeLeft) / COOLING_SECS) * 100;
  const ringColor = timeLeft > 15 ? "#ef4444" : timeLeft > 5 ? "#f97316" : "#22c55e";

  // Circumference of the SVG ring
  const R   = 44;
  const C   = 2 * Math.PI * R;
  const dash = C - (progress / 100) * C;

  return React.createElement(Modal, null,
    React.createElement("div", {
      style: { padding: "0 0 4px", maxWidth: 380, margin: "0 auto" }
    },

      // ── Red gradient header ──────────────────────────────────────────────
      React.createElement("div", {
        style: {
          background: "linear-gradient(135deg,#7f1d1d,#dc2626)",
          padding: "22px 20px 18px",
          borderRadius: "14px 14px 0 0",
          textAlign: "center",
        }
      },
        // Ring timer
        React.createElement("div", { style: { position: "relative", display: "inline-block", marginBottom: 10 } },
          React.createElement("svg", { width: 108, height: 108, style: { transform: "rotate(-90deg)" } },
            // Background ring
            React.createElement("circle", {
              cx: 54, cy: 54, r: R,
              fill: "none", stroke: "rgba(255,255,255,.15)", strokeWidth: 7,
            }),
            // Progress ring
            React.createElement("circle", {
              cx: 54, cy: 54, r: R,
              fill: "none", stroke: ringColor, strokeWidth: 7,
              strokeDasharray: C, strokeDashoffset: dash,
              strokeLinecap: "round",
              style: { transition: "stroke-dashoffset 1s linear, stroke .5s ease" },
            }),
          ),
          // Center number
          React.createElement("div", {
            style: {
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
            }
          },
            React.createElement("span", {
              style: { fontSize: 28, fontWeight: 900, color: "#fff", lineHeight: 1 }
            }, timeLeft),
            React.createElement("span", {
              style: { fontSize: 10, color: "rgba(255,255,255,.7)", marginTop: 2 }
            }, "seconds"),
          ),
        ),
        React.createElement("div", {
          style: { fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 4 }
        }, "\uD83D\uDEA8 High-Risk Payment — Cooling Period"),
        React.createElement("div", {
          style: { fontSize: 12, color: "rgba(255,255,255,.8)", lineHeight: 1.5 }
        }, "Please review all risk signals below before proceeding.\nYou cannot confirm until the timer reaches zero."),
      ),

      // ── Amount + recipient summary ──────────────────────────────────────
      React.createElement("div", {
        style: {
          background: "#fef2f2", borderLeft: "4px solid #dc2626",
          padding: "10px 16px", margin: "0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }
      },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 10, color: "#94a3b8", fontWeight: 700 } }, "SENDING TO"),
          React.createElement("div", { style: { fontSize: 13, fontWeight: 800, color: "#0f172a" } }, recipient),
        ),
        React.createElement("div", { style: { textAlign: "right" } },
          React.createElement("div", { style: { fontSize: 10, color: "#94a3b8", fontWeight: 700 } }, "AMOUNT"),
          React.createElement("div", { style: { fontSize: 16, fontWeight: 900, color: "#dc2626" } },
            "\u20B9" + Number(amount).toLocaleString("en-IN")
          ),
        ),
      ),

      // ── Risk signals list (scrollable) ──────────────────────────────────
      React.createElement("div", {
        style: { padding: "12px 16px 4px" }
      },
        React.createElement("div", {
          style: {
            fontSize: 10, fontWeight: 800, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: .7, marginBottom: 8,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }
        },
          React.createElement("span", null, "\u26A0 Risk Signals Detected"),
          React.createElement("span", {
            style: { color: readCount >= (signals||[]).length ? "#16a34a" : "#f97316" }
          }, readCount >= (signals||[]).length ? "\u2713 All reviewed" : "Scroll to review \u2193"),
        ),
        React.createElement("div", {
          ref: listRef,
          style: {
            maxHeight: 160, overflowY: "auto",
            display: "flex", flexDirection: "column", gap: 6,
            paddingRight: 4,
          }
        },
          ...(signals || ["No specific signals recorded."]).map((sig, i) =>
            React.createElement("div", { key: i,
              style: {
                padding: "8px 10px", borderRadius: 8,
                background: i < readCount ? "#f0fdf4" : "#fef2f2",
                border: `1px solid ${i < readCount ? "#86efac" : "#fca5a5"}`,
                fontSize: 12, color: "#374151", lineHeight: 1.4,
                transition: "background .3s, border .3s",
                display: "flex", gap: 8, alignItems: "flex-start",
              }
            },
              React.createElement("span", { style: { flexShrink: 0, marginTop: 1 } },
                i < readCount ? "\u2705" : "\u26A0\uFE0F"
              ),
              sig,
            )
          ),
        ),
      ),

      // ── Progress bar ────────────────────────────────────────────────────
      React.createElement("div", { style: { padding: "10px 16px 4px" } },
        React.createElement("div", {
          style: {
            height: 6, background: "#f1f5f9",
            borderRadius: 3, overflow: "hidden",
          }
        },
          React.createElement("div", {
            style: {
              height: "100%", borderRadius: 3,
              width: `${progress}%`,
              background: `linear-gradient(90deg,#dc2626,${ringColor})`,
              transition: "width 1s linear",
            }
          }),
        ),
        React.createElement("div", {
          style: {
            display: "flex", justifyContent: "space-between",
            fontSize: 10, color: "#94a3b8", marginTop: 4,
          }
        },
          React.createElement("span", null, canProceed ? "\u2705 Review complete" : "Cooling period active\u2026"),
          React.createElement("span", null, `${Math.round(progress)}% elapsed`),
        ),
      ),

      // ── Action buttons ──────────────────────────────────────────────────
      React.createElement("div", {
        style: { padding: "10px 16px 16px", display: "flex", gap: 10 }
      },
        React.createElement("button", { onClick: onCancel,
          style: {
            flex: 1, padding: "12px 0",
            background: "#f8faff", border: "1.5px solid #e2e8f0",
            borderRadius: 10, fontSize: 13, fontWeight: 700,
            color: "#64748b", cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif",
          }
        }, "Cancel Payment"),
        React.createElement("button", {
          onClick: canProceed ? onComplete : undefined,
          disabled: !canProceed,
          style: {
            flex: 2, padding: "12px 0",
            background: canProceed
              ? "linear-gradient(135deg,#16a34a,#15803d)"
              : "#e2e8f0",
            border: "none", borderRadius: 10,
            fontSize: 13, fontWeight: 700,
            color: canProceed ? "#fff" : "#94a3b8",
            cursor: canProceed ? "pointer" : "not-allowed",
            fontFamily: "'DM Sans',sans-serif",
            transition: "background .4s ease",
            boxShadow: canProceed ? "0 2px 8px rgba(22,163,74,.35)" : "none",
          }
        }, canProceed ? "\u2705 I have reviewed — Proceed" : `Wait ${timeLeft}s to proceed`),
      ),

      // ── RBI-style disclaimer ─────────────────────────────────────────────
      React.createElement("div", {
        style: {
          margin: "0 16px 14px",
          background: "#fffbeb", border: "1px solid #fcd34d",
          borderRadius: 8, padding: "8px 12px",
          fontSize: 10, color: "#92400e", lineHeight: 1.45, textAlign: "center",
        }
      },
        "\uD83C\uDFDB\uFE0F As per RBI guidelines, IronWallet applies a mandatory review period for high-risk transactions. This protects you from impersonation and social engineering fraud."
      ),
    )
  );
}


// ═══════════════════════════════════════════════════════════════════════════
//  ManualFreezeConfirmModal — confirms the user wants to freeze outgoing payments
// ═══════════════════════════════════════════════════════════════════════════
function ManualFreezeConfirmModal({ onConfirm, onCancel }) {
  return React.createElement(Modal, null,
    React.createElement("div", { style: { padding: "24px 22px 20px", maxWidth: 360, margin: "0 auto", textAlign: "center" } },

      React.createElement("div", {
        style: {
          width: 60, height: 60, borderRadius: "50%", margin: "0 auto 16px",
          background: "linear-gradient(135deg,#dc2626,#991b1b)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, boxShadow: "0 4px 16px rgba(220,38,38,.3)",
        }
      }, "\uD83D\uDD12"),

      React.createElement("h3", {
        style: { fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 8 }
      }, "Freeze Outgoing Payments?"),

      React.createElement("p", {
        style: { fontSize: 13, color: "#64748b", lineHeight: 1.6, marginBottom: 18 }
      }, "This will immediately block all outgoing transfers from your account. You can still receive money and view your balance and history."),

      React.createElement("div", {
        style: {
          background: "#f8faff", border: "1px solid #e2e8f0", borderRadius: 10,
          padding: "12px 14px", marginBottom: 18, textAlign: "left",
        }
      },
        React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 6 } }, "What stays available:"),
        ["\u2705 View balance & transaction history", "\u2705 Receive payments from others", "\u2705 Log in and use the app normally"].map((t,i) =>
          React.createElement("div", { key: i, style: { fontSize: 12, color: "#16a34a", marginBottom: 3 } }, t)
        ),
        React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "#dc2626", marginTop: 8, marginBottom: 4 } }, "What gets blocked:"),
        React.createElement("div", { style: { fontSize: 12, color: "#dc2626" } }, "\u274C Sending money to anyone"),
      ),

      React.createElement("div", { style: { fontSize: 11, color: "#94a3b8", marginBottom: 18 } },
        "You'll need your PIN and OTP to unfreeze later."
      ),

      React.createElement("div", { style: { display: "flex", gap: 10 } },
        React.createElement("button", { onClick: onCancel,
          style: {
            flex: 1, padding: "12px 0", background: "#fff",
            border: "1.5px solid #d1d5db", borderRadius: 10,
            fontSize: 13, fontWeight: 700, color: "#374151", cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif",
          }
        }, "Cancel"),
        React.createElement("button", { onClick: onConfirm,
          style: {
            flex: 1, padding: "12px 0",
            background: "linear-gradient(135deg,#dc2626,#991b1b)",
            border: "none", borderRadius: 10,
            fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif",
            boxShadow: "0 2px 8px rgba(220,38,38,.35)",
          }
        }, "\uD83D\uDD12 Freeze Now"),
      ),
    )
  );
}


// ═══════════════════════════════════════════════════════════════════════════
//  ManualFreezeBanner — persistent banner shown on dashboard while frozen
// ═══════════════════════════════════════════════════════════════════════════
function ManualFreezeBanner({ onUnfreeze }) {
  return React.createElement("div", {
    style: {
      background: "linear-gradient(135deg,#7f1d1d,#dc2626)",
      borderRadius: 14, padding: "14px 16px", marginBottom: 14,
      display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 4px 16px rgba(220,38,38,.25)",
      animation: "slideDown .3s ease",
    }
  },
    React.createElement("div", {
      style: {
        width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
        background: "rgba(255,255,255,.15)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
      }
    }, "\uD83D\uDD12"),

    React.createElement("div", { style: { flex: 1, minWidth: 0 } },
      React.createElement("div", {
        style: { fontSize: 13, fontWeight: 800, color: "#fff", marginBottom: 2 }
      }, "Account Frozen — Outgoing Payments Blocked"),
      React.createElement("div", {
        style: { fontSize: 11, color: "rgba(255,255,255,.8)" }
      }, "You can still receive money. Unfreeze anytime with PIN + OTP."),
    ),

    React.createElement("button", { onClick: onUnfreeze,
      style: {
        background: "#fff", border: "none", borderRadius: 8,
        padding: "8px 14px", fontSize: 12, fontWeight: 800,
        color: "#dc2626", cursor: "pointer", flexShrink: 0,
        fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap",
      }
    }, "Unfreeze")
  );
}


// ═══════════════════════════════════════════════════════════════════════════
//  UnfreezeOtpModal — second factor required after PIN to unfreeze
// ═══════════════════════════════════════════════════════════════════════════
function UnfreezeOtpModal({ user, onSuccess, onCancel }) {
  const [otp, setOtp]       = React.useState("");
  const [sentOtp, setSentOtp] = React.useState(null);
  const [error, setError]   = React.useState("");
  const [sending, setSending] = React.useState(true);
  const [resendIn, setResendIn] = React.useState(30);

  React.useEffect(() => {
    sendOtp();
    const t = setInterval(() => setResendIn(s => s > 0 ? s - 1 : 0), 1000);
    return () => clearInterval(t);
  }, []);

  async function sendOtp() {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`${typeof API !== "undefined" ? API : ""}/send-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: user.number }),
      });
      const data = await res.json();
      if (data._dev_otp) setSentOtp(data._dev_otp);   // dev mode fallback
      setResendIn(30);
    } catch (e) {
      setError("Could not send OTP. Try again.");
    }
    setSending(false);
  }

  async function verify() {
    if (otp.length !== 6) return;
    try {
      const res = await fetch(`${typeof API !== "undefined" ? API : ""}/verify-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: user.number, otp }),
      });
      const data = await res.json();
      if (data.status === "SUCCESS") {
        onSuccess();
      } else {
        setError(data.status === "OTP_EXPIRED" ? "OTP expired — resend and try again." : "Incorrect OTP.");
        setOtp("");
      }
    } catch (e) {
      setError("Verification failed. Try again.");
    }
  }

  return React.createElement(Modal, null,
    React.createElement("div", { style: { padding: "24px 22px 20px", maxWidth: 360, margin: "0 auto", textAlign: "center" } },

      React.createElement("div", {
        style: {
          width: 56, height: 56, borderRadius: "50%", margin: "0 auto 14px",
          background: "linear-gradient(135deg,#16a34a,#15803d)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, boxShadow: "0 4px 16px rgba(22,163,74,.3)",
        }
      }, "\uD83D\uDD13"),

      React.createElement("h3", {
        style: { fontSize: 17, fontWeight: 800, color: "#0f172a", marginBottom: 6 }
      }, "Confirm Unfreeze"),

      React.createElement("p", {
        style: { fontSize: 12, color: "#64748b", lineHeight: 1.5, marginBottom: 4 }
      }, `Enter the 6-digit OTP sent to +91 ${String(user.number).replace(/(\\d{5})(\\d{5})/, "$1 $2")}`),

      sentOtp && React.createElement("p", {
        style: { fontSize: 11, color: "#16a34a", fontWeight: 700, marginBottom: 14 }
      }, `Dev mode OTP: ${sentOtp}`),

      React.createElement("input", {
        type: "text", inputMode: "numeric", maxLength: 6,
        value: otp,
        onChange: e => { setOtp(e.target.value.replace(/\\D/g,"")); setError(""); },
        placeholder: "000000",
        style: {
          width: "100%", padding: "12px 0", textAlign: "center",
          fontSize: 22, fontWeight: 800, letterSpacing: 8,
          border: `1.5px solid ${error ? "#fca5a5" : "#e2e8f0"}`,
          borderRadius: 10, marginBottom: 8, marginTop: 14,
          fontFamily: "'DM Sans',sans-serif", color: "#0f172a",
          outline: "none",
        }
      }),

      React.createElement("div", { style: { fontSize: 11, color: "#ef4444", minHeight: 16, marginBottom: 10 } }, error),

      React.createElement("button", {
        onClick: sendOtp, disabled: resendIn > 0 || sending,
        style: {
          background: "none", border: "none", fontSize: 11,
          color: resendIn > 0 ? "#94a3b8" : "#0078FF",
          fontWeight: 700, cursor: resendIn > 0 ? "default" : "pointer",
          marginBottom: 16, fontFamily: "'DM Sans',sans-serif",
        }
      }, resendIn > 0 ? `Resend OTP in ${resendIn}s` : "Resend OTP"),

      React.createElement("div", { style: { display: "flex", gap: 10 } },
        React.createElement("button", { onClick: onCancel,
          style: {
            flex: 1, padding: "12px 0", background: "#f8faff",
            border: "1.5px solid #e2e8f0", borderRadius: 10,
            fontSize: 13, fontWeight: 700, color: "#64748b", cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif",
          }
        }, "Cancel"),
        React.createElement("button", {
          onClick: verify, disabled: otp.length !== 6,
          style: {
            flex: 2, padding: "12px 0",
            background: otp.length === 6 ? "linear-gradient(135deg,#16a34a,#15803d)" : "#e2e8f0",
            border: "none", borderRadius: 10,
            fontSize: 13, fontWeight: 700,
            color: otp.length === 6 ? "#fff" : "#94a3b8",
            cursor: otp.length === 6 ? "pointer" : "not-allowed",
            fontFamily: "'DM Sans',sans-serif",
          }
        }, "Unfreeze Account"),
      ),
    )
  );
}


// ═══════════════════════════════════════════════════════════════════════════
//  AccountFrozenScreen — shown if user tries to send money while frozen
// ═══════════════════════════════════════════════════════════════════════════
function AccountFrozenScreen({ user, onUnfreeze, onBack }) {
  const [showPin, setShowPin] = React.useState(false);
  const [showOtp, setShowOtp] = React.useState(false);

  function handlePinSuccess() {
    setShowPin(false);
    setShowOtp(true);
  }
  function handleOtpSuccess() {
    localStorage.removeItem("iw_manual_freeze_" + user.number);
    setShowOtp(false);
    onUnfreeze();
  }

  return React.createElement("div", { style: { padding: "10px 0", textAlign: "center" } },

    React.createElement("div", {
      style: {
        width: 84, height: 84, borderRadius: "50%", margin: "0 auto 18px",
        background: "linear-gradient(135deg,#7f1d1d,#dc2626)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 38, boxShadow: "0 6px 24px rgba(220,38,38,.3)",
      }
    }, "\uD83D\uDD12"),

    React.createElement("h2", {
      style: { fontSize: 20, fontWeight: 900, color: "#0f172a", marginBottom: 8 }
    }, "Outgoing Payments Frozen"),

    React.createElement("p", {
      style: { fontSize: 13, color: "#64748b", lineHeight: 1.6, maxWidth: 320, margin: "0 auto 22px" }
    }, "You manually froze your account. Unfreeze it with your PIN and OTP to send this payment."),

    React.createElement("div", {
      style: {
        background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10,
        padding: "10px 16px", maxWidth: 320, margin: "0 auto 22px",
        fontSize: 11, color: "#991b1b", lineHeight: 1.5,
      }
    }, "If you didn't freeze this account, someone with access to your PIN may have. Contact support immediately."),

    React.createElement("div", { style: { display: "flex", gap: 10, maxWidth: 320, margin: "0 auto" } },
      React.createElement("button", { onClick: onBack,
        style: {
          flex: 1, padding: "13px 0", background: "#fff",
          border: "1.5px solid #d1d5db", borderRadius: 10,
          fontSize: 13, fontWeight: 700, color: "#374151", cursor: "pointer",
          fontFamily: "'DM Sans',sans-serif",
        }
      }, "Go Back"),
      React.createElement("button", { onClick: () => setShowPin(true),
        style: {
          flex: 1, padding: "13px 0",
          background: "linear-gradient(135deg,#16a34a,#15803d)",
          border: "none", borderRadius: 10,
          fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer",
          fontFamily: "'DM Sans',sans-serif",
          boxShadow: "0 2px 8px rgba(22,163,74,.35)",
        }
      }, "\uD83D\uDD13 Unfreeze"),
    ),

    showPin && React.createElement(PINModal, {
      userPin: user.pin, user: user,
      onSuccess: handlePinSuccess,
      onCancel: () => setShowPin(false),
    }),
    showOtp && React.createElement(UnfreezeOtpModal, {
      user: user,
      onSuccess: handleOtpSuccess,
      onCancel: () => setShowOtp(false),
    }),
  );
}
