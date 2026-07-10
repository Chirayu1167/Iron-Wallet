/* ═══ LOGIN PAGE ═══ */
function LoginPage({onLogin}){
  const[mobile,setMobile]=useState("");
  const[pin,setPin]=useState("");
  const[showPin,setShowPin]=useState(false);
  const[otp,setOtp]=useState("");
  const[otpMode,setOtpMode]=useState(false);
  const[msg,setMsg]=useState({text:"",ok:false});
  const[loading,setLoading]=useState(false);
  const[timer,setTimer]=useState(0);
  const[resend,setResend]=useState(false);
  const[pinAttempts,setPinAttempts]=useState(0);
  const[pinLockedUntil,setPinLockedUntil]=useState(null);
  const[mobileErr,setMobileErr]=useState(""); // FEATURE: mobile validation error

  useEffect(()=>{
    if(timer<=0){setResend(true);return;}
    const t=setTimeout(()=>setTimer(p=>p-1),1000);
    return()=>clearTimeout(t);
  },[timer]);

  useEffect(()=>{
    if (pinLockedUntil && new Date() < new Date(pinLockedUntil)) {
      const timer = setInterval(() => {
        if (new Date() >= new Date(pinLockedUntil)) {
          setPinLockedUntil(null);
          setPinAttempts(0);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [pinLockedUntil]);

  async function handleLogin(){
    setMsg({text:"",ok:false});
    
    if (pinLockedUntil && new Date() < new Date(pinLockedUntil)) {
      const remaining = Math.ceil((new Date(pinLockedUntil) - new Date()) / 1000);
      setMsg({text:`Too many attempts. Try again in ${remaining}s`, ok:false});
      return;
    }
    
    if(!otpMode){
      // FEATURE: Validate mobile is exactly 10 digits before proceeding
      const cleanMobile = mobile.replace(/\D/,"");
      if (cleanMobile.length !== 10) {
        setMobileErr("Enter a valid 10-digit mobile number");
        return;
      }
      setMobileErr("");
      const u=Object.entries(USERS).find(([,v])=>v.number===mobile);
      if(!u){setMsg({text:"Invalid Mobile",ok:false}); return;}
      
      if (pin !== u[1].pin) {
        const newAttempts = pinAttempts + 1;
        setPinAttempts(newAttempts);
        if (newAttempts >= 3) {
          setPinLockedUntil(new Date(Date.now() + 7 * 60000).toISOString());
          setMsg({text:"Too many incorrect PINs. Try again in 7 minutes.", ok:false});
        } else {
          setMsg({text:`Incorrect PIN. ${3 - newAttempts} attempt(s) left.`, ok:false});
        }
        return;
      }

      // Admin user - skip OTP server call, accept constant OTP 000000
      if (u[1].isAdmin) {
        setOtpMode(true); setTimer(999); setResend(true);
        setMsg({text:"Admin login — OTP 000000 will be accepted ✔", ok:true});
        setPinAttempts(0);
        return;
      }

      setLoading(true);
      try{
        await fetch(`${API}/send-otp`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mobile})});
        setOtpMode(true);setTimer(30);setResend(false);
        setMsg({text:"OTP sent to your registered mobile 📲",ok:true});
        setPinAttempts(0);
      }catch(e){setMsg({text:"Backend unreachable. Is server running?",ok:false});}
      finally{setLoading(false);}
    }else{
      // Admin user - skip OTP server call, accept constant OTP 000000
      if (mobile === "1234567890" && otp === "000000") {
        setMsg({text:"Login Successful ✔",ok:true});
        const u=Object.entries(USERS).find(([,v])=>v.number===mobile);
        setTimeout(()=>onLogin({...u[1]}),500);
        return;
      }
      setLoading(true);
      try{
        const res=await fetch(`${API}/verify-otp`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mobile,otp})});
        const data=await res.json();
        if(data.status==="SUCCESS"){
          setMsg({text:"Login Successful ✔",ok:true});
          const u=Object.entries(USERS).find(([,v])=>v.number===mobile);
          setTimeout(()=>onLogin({...u[1]}),500);
        }else if(data.status==="OTP_EXPIRED"){setMsg({text:"OTP expired. Resend.",ok:false});}
        else{setMsg({text:"Invalid OTP. Try again.",ok:false});}
      }catch(e){setMsg({text:"Backend unreachable. Is server running?",ok:false});}
      finally{setLoading(false);}
    }
  }

  async function handleResend(){
    setTimer(30);setResend(false);
    try{await fetch(`${API}/send-otp`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mobile})});
      setMsg({text:"OTP resent 📲",ok:true});}
    catch(e){setMsg({text:"Server unreachable.",ok:false});}
  }

  const ready=!loading&&((!otpMode&&mobile.length===10&&pin.length===4)||(otpMode&&otp.length===6));

  return(
    <div style={{minHeight:"100vh",backgroundImage:"url('loginbg.jpg')",backgroundSize:"cover",
      backgroundPosition:"center",display:"flex",alignItems:"center",justifyContent:"center",
      position:"relative",fontFamily:"'DM Sans',sans-serif",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(0,25,80,.75) 0%,rgba(0,80,200,.55) 100%)"}}/>
      <div style={{position:"absolute",top:"6%",right:"10%",width:240,height:240,borderRadius:"50%",
        background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
        animation:"float 7s ease-in-out infinite"}}/>
      <div style={{position:"absolute",bottom:"10%",left:"6%",width:160,height:160,borderRadius:"50%",
        background:"rgba(0,120,255,.1)",border:"1px solid rgba(0,120,255,.18)",
        animation:"float 9s ease-in-out infinite .6s"}}/>

      <div style={{width:"100%",maxWidth:420,padding:"24px 18px",position:"relative",zIndex:1,animation:"scaleIn .5s cubic-bezier(.16,1,.3,1)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
            width:80,height:80,borderRadius:24,
            background:"rgba(255,255,255,.95)",
            boxShadow:"0 10px 36px rgba(0,0,0,.22)",marginBottom:14}}>
            <img src="favicon.png" alt="IronWallet" style={{width:58,height:58,objectFit:"contain",display:"block"}}/>
          </div>
          <h1 style={{color:"#fff",fontSize:32,fontWeight:800,letterSpacing:"-.5px",marginBottom:5}}>IronWallet</h1>
          <p style={{color:"rgba(255,255,255,.6)",fontSize:15}}>India's most secure payment gateway</p>
        </div>

        <div className="glass" style={{borderRadius:24,padding:"30px 26px"}}>
          <h2 style={{fontSize:19,fontWeight:800,color:"#0f172a",marginBottom:3}}>
            {otpMode?"Verify Identity":"Welcome back"}
          </h2>
          <p style={{fontSize:13,color:"#64748b",marginBottom:22}}>
            {otpMode?"Enter the OTP sent to your mobile":"Sign in to your IronWallet account"}
          </p>

          {!otpMode&&(<>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Mobile Number</label>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",
                  fontSize:14,color:"#94a3b8",fontWeight:700,userSelect:"none"}}>+91</span>
                <input type="tel" value={mobile} maxLength={10}
                  onChange={e=>{ setMobile(e.target.value.replace(/\D/,"").slice(0,10)); setMobileErr(""); }} // FEATURE: digit-only + clear error on type
                  placeholder="10-digit number"
                  style={{width:"100%",padding:"11px 12px 11px 44px",borderRadius:10,
                    border:`1.5px solid ${mobile.length===10?"#93c5fd":"#e2e8f0"}`,
                    fontSize:15,outline:"none",boxSizing:"border-box",color:"#0f172a",
                    background:"#f8faff",transition:"border-color .2s",fontFamily:"'DM Sans',sans-serif"}}/>
              </div>
              {/* FEATURE: Mobile validation error */}
              {mobileErr && (
                <div style={{marginTop:6,fontSize:12,color:"#dc2626",fontWeight:600,animation:"slideDown .2s ease"}}>
                  {mobileErr}
                </div>
              )}
            </div>
            <div style={{marginBottom:20}}>
              <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>PIN</label>
              <div style={{position:"relative"}}>
                <input type={showPin?"text":"password"} value={pin} maxLength={4}
                  onChange={e=>setPin(e.target.value.replace(/\D/,"").slice(0,4))}
                  onKeyDown={e=>{ if(e.key==="Enter"&&ready) handleLogin(); }} // FEATURE: Enter key triggers login
                  placeholder="••••"
                  style={{width:"100%",padding:"11px 40px 11px 12px",borderRadius:10,
                    border:`1.5px solid ${pin.length===4?"#93c5fd":"#e2e8f0"}`,
                    fontSize:22,letterSpacing:8,outline:"none",boxSizing:"border-box",
                    color:"#0f172a",background:"#f8faff",fontFamily:"'DM Sans',sans-serif"}}/>
                <button onClick={()=>setShowPin(p=>!p)} style={{position:"absolute",right:12,top:"50%",
                  transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",padding:0}}>
                  {showPin?Ic.eyeOff():Ic.eye()}
                </button>
              </div>
            </div>
          </>)}

          {otpMode&&(
            <div style={{marginBottom:20}}>
              <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>6-Digit OTP</label>
              <input type="text" value={otp} maxLength={6}
                onChange={e=>setOtp(e.target.value.replace(/\D/,"").slice(0,6))}
                placeholder="000000"
                style={{width:"100%",padding:"12px 14px",borderRadius:10,
                  border:`1.5px solid ${otp.length===6?"#93c5fd":"#e2e8f0"}`,
                  fontSize:24,letterSpacing:10,outline:"none",boxSizing:"border-box",
                  color:"#0f172a",textAlign:"center",background:"#f8faff",fontFamily:"'DM Sans',sans-serif"}}/>
              <div style={{textAlign:"center",marginTop:10,fontSize:13,color:"#94a3b8"}}>
                {resend
                  ?<button onClick={handleResend} style={{background:"none",border:"none",color:"#0078FF",
                    fontSize:13,cursor:"pointer",fontWeight:700,fontFamily:"'DM Sans',sans-serif"}}>
                    Resend OTP →</button>
                  :`Resend in ${timer}s`}
              </div>
            </div>
          )}

          {msg.text&&(
            <div style={{padding:"10px 14px",borderRadius:10,marginBottom:14,fontSize:13,fontWeight:600,
              background:msg.ok?"#f0fdf4":"#fef2f2",color:msg.ok?"#166534":"#dc2626",
              border:`1px solid ${msg.ok?"#bbf7d0":"#fca5a5"}`,animation:"slideDown .25s ease"}}>
              {msg.text}
            </div>
          )}

          <button onClick={handleLogin} disabled={!ready} className="btn-primary"
            style={{width:"100%",padding:"13px",borderRadius:12,border:"none",
              background:ready?`linear-gradient(135deg,#0078FF,#0055cc)`:"#93c5fd",
              color:"#fff",fontWeight:700,fontSize:16,cursor:ready?"pointer":"not-allowed",
              fontFamily:"'DM Sans',sans-serif",letterSpacing:".2px",
              boxShadow:ready?"0 4px 18px rgba(0,120,255,.32)":"none",transition:"all .2s"}}>
            {loading?"Please wait…":otpMode?"Verify & Login →":"Continue →"}
          </button>

          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,
            marginTop:16,fontSize:12,color:"#94a3b8"}}>
            {Ic.shield("#93c5fd")}
            <span>256-bit encrypted · RBI compliant · 2FA secured</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ RBI GUIDELINE MODAL - BLACK & GOLD THEME with Logo ═══ */
