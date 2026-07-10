function RequestMoneyPage({user, setPage}){
  const [recipient, setRecipient] = useState("");
  const [recipientType, setRecipientType] = useState("phone");
  const [recipientErr, setRecipientErr] = useState("");
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [stage, setStage] = useState("form");
  const [sentRequests, setSentRequests] = useState([]);

  const parsedAmt = parseFloat(amt) || 0;

  const getRecipientInfo = () => {
    let targetNum = recipient;
    if (recipientType === 'upi') {
      const u = Object.entries(USERS).find(([,v]) => v.upi === recipient);
      if (u) targetNum = u[0];
    }
    const inSystem = targetNum in USERS;
    const name = inSystem ? USERS[targetNum].name : recipient;
    return { targetNum, name, inSystem };
  };

  const { name: recipName, inSystem } = recipient ? getRecipientInfo() : { name: "", inSystem: false };
  const isReady = recipient && parsedAmt > 0 && note.trim();

  async function sendRequest() {
    if (recipientType === 'phone' && recipient.replace(/\D/,"").length !== 10) {
      setRecipientErr("Enter a valid 10-digit mobile number");
      return;
    }

    const vpnCheck = await checkVPNDetection(user.number);
    if (vpnCheck.vpnDetected && vpnCheck.blocked) {
      alert("VPN detected. Please turn off VPN to proceed with payment.");
      return;
    }

    if (!isReady) return;
    const { targetNum, name } = getRecipientInfo();
    const { date, time } = nowStamp();
    const newReq = {
      id: Date.now(),
      to: name || recipient,
      toNum: targetNum,
      upi: inSystem ? USERS[targetNum]?.upi : recipient,
      amt: parsedAmt,
      reason: note,
      date,
      time,
      status: "pending",
      type: "sent_request"
    };

    getNetworkInfo().then(netInfo => {
      recordTxNetwork(user.number, netInfo);
    });

    setSentRequests(prev => [newReq, ...prev]);
    setStage("success");
  }

  if (stage === "success") return (
    <div className="page-pad page-enter" style={{padding:40,display:"flex",flexDirection:"column",
      alignItems:"center",minHeight:"60vh",justifyContent:"center"}}>
      <div className="glass" style={{borderRadius:18,padding:"40px 34px",maxWidth:380,width:"100%",
        textAlign:"center",animation:"scaleIn .4s cubic-bezier(.16,1,.3,1)"}}>
        <div style={{width:80,height:80,borderRadius:"50%",
          background:"var(--gold-lighter)",
          border:"1.5px solid var(--gold-border)",
          display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px"}}>
          <svg width="40" height="40" viewBox="0 0 40 40">
            <polyline points="8 20 16 28 32 12" fill="none" stroke="var(--primary)" strokeWidth="3.5"
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="36" strokeDashoffset="36"
              style={{animation:"drawCheck .4s .1s ease forwards"}}/>
          </svg>
        </div>
        <h2 className="font-serif" style={{color:"var(--primary)",fontSize:24,fontWeight:700,marginBottom:8}}>Request Sent</h2>
        <p style={{color:"var(--muted)",marginBottom:4,fontSize:15}}>
          You requested <b style={{color:"var(--primary)"}}>₹{parsedAmt.toLocaleString("en-IN")}</b> from
        </p>
        <p style={{color:"var(--gold)",fontWeight:700,marginBottom:20,fontSize:15,letterSpacing:".01em"}}>
          {getRecipientInfo().name || recipient}
        </p>
        <p style={{fontSize:13,color:"var(--muted)",marginBottom:24,lineHeight:1.5}}>
          They will receive a notification to approve and pay you. Money will be credited once they accept.
        </p>
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={()=>{setStage("form");setRecipient("");setAmt("");setNote("");}} variant="primary" style={{flex:1}}>
            New Request
          </Btn>
          <Btn onClick={()=>setPage("dashboard")} variant="secondary" style={{flex:1}}>Dashboard</Btn>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-pad page-enter" style={{padding:"24px 24px 32px",maxWidth:1280,margin:"0 auto"}}>
      {/* Page header */}
      <div style={{marginBottom:22}}>
        <h2 className="font-serif" style={{fontSize:26,fontWeight:700,color:"var(--primary)",marginBottom:4,letterSpacing:".01em"}}>
          Request Money
        </h2>
        <p style={{fontSize:14,color:"var(--muted)",lineHeight:1.5}}>
          Ask someone to send you money — they pay, you receive
        </p>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:18}} className="two-col">
        {/* ── LEFT: form ─────────────────────────────────────────────── */}
        <Card style={{padding:24}}>
          {/* Info banner */}
          <div style={{padding:"12px 16px",background:"var(--gold-lighter)",
            border:"1px solid var(--gold-border)",borderRadius:10,marginBottom:20,
            display:"flex",alignItems:"flex-start",gap:10}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" style={{flexShrink:0,marginTop:1}}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p style={{fontSize:13,color:"var(--primary)",margin:0,lineHeight:1.55,fontWeight:500}}>
              <strong style={{fontWeight:700}}>Requesting money:</strong>{" "}
              You are asking someone else to pay you. Money will be credited to your account only after they approve. You will <strong>NOT</strong> send any money.
            </p>
          </div>

          {/* Recipient type toggle */}
          <div style={{marginBottom:18}}>
            <label style={{fontSize:12,fontWeight:700,color:"var(--primary)",display:"block",marginBottom:8,letterSpacing:".04em",textTransform:"uppercase"}}>
              Recipient
            </label>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {[
                { id: "phone", label: "Mobile Number", icon: Ic.phone },
                { id: "upi",   label: "UPI ID",        icon: Ic.rupee },
              ].map(t => {
                const active = recipientType === t.id;
                return (
                  <button key={t.id}
                    onClick={() => { setRecipientType(t.id); setRecipient(""); setRecipientErr(""); }}
                    style={{flex:1,padding:"10px 12px",borderRadius:8,cursor:"pointer",
                      fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:13,
                      display:"flex",alignItems:"center",justifyContent:"center",gap:7,
                      border:active?"1.5px solid var(--primary)":"1px solid var(--border)",
                      background:active?"var(--primary)":"#fff",
                      color:active?"#fff":"var(--muted)",
                      transition:"all .18s ease"}}>
                    {t.icon(active?"var(--gold)":"var(--muted)")}
                    {t.label}
                  </button>
                );
              })}
            </div>

            <label style={{fontSize:12,fontWeight:700,color:"var(--muted)",display:"block",marginBottom:7,letterSpacing:".03em",textTransform:"uppercase"}}>
              Request From
            </label>
            <input
              value={recipient}
              onChange={e => {
                const val = recipientType === 'phone'
                  ? e.target.value.replace(/\D/,"").slice(0,10)
                  : e.target.value;
                setRecipient(val);
                setRecipientErr("");
              }}
              placeholder={recipientType === 'phone' ? "10-digit mobile number" : "example@ironwallet"}
              style={{width:"100%",padding:"12px 14px",borderRadius:10,
                border:`1.5px solid ${recipientErr?"var(--err)":recipient?"var(--primary)":"var(--border)"}`,
                fontSize:14,outline:"none",boxSizing:"border-box",
                color:"var(--primary)",background:"#fff",
                fontFamily:"'Inter',sans-serif",transition:"border-color .15s ease"}}
            />
            {recipientErr && (
              <div style={{marginTop:6,fontSize:12,color:"var(--err)",fontWeight:600,
                display:"flex",alignItems:"center",gap:5,animation:"slideDown .2s ease"}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {recipientErr}
              </div>
            )}
            {recipient && recipientType === 'phone' && recipient in USERS && (
              <div style={{marginTop:8,padding:"8px 12px",background:"var(--safe-bg)",
                border:"1px solid var(--safe)",borderRadius:8,
                fontSize:13,color:"var(--safe)",display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                {Ic.check("var(--safe)")}
                <strong style={{fontWeight:700}}>{USERS[recipient].name}</strong>
                {USERS[recipient].verified && (
                  <span style={{fontSize:11,background:"var(--gold-lighter)",color:"var(--primary)",
                    padding:"2px 8px",borderRadius:4,fontWeight:700,
                    border:"1px solid var(--gold-border)"}}>✔ Verified</span>
                )}
              </div>
            )}
            {recipient && !inSystem && recipientType === 'phone' && (
              <div style={{marginTop:8,padding:"8px 12px",background:"var(--caution-bg)",
                border:"1px solid var(--caution)",borderRadius:8,
                fontSize:12,color:"var(--caution)",fontWeight:600,
                display:"flex",alignItems:"center",gap:6}}>
                {Ic.warn("var(--caution)")}
                This number is not on IronWallet — request may not be delivered
              </div>
            )}
          </div>

          {/* Amount */}
          <div style={{marginBottom:18}}>
            <label style={{fontSize:12,fontWeight:700,color:"var(--muted)",display:"block",marginBottom:7,letterSpacing:".03em",textTransform:"uppercase"}}>
              Amount You Want to Receive
            </label>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",
                fontSize:20,fontWeight:700,color:"var(--muted)",pointerEvents:"none"}}>₹</span>
              <input type="number" value={amt} onChange={e => setAmt(e.target.value)}
                placeholder="0"
                style={{width:"100%",padding:"14px 14px 14px 32px",borderRadius:10,
                  border:`1.5px solid ${amt?"var(--primary)":"var(--border)"}`,
                  fontSize:24,fontWeight:800,outline:"none",boxSizing:"border-box",
                  color:"var(--primary)",background:"#fff",
                  fontFamily:"'Inter',sans-serif",transition:"border-color .15s ease"}}/>
            </div>
            <div style={{marginTop:10,display:"flex",gap:7,flexWrap:"wrap"}}>
              {[100,500,1000,5000].map(v => (
                <button key={v} onClick={() => setAmt(String(v))}
                  style={{padding:"6px 14px",background:amt==v?"var(--primary)":"var(--surface-container)",
                    border:`1px solid ${amt==v?"var(--primary)":"var(--border)"}`,
                    borderRadius:6,fontSize:12,fontWeight:600,cursor:"pointer",
                    color:amt==v?"var(--gold)":"var(--muted)",
                    fontFamily:"'Inter',sans-serif",transition:"all .15s ease"}}>
                  ₹{v.toLocaleString("en-IN")}
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div style={{marginBottom:22}}>
            <label style={{fontSize:12,fontWeight:700,color:"var(--muted)",display:"block",marginBottom:7,letterSpacing:".03em",textTransform:"uppercase"}}>
              Reason / Note <span style={{color:"var(--err)",textTransform:"none",fontWeight:600}}>(required)</span>
            </label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Rent split, Dinner bill, Loan repayment…"
              style={{width:"100%",padding:"12px 14px",borderRadius:10,
                border:`1.5px solid ${note?"var(--primary)":"var(--border)"}`,
                fontSize:14,outline:"none",boxSizing:"border-box",
                color:"var(--primary)",background:"#fff",
                fontFamily:"'Inter',sans-serif",transition:"border-color .15s ease"}}/>
          </div>

          <button onClick={sendRequest} disabled={!isReady}
            className="btn-primary"
            style={{width:"100%",padding:"14px",fontSize:15,borderRadius:10,border:"none",
              background:isReady?"var(--primary)":"var(--surface-container)",
              color:isReady?"var(--gold)":"var(--muted)",
              fontWeight:700,cursor:isReady?"pointer":"not-allowed",
              fontFamily:"'Inter',sans-serif",letterSpacing:".02em",
              borderTop:isReady?"2px solid var(--gold)":"none"}}>
            Send Request →
          </button>
        </Card>

        {/* ── RIGHT: preview + tips ─────────────────────────────────── */}
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          {/* Preview */}
          <Card style={{padding:22}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--gold)",textTransform:"uppercase",
              letterSpacing:".08em",marginBottom:14}}>
              Request Preview
            </div>
            {parsedAmt > 0 && recipient ? (
              <>
                <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:18}}>
                  <span style={{fontSize:36,fontWeight:800,color:"var(--primary)",letterSpacing:"-.01em"}}>
                    ₹{parsedAmt.toLocaleString("en-IN")}
                  </span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"10px 0",borderTop:"1px solid var(--border)"}}>
                  <span style={{fontSize:12,color:"var(--muted)",fontWeight:600,textTransform:"uppercase",letterSpacing:".04em"}}>Requesting from</span>
                  <span style={{fontWeight:700,color:"var(--primary)",fontSize:14}}>{recipName || recipient}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"10px 0",borderTop:"1px solid var(--border)"}}>
                  <span style={{fontSize:12,color:"var(--muted)",fontWeight:600,textTransform:"uppercase",letterSpacing:".04em"}}>You will receive</span>
                  <span style={{fontWeight:800,fontSize:18,color:"var(--primary)"}}>
                    +₹{parsedAmt.toLocaleString("en-IN")}
                  </span>
                </div>
                {note && (
                  <div style={{padding:"10px 12px",background:"var(--surface-container)",
                    borderRadius:8,marginTop:12,fontSize:13,color:"var(--muted)",
                    borderLeft:"3px solid var(--gold)"}}>
                    "{note}"
                  </div>
                )}
              </>
            ) : (
              <div style={{padding:"28px 16px",textAlign:"center",color:"var(--muted)"}}>
                <div style={{width:48,height:48,borderRadius:"50%",
                  background:"var(--gold-lighter)",border:"1.5px solid var(--gold-border)",
                  display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
                  {Ic.rupee("var(--primary)")}
                </div>
                <div style={{fontSize:13,fontWeight:600,color:"var(--primary)",marginBottom:4}}>
                  Fill in the details
                </div>
                <div style={{fontSize:12,lineHeight:1.5}}>
                  Your request summary will appear here
                </div>
              </div>
            )}
          </Card>

          {/* How it works */}
          <Card style={{padding:22}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--gold)",textTransform:"uppercase",
              letterSpacing:".08em",marginBottom:14}}>
              How It Works
            </div>
            {[
              { n: "1", t: "Enter details", d: "Add recipient, amount and reason" },
              { n: "2", t: "Send request", d: "They get an instant notification" },
              { n: "3", t: "Get paid",     d: "Money is credited after they approve" },
            ].map((s, i) => (
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 0",
                borderTop: i===0 ? "none" : "1px solid var(--border)"}}>
                <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
                  background:"var(--primary)",color:"var(--gold)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:12,fontWeight:800,fontFamily:"'Inter',sans-serif"}}>
                  {s.n}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--primary)",marginBottom:2}}>{s.t}</div>
                  <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.45}}>{s.d}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* Sent requests history */}
      {sentRequests.length > 0 && (
        <div style={{marginTop:24}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <h3 className="font-serif" style={{fontWeight:700,fontSize:18,color:"var(--primary)",letterSpacing:".01em"}}>
              Requests Sent This Session
            </h3>
            <span style={{fontSize:11,fontWeight:700,color:"var(--muted)",
              background:"var(--surface-container)",padding:"4px 10px",borderRadius:4,
              textTransform:"uppercase",letterSpacing:".06em"}}>
              {sentRequests.length} {sentRequests.length === 1 ? "request" : "requests"}
            </span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}} className="two-col">
            {sentRequests.map(r => (
              <Card key={r.id} className="hover-lift" style={{padding:16}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0,flex:1}}>
                    <Avatar name={r.to} size={42}/>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontWeight:700,fontSize:14,color:"var(--primary)",
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {r.to}
                      </div>
                      <div style={{fontSize:12,color:"var(--muted)",marginTop:2,
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {r.reason} · {r.date}
                      </div>
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontWeight:800,fontSize:16,color:"var(--primary)",letterSpacing:"-.01em"}}>
                      +₹{r.amt.toLocaleString("en-IN")}
                    </div>
                    <span style={{fontSize:10,background:"var(--caution-bg)",color:"var(--caution)",
                      padding:"3px 8px",borderRadius:4,fontWeight:700,marginTop:4,display:"inline-block",
                      textTransform:"uppercase",letterSpacing:".06em",border:"1px solid var(--caution)"}}>
                      Pending
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ SAFEPAY ASSISTANT with Quick Reply Buttons ═══ */
