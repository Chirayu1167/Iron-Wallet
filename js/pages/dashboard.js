/* ═══ DASHBOARD ═══ */
function Dashboard({user,balance,txs,setPage,updateUser}){
  const[vis,setVis]=useState(false);
  const[showPinModal,setShowPinModal]=useState(false);
  const[showFreeze,setShowFreeze]=useState(false);
  const[freezeData,setFreezeData]=useState(null);
  // -- Manual one-tap freeze --
  const FREEZE_KEY = "iw_manual_freeze_" + user.number;
  const[manualFrozen,setManualFrozen] = useState(
    () => localStorage.getItem("iw_manual_freeze_" + user.number) === "1"
  );
  const[showFreezeConfirm, setShowFreezeConfirm] = useState(false);
  const[showUnfreezePin,   setShowUnfreezePin]   = useState(false);
  const[showUnfreezeOtp,   setShowUnfreezeOtp]   = useState(false);

  function handleFreezeConfirm() {
    localStorage.setItem(FREEZE_KEY, "1");
    setManualFrozen(true);
    setShowFreezeConfirm(false);
  }

  function handleUnfreezePin() {
    setShowUnfreezePin(false);
    setShowUnfreezeOtp(true);
  }

  function handleUnfreezeOtp() {
    localStorage.removeItem(FREEZE_KEY);
    setManualFrozen(false);
    setShowUnfreezeOtp(false);
  }
  const blocked=txs.filter(t=>t.status==="blocked").length;
  const debits=txs.filter(t=>t.type==="debit"&&t.status!=="blocked").reduce((s,t)=>s+t.amt,0);
  const credits=txs.filter(t=>t.type==="credit").reduce((s,t)=>s+t.amt,0);
  const frozen = checkFrozen(user);
  const cooldown = checkCooldown(user);

  useEffect(() => {
    if (frozen.frozen && frozen.remaining) {
      setFreezeData(frozen);
      setShowFreeze(true);
    }
  }, [frozen.frozen]);

  function handleEyeClick(){
    if(vis){
      setVis(false);
    }else{
      setShowPinModal(true);
    }
  }

  return(
    <div className="page-pad page-enter" style={{padding:"24px 24px 32px",maxWidth:1280,margin:"0 auto"}}>
      {showPinModal&&(
        <PINModal
          userPin={user.pin}
          user={user}
          onSuccess={()=>{setShowPinModal(false);setVis(true);}}
          onCancel={()=>setShowPinModal(false)}
        />
      )}

      {showFreeze && freezeData && (
        <FreezeModal
          message={freezeData.message}
          permanent={freezeData.permanent}
          remaining={freezeData.remaining}
          onClose={() => setShowFreeze(false)}
        />
      )}

      {/* -- Manual freeze modals -- */}
      {showFreezeConfirm && (
        <ManualFreezeConfirmModal
          onConfirm={handleFreezeConfirm}
          onCancel={() => setShowFreezeConfirm(false)}
        />
      )}
      {showUnfreezePin && (
        <PINModal
          userPin={user.pin}
          user={user}
          onSuccess={handleUnfreezePin}
          onCancel={() => setShowUnfreezePin(false)}
        />
      )}
      {showUnfreezeOtp && (
        <UnfreezeOtpModal
          user={user}
          onSuccess={handleUnfreezeOtp}
          onCancel={() => setShowUnfreezeOtp(false)}
        />
      )}

      {cooldown.cooldown && (
        <div style={{marginBottom:16,padding:"12px 16px",background:"#fff7ed",
          border:"1px solid #fed7aa",borderRadius:10,display:"flex",alignItems:"center",gap:10}}>
          {Ic.warn("#ea580c")}
          <span style={{color:"#9a3412",fontSize:14,lineHeight:1.5}}>
            Cooldown active. Please wait {Math.floor(cooldown.remaining/60)}m {cooldown.remaining%60}s.
          </span>
        </div>
      )}

      {/* -- Manual Freeze Banner -- */}
      {manualFrozen && (
        <ManualFreezeBanner onUnfreeze={() => setShowUnfreezePin(true)} />
      )}

      {/* ── Balance Card ── */}
      <div style={{background:"#1A56DB",borderRadius:16,padding:"24px",marginBottom:16,display:"flex",
        justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
        <div>
          <div style={{color:"rgba(255,255,255,.7)",fontSize:12,fontWeight:500,marginBottom:10,
            display:"flex",alignItems:"center",gap:5}}>
            <svg width="11"height="11"viewBox="0 0 24 24"fill="none"stroke="rgba(255,255,255,.7)"strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12"cy="7"r="4"/></svg>
            {user.upi}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
            <div className="balance-amt" style={{color:"#fff",fontSize:36,fontWeight:800,letterSpacing:"-1px",lineHeight:1}}>
              {vis?`₹${balance.toLocaleString("en-IN")}`:"₹ ●●●●●●"}
            </div>
            <button onClick={handleEyeClick}
              style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.2)",borderRadius:8,
                padding:"6px 8px",cursor:"pointer",display:"flex",alignItems:"center"}}>
              {vis?Ic.eyeOff("#fff"):Ic.eye("#fff")}
            </button>
          </div>
          <div style={{color:"rgba(255,255,255,.65)",fontSize:13,fontWeight:500}}>Available Balance</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,.12)",
          border:"1px solid rgba(255,255,255,.2)",borderRadius:8,padding:"6px 12px"}}>
          {Ic.shield("#fff")}
          <span style={{color:"#fff",fontSize:12,fontWeight:600}}>Secured</span>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
        {[
          {label:"Send",    ico:Ic.up("#1A56DB"),    fn:()=>setPage("send")},
          {label:"Request", ico:Ic.rupee("#7c3aed"), fn:()=>setPage("request-money")},
          {label:"Pay Req", ico:Ic.down("#16a34a"),  fn:()=>setPage("requests")},
          {label:"History", ico:Ic.clock("#16a34a"), fn:()=>setPage("history")},
          {label: manualFrozen ? "Unfreeze" : "Freeze",
           ico: manualFrozen
             ? (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>)
             : (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>),
           fn: () => manualFrozen ? setShowUnfreezePin(true) : setShowFreezeConfirm(true),
           danger: !manualFrozen},
        ].map(b=>(
          <button key={b.label} onClick={b.fn}
            style={{padding:"14px 8px",
              background: b.danger ? "#fff1f2" : b.label==="Unfreeze" ? "#f0fdf4" : "#fff",
              border: b.danger ? "1.5px solid #fca5a5" : b.label==="Unfreeze" ? "1.5px solid #86efac" : "1px solid #e5e7eb",
              borderRadius:12, cursor:"pointer",display:"flex",flexDirection:"column",
              alignItems:"center",gap:8,fontFamily:"'Inter',sans-serif",transition:"all .15s"}}>
            <div style={{width:36,height:36,borderRadius:10,
              background: b.danger ? "#fee2e2" : b.label==="Unfreeze" ? "#dcfce7" : "#eff6ff",
              display:"flex",alignItems:"center",justifyContent:"center"}}>{b.ico}</div>
            <span style={{fontSize:12,fontWeight:700,
              color: b.danger ? "#dc2626" : b.label==="Unfreeze" ? "#16a34a" : "#374151"}}>
              {b.label}
            </span>
          </button>
        ))}
      </div>

      {/* ── Two-column layout: Services + Stats ── */}
      <div className="two-col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

        {/* Services */}
        <ServicesGrid setPage={setPage}/>

        {/* Stats */}
        <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:20}}>
          <div style={{fontWeight:700,color:"#111827",fontSize:14,marginBottom:16}}>Stats</div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <div style={{fontSize:13,color:"#6b7280",marginBottom:4}}>Total Spent</div>
              <div style={{fontWeight:700,fontSize:20,color:"#111827"}}>₹27,300</div>
            </div>
            <div style={{borderTop:"1px solid #f3f4f6",paddingTop:14}}>
              <div style={{fontSize:13,color:"#6b7280",marginBottom:4}}>Protected Transactions</div>
              <div style={{fontWeight:700,fontSize:20,color:"#dc2626"}}>1</div>
            </div>
            <div style={{borderTop:"1px solid #f3f4f6",paddingTop:14}}>
              <div style={{fontSize:13,color:"#6b7280",marginBottom:4}}>Transactions</div>
              <div style={{fontWeight:700,fontSize:20,color:"#111827"}}>17</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ═══ RECIPIENT RISK WARNING COMPONENT — Network-Level Reporting UI ═══ */