function RBIGuidelineModal({onClose}){
  const [show, setShow] = useState(true);
  
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  if (!show) return null;

  return (
    <Modal>
      <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:10000,
        background:"rgba(0,0,0,.85)",backdropFilter:"blur(12px)",
        display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{background:"#fff",borderRadius:28,maxWidth:420,width:"90%",
          boxShadow:"0 32px 80px rgba(0,0,0,.4)",animation:"scaleIn .3s cubic-bezier(.16,1,.3,1)",
          overflow:"hidden",border:"2px solid #FFD700"}}>
          
          <div style={{background:"linear-gradient(135deg,#000000,#1a1a1a,#333333)",padding:"20px 24px",
            display:"flex",alignItems:"center",gap:12,borderBottom:"2px solid #FFD700"}}>
            <div style={{width:48,height:48,borderRadius:"50%",background:"#fff",
              display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",
              border:"2px solid #FFD700",padding:"4px"}}>
              <img src="RBI.webp" alt="RBI Logo" style={{width:"100%",height:"100%",objectFit:"contain"}} 
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.style.display = 'none';
                  e.target.parentElement.innerHTML = '<span style="font-size:24px;font-weight:900;color:#000;">RBI</span>';
                }}
              />
            </div>
            <div>
              <h3 style={{color:"#FFD700",fontWeight:800,fontSize:18,marginBottom:2}}>Reserve Bank of India</h3>
              <p style={{color:"rgba(255,215,0,.7)",fontSize:12}}>Latest Digital Payment Guidelines</p>
            </div>
          </div>

          <div style={{padding:"24px 24px 20px"}}>
            <ul style={{listStyle:"none",padding:0}}>
              <li style={{display:"flex",gap:12,marginBottom:18,alignItems:"flex-start"}}>
                <span style={{background:"#000",color:"#FFD700",width:24,height:24,borderRadius:"50%",
                  display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,
                  flexShrink:0,border:"1px solid #FFD700"}}>①</span>
                <div>
                  <strong style={{color:"#000",fontSize:14}}>Never Share OTP or PIN</strong>
                  <p style={{color:"#64748b",fontSize:12,marginTop:4}}>RBI mandates that no bank official, merchant, or third party will ever ask for your OTP, UPI PIN, or card details. Any such request is fraudulent.</p>
                </div>
              </li>
              <li style={{display:"flex",gap:12,marginBottom:18,alignItems:"flex-start"}}>
                <span style={{background:"#000",color:"#FFD700",width:24,height:24,borderRadius:"50%",
                  display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,
                  flexShrink:0,border:"1px solid #FFD700"}}>②</span>
                <div>
                  <strong style={{color:"#000",fontSize:14}}>Screen Sharing is Fraud</strong>
                  <p style={{color:"#64748b",fontSize:12,marginTop:4}}>Banks cannot ask you to install AnyDesk, TeamViewer, QuickSupport, or any remote access app. This is always a scam attempt.</p>
                </div>
              </li>
              <li style={{display:"flex",gap:12,marginBottom:18,alignItems:"flex-start"}}>
                <span style={{background:"#000",color:"#FFD700",width:24,height:24,borderRadius:"50%",
                  display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,
                  flexShrink:0,border:"1px solid #FFD700"}}>③</span>
                <div>
                  <strong style={{color:"#000",fontSize:14}}>Verify Beneficiary Name</strong>
                  <p style={{color:"#64748b",fontSize:12,marginTop:4}}>Always check that the displayed name matches the intended recipient. Mismatched names or suspicious UPI IDs (containing words like "refund", "claim", "kyc") are red flags.</p>
                </div>
              </li>
              <li style={{display:"flex",gap:12,marginBottom:8,alignItems:"flex-start"}}>
                <span style={{background:"#000",color:"#FFD700",width:24,height:24,borderRadius:"50%",
                  display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,
                  flexShrink:0,border:"1px solid #FFD700"}}>④</span>
                <div>
                  <strong style={{color:"#000",fontSize:14}}>Report Fraud Immediately</strong>
                  <p style={{color:"#64748b",fontSize:12,marginTop:4}}>Call 1930 (National Cyber Crime Helpline) within 24 hours of fraud. Also report at cybercrime.gov.in to increase chances of recovery.</p>
                </div>
              </li>
            </ul>

            <div style={{background:"#f8f8f8",borderRadius:12,padding:"12px 14px",marginTop:16,marginBottom:16,
              border:"1px solid #FFD700"}}>
              <p style={{color:"#000",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                <svg width="16"height="16"viewBox="0 0 24 24"fill="none"stroke="#FFD700"strokeWidth="2"><circle cx="12"cy="12"r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                By continuing, you acknowledge these RBI guidelines. Stay safe, stay vigilant.
              </p>
            </div>

            <button onClick={() => { setShow(false); onClose(); }}
              style={{width:"100%",padding:"14px",background:"linear-gradient(135deg,#000000,#333333)",
                border:"2px solid #FFD700",borderRadius:16,color:"#FFD700",fontWeight:700,fontSize:15,cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif",boxShadow:"0 4px 14px rgba(255,215,0,.2)"}}>
              I Understand & Accept
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ═══ OTP MODAL ═══ */