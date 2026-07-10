/* ═══ LOCATION CARD (Geo-enhanced Profile) ═══ */
function LocationCard({ user }){
  const[loading,setLoading]=useState(false);
  const[msg,setMsg]=useState("");
  const[loc,setLoc]=useState(GeoDeviceBaseline.location?.display || null);
  const[editing,setEditing]=useState(false);
  const[manual,setManual]=useState("");

  function refreshLocation(){
    setLoading(true);
    setMsg("");
    if (!navigator.geolocation) {
      setMsg("Geolocation not supported by your browser.");
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        GeoDeviceBaseline.location_enabled = true;
        GeoDeviceBaseline.location = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          city: "Locating...",
          display: "Locating...",
        };
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
          .then(r => r.json())
          .then(data => {
            const addr = data.address || {};
            const area = addr.neighbourhood || addr.quarter || addr.suburb || addr.residential || null;
            const city = addr.city || addr.town || addr.municipality || addr.village || addr.county || "Unknown";
            const state = addr.state || "";
            const display = area ? `${area}, ${city}, ${state}` : `${city}, ${state}`;
            GeoDeviceBaseline.location.city = city;
            GeoDeviceBaseline.location.area = area;
            GeoDeviceBaseline.location.region = state;
            GeoDeviceBaseline.location.display = display;
            setLoc(display);
            setMsg("✅ Location updated successfully");
            setTimeout(() => setMsg(""), 3000);
          })
          .catch(() => {
            setMsg("Could not fetch address. Try again.");
          })
          .finally(() => setLoading(false));
      },
      () => {
        setMsg("⚠️ Location permission denied. Please allow access in browser settings.");
        setLoading(false);
      },
      { timeout: 8000 }
    );
  }

  function saveManual(){
    if (!manual.trim()) return;
    // Only admins may set location manually — log it
    if (!user.isAdmin) {
      setMsg("❌ Manual location entry is not allowed.");
      setEditing(false);
      return;
    }
    GeoDeviceBaseline.location = {
      ...GeoDeviceBaseline.location,
      display: manual.trim(),
      city: manual.trim(),
      manual: true,
    };
    console.log(`[ADMIN OVERRIDE] ${user.name} set manual location: ${manual.trim()}`);
    setLoc(manual.trim());
    setEditing(false);
    setManual("");
    setMsg("✅ Location updated manually");
    setTimeout(() => setMsg(""), 3000);
  }

  return(
    <div style={{marginTop:16}}>
      <div style={{fontSize:14,fontWeight:700,color:"#0f172a",marginBottom:10,
        display:"flex",alignItems:"center",gap:6}}>
        📍 Current Location
      </div>

      {/* Location display */}
      <div style={{background:"#f8faff",borderRadius:12,padding:"12px 16px",
        border:"1px solid #e8f1ff",marginBottom:12}}>
        {loc ? (
          <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>
            📍 {loc}
            {GeoDeviceBaseline.location?.manual && (
              <span style={{fontSize:10,color:"#f59e0b",fontWeight:700,
                marginLeft:8,background:"#fef3c7",padding:"2px 7px",borderRadius:8}}>
                Manual
              </span>
            )}
          </div>
        ) : (
          <div style={{fontSize:13,color:"#94a3b8"}}>Location not captured yet</div>
        )}
        <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>
          💻 {GeoDeviceBaseline.deviceInfo
            ? `${GeoDeviceBaseline.deviceInfo.browser} · ${GeoDeviceBaseline.deviceInfo.os} · ${GeoDeviceBaseline.deviceInfo.timezone}`
            : "Device info unavailable"}
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div style={{fontSize:12,fontWeight:600,
          color: msg.startsWith("✅") ? "#166534" : "#dc2626",
          marginBottom:10,padding:"6px 12px",borderRadius:8,
          background: msg.startsWith("✅") ? "#dcfce7" : "#fef2f2"}}>
          {msg}
        </div>
      )}

      {/* Manual edit input */}
      {editing && (
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <input
            value={manual}
            onChange={e => setManual(e.target.value)}
            onKeyDown={e => e.key === "Enter" && saveManual()}
            placeholder="e.g. Baner, Pune, Maharashtra"
            style={{flex:1,padding:"9px 13px",border:"1.5px solid #bfdbfe",borderRadius:10,
              fontSize:13,outline:"none",fontFamily:"'DM Sans',sans-serif"}}
          />
          <button onClick={saveManual}
            style={{padding:"9px 16px",background:"linear-gradient(135deg,#0078FF,#0055cc)",
              border:"none",borderRadius:10,color:"#fff",fontWeight:700,fontSize:13,
              cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
            Save
          </button>
          <button onClick={() => setEditing(false)}
            style={{padding:"9px 14px",background:"#f1f5f9",border:"none",borderRadius:10,
              color:"#64748b",fontWeight:600,fontSize:13,cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif"}}>
            Cancel
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button onClick={refreshLocation} disabled={loading}
          style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",
            background:"linear-gradient(135deg,#0078FF,#0055cc)",border:"none",
            borderRadius:10,color:"#fff",fontWeight:700,fontSize:12,
            cursor:loading?"not-allowed":"pointer",opacity:loading?0.6:1,
            fontFamily:"'DM Sans',sans-serif"}}>
          {loading ? "Detecting..." : "🔄 Refresh Location"}
        </button>
        {user.isAdmin && (
        <button onClick={() => { setEditing(e => !e); setMsg(""); }}
          style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",
            background:"#f0f6ff",border:"1.5px solid #bfdbfe",
            borderRadius:10,color:"#0078FF",fontWeight:700,fontSize:12,
            cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
          ✏️ Set Manually
        </button>
        )}
      </div>
    </div>
  );
}

/* ═══ PROFILE PAGE ═══ */
function ProfilePage({user,txs,balance,updateUser,tickets}){
  const[locked,setLocked]=useState(false);
  const[pd,setPd]=useState({cur:"",n1:"",n2:""});
  const[msg,setMsg]=useState("");
  const[detailTicket,setDetailTicket]=useState(null);
  const[mockCity,setMockCity]=useState(MockLocation.active ? MockLocation.label : "");
  
  const safetyScore = Math.max(0, 100 - (user.risk_score));
  const avgAmount = txs.length ? Math.round(txs.reduce((s,t)=>s+t.amt,0)/txs.length) : 0;
  const riskHistory = user.risk_score_history || [];
  const myTickets = (tickets||[]).filter(t => t.user === user.number);

  function resetPin(){
    if(pd.n1.length<4||pd.n1!==pd.n2){setMsg("PINs must match and be 4 digits");return;}
    setMsg("PIN updated successfully ✔");
    setPd({cur:"",n1:"",n2:""});setTimeout(()=>setMsg(""),3000);
  }

  function handleEmergencyLock(){
    emergencyLock(user);
    setLocked(true);
    setMsg("Account locked successfully. Please visit branch to unlock.");
  }

  const ticketStatusMeta = {
    "Under Review":  {color:"#92400e",bg:"#fef3c7",border:"#fcd34d"},
    "Investigating": {color:"#1e40af",bg:"#dbeafe",border:"#93c5fd"},
    "Resolved":      {color:"#166534",bg:"#dcfce7",border:"#86efac"},
  };

  return(
    <div className="page-pad page-enter" style={{padding:24,maxWidth:700,margin:"0 auto"}}>
      {detailTicket && (
        <TicketDetailModal ticket={detailTicket} tx={txs.find(t => t.id === detailTicket.transaction_id)} onClose={()=>setDetailTicket(null)}/>
      )}
      <div style={{marginBottom:22}}>
        <h2 style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Profile & Security</h2>
        <p style={{fontSize:14,color:"#64748b"}}>Manage your account and security settings</p>
      </div>

      {/* ═══ DEV TOOLS: Mock Location Override (Admin only) ═══ */}
      {user.isAdmin && (
      <div style={{background:"#0f172a",borderRadius:16,padding:"16px 18px",marginBottom:18,
        border:"1.5px solid #1e293b"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{fontSize:16}}>🧪</span>
          <span style={{fontWeight:800,fontSize:13,color:"#e2e8f0",letterSpacing:.3}}>Dev Tools — Simulate Location</span>
          {MockLocation.active && (
            <span style={{marginLeft:"auto",fontSize:11,fontWeight:700,padding:"2px 10px",
              borderRadius:10,background:"#22c55e22",color:"#4ade80",border:"1px solid #4ade8040"}}>
              ACTIVE
            </span>
          )}
        </div>
        <p style={{fontSize:12,color:"#64748b",marginBottom:12,lineHeight:1.5}}>
          Override GPS location for testing geo-anomaly detection. The selected city will be used as the transaction origin for all future payments this session.
        </p>
        <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
          {MOCK_CITIES.map(city => (
            <button key={city.label}
              onClick={()=>{ setMockCity(city.label); setMockLocation(city); }}
              style={{padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:700,
                fontFamily:"'DM Sans',sans-serif",cursor:"pointer",
                border: mockCity===city.label ? "2px solid #0078FF" : "1.5px solid #334155",
                background: mockCity===city.label ? "#0078FF" : "#1e293b",
                color: mockCity===city.label ? "#fff" : "#94a3b8",
                transition:"all .15s"}}>
              📍 {city.label}
            </button>
          ))}
          {MockLocation.active && (
            <button onClick={()=>{ setMockCity(""); setMockLocation(null); }}
              style={{padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:700,
                fontFamily:"'DM Sans',sans-serif",cursor:"pointer",
                border:"1.5px solid #ef4444",background:"#ef444422",color:"#f87171"}}>
              ✕ Clear override
            </button>
          )}
        </div>
        {MockLocation.active && (
          <div style={{marginTop:10,fontSize:12,color:"#4ade80",fontWeight:600}}>
            ✔ Payments will appear to originate from: <strong>{MockLocation.label}</strong>
            &nbsp;({MockLocation.lat.toFixed(4)}, {MockLocation.lng.toFixed(4)})
          </div>
        )}
      </div>
      )}

      <Card style={{padding:0,marginBottom:16,overflow:"hidden"}}>
        <div style={{background:`linear-gradient(135deg,#0078FF,#0055cc,#003fa6)`,
          padding:"26px 24px 28px",position:"relative",backgroundSize:"200% 200%",animation:"gradMove 8s ease infinite"}}>
          <div style={{position:"absolute",right:-30,top:-30,width:130,height:130,borderRadius:"50%",background:"rgba(255,255,255,.05)"}}/>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <div style={{position:"relative"}}>
              <Avatar name={user.name} size={62}/>
              <div style={{position:"absolute",bottom:1,right:1,width:17,height:17,borderRadius:"50%",
                background:"#22c55e",border:"2.5px solid #fff"}}/>
            </div>
            <div>
              <div style={{fontWeight:900,fontSize:22,color:"#fff",letterSpacing:"-.3px"}}>{user.name}</div>
              {user.verified&&<div style={{display:"inline-flex",alignItems:"center",gap:5,
                background:"rgba(255,255,255,.18)",borderRadius:20,padding:"3px 10px",marginTop:4}}>
                <span style={{color:"#fff",fontSize:11,fontWeight:700}}>✔ Verified User</span>
              </div>}
              <div style={{color:"rgba(255,255,255,.72)",fontSize:13,marginTop:5}}>{user.upi}</div>
              <div style={{color:"rgba(255,255,255,.55)",fontSize:12,marginTop:2}}>+91 {user.number}</div>
            </div>
          </div>
        </div>
        <div style={{padding:"20px 24px"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16}}>
            {Ic.check("#166534")}
            <span style={{color:"#166534",fontSize:13,fontWeight:700}}>KYC Verified Account</span>
          </div>
          
          <div className="profile-3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
            {[
              {label:"Balance",      value:`₹${balance.toLocaleString("en-IN")}`,color:"#0078FF"},
              {label:"Transactions", value:String(txs.length), color:"#7c3aed"},
              {label:"Safety Score", value:`${safetyScore}/100`, color:"#22c55e"},
            ].map(s=>(
              <div key={s.label} style={{background:"#f8faff",borderRadius:12,padding:"14px 16px",
                border:"1px solid #f0f6ff"}}>
                <div style={{fontSize:12,color:"#94a3b8",fontWeight:600,marginBottom:4}}>{s.label}</div>
                <div style={{fontSize:18,fontWeight:800,color:s.color}}>{s.value}</div>
              </div>
            ))}
          </div>
          
          <Div/>
          
          <div style={{marginTop:16}}>
            <div style={{fontSize:14,fontWeight:700,color:"#0f172a",marginBottom:8}}>Risk Score History</div>
            {riskHistory.length === 0 ? (
              <div style={{color:"#94a3b8",fontSize:13}}>No risk history yet</div>
            ) : (
              <div style={{maxHeight:200,overflowY:"auto"}}>
                {riskHistory.slice(-5).reverse().map((h,i) => (
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",
                    borderBottom:i<4?"1px solid #f1f5f9":"none"}}>
                    <span style={{fontSize:12,color:"#64748b"}}>
                      {new Date(h.time).toLocaleTimeString()}
                    </span>
                    <span style={{fontWeight:700,color: riskMeta(h.score).color}}>
                      {h.score} ({h.action})
                    </span>
                    <span style={{fontSize:12,color:"#64748b"}}>₹{h.amount}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ═══ LOCATION CARD ═══ */}
      <Card style={{padding:22,marginBottom:16}}>
        <LocationCard user={user} />
      </Card>

      {/* ═══ ACTIVE FRAUD REPORTS SECTION ═══ */}
      <Card style={{padding:22,marginBottom:16}}>
        <div style={{fontWeight:800,color:"#0f172a",fontSize:15,marginBottom:16,
          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            🚨 Fraud Reports / Dispute Cases
            {myTickets.length > 0 && (
              <span style={{background:"linear-gradient(135deg,#7c3aed,#5b21b6)",color:"#fff",
                fontSize:11,fontWeight:800,padding:"2px 9px",borderRadius:20,
                animation:"badgePop .4s cubic-bezier(.16,1,.3,1)"}}>
                {myTickets.length}
              </span>
            )}
          </div>
        </div>
        {myTickets.length === 0 ? (
          <div style={{textAlign:"center",padding:"24px 0"}}>
            <div style={{fontSize:32,marginBottom:10}}>🛡️</div>
            <div style={{fontSize:14,fontWeight:700,color:"#0f172a",marginBottom:4}}>No active fraud reports</div>
            <div style={{fontSize:12,color:"#94a3b8"}}>
              Report a suspicious transaction from the Transaction History page to file a dispute case.<br/>
              <span style={{color:"#92400e",fontWeight:600}}>⚡ Instant auto-forward to Bank &amp; Cyber Cell</span>
            </div>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {myTickets.map(ticket => {
              const sm = ticketStatusMeta[ticket.status] || ticketStatusMeta["Under Review"];
              const sev = ticket.severity || getFraudSeverity(ticket.reason || "");
              const svm = getSeverityMeta(sev);
              return (
                <button key={ticket.id} onClick={()=>setDetailTicket(ticket)}
                  style={{width:"100%",padding:"14px 16px",background:"#f8faff",
                    border:`1.5px solid ${sm.border}`,borderRadius:14,cursor:"pointer",
                    fontFamily:"'DM Sans',sans-serif",textAlign:"left",
                    transition:"all .18s ease",animation:"fadeUp .3s cubic-bezier(.16,1,.3,1)"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,.1)";}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>{ticket.id}</span>
                      <span style={{background:svm.bg,border:`1px solid ${svm.border}`,color:svm.color,fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:8}}>Under Review</span>
                    </div>
                    <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                      background:sm.bg,color:sm.color,border:`1px solid ${sm.border}`}}>
                      {ticket.status}
                    </span>
                  </div>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:6}}>
                    <span style={{fontSize:12,color:"#64748b"}}>
                      💰 <b style={{color:"#0f172a"}}>₹{ticket.amount?.toLocaleString("en-IN")}</b>
                    </span>
                    <span style={{fontSize:12,color:"#64748b"}}>
                      👤 {ticket.recipientName || ticket.recipient}
                    </span>
                    <span style={{fontSize:12,color:"#64748b"}}>
                      📋 {ticket.reason}
                    </span>
                  </div>
                  <div style={{fontSize:11,color:svm.color,background:svm.bg,border:`1px solid ${svm.border}`,
                    borderRadius:8,padding:"3px 8px",display:"inline-flex",alignItems:"center",gap:4,
                    fontWeight:600}}>
                    Under Review — Expected: {svm.resolution}
                  </div>
                  {ticket.refund_status !== "Pending" && (
                    <div style={{marginTop:8,fontSize:12,fontWeight:700,
                      color:ticket.refund_status==="Approved"?"#166534":"#dc2626"}}>
                      Refund: {ticket.refund_status==="Approved"?"✅ Approved":"❌ Rejected"}
                    </div>
                  )}
                  <div style={{marginTop:6,fontSize:11,color:"#94a3b8",display:"flex",alignItems:"center",gap:5}}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    {new Date(ticket.created_at).toLocaleDateString()} · ETA: {svm.resolution}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card style={{padding:22,marginBottom:16}}>
        <div style={{fontWeight:800,color:"#0f172a",fontSize:15,marginBottom:16,
          display:"flex",alignItems:"center",gap:8}}>
          {Ic.shield("#0078FF")} Security Center
        </div>
        <div className="sec-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <button onClick={handleEmergencyLock}
            style={{padding:16,background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:14,cursor:"pointer",
              textAlign:"left",fontFamily:"'DM Sans',sans-serif"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              {Ic.freeze("#dc2626")}
              <span style={{fontWeight:700,fontSize:14,color:"#dc2626"}}>Emergency Lock</span>
            </div>
            <div style={{fontSize:12,color:"#94a3b8"}}>Freeze account instantly</div>
          </button>
          {[
            {ico:Ic.monitor("#0078FF"), t:"2FA Active",   s:"OTP on all transfers"},
            {ico:Ic.shield("#166534"),  t:"Verified",     s:"KYC confirmed"},
            {ico:Ic.flag("#dc2626"),    t:"Report Fraud", s:"helpdesk@ironwallet.in"},
          ].map(x=>(
            <div key={x.t} style={{padding:16,background:"#f8faff",border:"1px solid #e2e8f0",borderRadius:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                {x.ico}<span style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{x.t}</span>
              </div>
              <div style={{fontSize:12,color:"#94a3b8"}}>{x.s}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{padding:22}}>
        <div style={{fontWeight:800,color:"#0f172a",fontSize:15,marginBottom:16,
          display:"flex",alignItems:"center",gap:8}}>
          {Ic.key("#0078FF")} Reset PIN
        </div>
        {[["cur","Current PIN"],["n1","New PIN"],["n2","Confirm New PIN"]].map(([k,lbl])=>(
          <div key={k} style={{marginBottom:16}}>
            <label style={{fontSize:12,fontWeight:700,display:"block",marginBottom:6,
              color:"#374151",textTransform:"uppercase",letterSpacing:.5}}>{lbl}</label>
            <input type="password" maxLength={4} value={pd[k]}
              onChange={e=>setPd(p=>({...p,[k]:e.target.value.replace(/\D/,"").slice(0,4)}))}
              placeholder="••••"
              style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #e2e8f0",
                fontSize:20,letterSpacing:10,outline:"none",boxSizing:"border-box",
                background:"#f8faff",fontFamily:"'DM Sans',sans-serif"}}/>
          </div>
        ))}
        {msg&&(
          <div style={{padding:"10px 14px",borderRadius:10,marginBottom:14,fontSize:13,fontWeight:600,
            background:msg.includes("✔")?"#dcfce7":"#fef2f2",
            color:msg.includes("✔")?"#166534":"#dc2626",
            border:`1px solid ${msg.includes("✔")?"#bbf7d0":"#fca5a5"}`}}>
            {msg}
          </div>
        )}
        <Btn onClick={resetPin} variant="primary">Update PIN</Btn>
      </Card>
    </div>
  );
}
