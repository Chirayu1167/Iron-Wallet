// js/protection-center.js — Protection Center (Phase 12.2)
// Lightweight protection area reusing existing UI components.
// Sections: Account Security, Payment Safety, Privacy
// IRON protects by detecting and verifying — never blocks.

function ProtectionCenter({ user, txs, setPage }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [recentRisky, setRecentRisky] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Session/device state
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Reporting state
  const [reportRecipient, setReportRecipient] = useState("");
  const [reportReason, setReportReason] = useState("suspected_scam");
  const [reportStatus, setReportStatus] = useState("");
  const [reportLoading, setReportLoading] = useState(false);

  const [reportTxId, setReportTxId] = useState("");
  const [reportTxReason, setReportTxReason] = useState("suspected_scam");
  const [reportTxStatus, setReportTxStatus] = useState("");

  const [pinOld, setPinOld] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [pinStatus, setPinStatus] = useState("");

  useEffect(() => {
    // Load recent risky from txs or backend
    const risky = (txs || []).filter(t => (t.risk||0) >= 70 || t.status === "high_risk").slice(0,5);
    setRecentRisky(risky);
    setLoading(false);
    // Load sessions and events from backend
    async function loadSecurity() {
      const hdr = getAuthHeader();
      if (!hdr.Authorization) { setSessionsLoading(false); setEventsLoading(false); return; }
      try {
        const r = await fetch(`${API}/security/sessions`, { headers: hdr });
        if (r.ok) { const j = await r.json(); setSessions(j.sessions || []); }
      } catch {} finally { setSessionsLoading(false); }
      try {
        const r2 = await fetch(`${API}/security/events?limit=8`, { headers: hdr });
        if (r2.ok) { const j2 = await r2.json(); setSecurityEvents(j2.events || []); }
      } catch {} finally { setEventsLoading(false); }
    }
    loadSecurity();
  }, [txs]);

  async function handleReportRecipient(e) {
    e.preventDefault();
    setReportStatus("");
    if (!reportRecipient || reportRecipient.trim().length < 3) { setReportStatus("Enter a valid recipient."); return; }
    setReportLoading(true);
    try {
      const hdr = getAuthHeader();
      const res = await fetch(`${API}/reports/recipient`, {
        method: "POST",
        headers: { "Content-Type":"application/json", ...hdr },
        body: JSON.stringify({ recipient: reportRecipient.trim(), reason: reportReason, amount: 0 })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) { setReportStatus(data.error || "Failed to report."); }
      else {
        setReportStatus(data.deduplicated ? "Already reported recently — Thank you." : "Reported — Thank you. This helps IRON warn others. Payment ability unchanged.");
        setReportRecipient("");
      }
    } catch (err) { setReportStatus("Network error. Try again."); }
    finally { setReportLoading(false); }
  }

  async function handleReportTx(e) {
    e.preventDefault();
    setReportTxStatus("");
    if (!reportTxId) { setReportTxStatus("Enter transaction ID."); return; }
    try {
      const hdr = getAuthHeader();
      const res = await fetch(`${API}/reports/transaction`, {
        method: "POST",
        headers: { "Content-Type":"application/json", ...hdr },
        body: JSON.stringify({ transaction_id: reportTxId.trim(), reason: reportTxReason })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) setReportTxStatus(data.detail || data.error || "Failed.");
      else setReportTxStatus(data.deduplicated ? "Already reported." : "Transaction reported. Status remains as recorded.");
    } catch { setReportTxStatus("Network error."); }
  }

  async function handleChangePin(e) {
    e.preventDefault();
    setPinStatus("");
    if (!pinNew || pinNew.length < 4) { setPinStatus("Enter a 4-6 digit PIN."); return; }
    try {
      const hdr = getAuthHeader();
      const res = await fetch(`${API}/security/change-pin`, {
        method: "POST",
        headers: { "Content-Type":"application/json", ...hdr },
        body: JSON.stringify({ old_pin: pinOld, new_pin: pinNew })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) setPinStatus(data.error || data.detail || "Failed.");
      else { setPinStatus("PIN updated. Keep it private."); setPinOld(""); setPinNew(""); }
    } catch { setPinStatus("Network error."); }
  }

  async function handleSignOutSession(suffix) {
    try {
      const hdr = getAuthHeader();
      const res = await fetch(`${API}/security/sessions/${encodeURIComponent(suffix)}/logout`, { method:"POST", headers: hdr });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) { alert(data.detail || data.error || "Failed to sign out."); return; }
      // reload sessions
      const r = await fetch(`${API}/security/sessions`, { headers: hdr });
      if (r.ok) { const j = await r.json(); setSessions(j.sessions || []); }
    } catch { alert("Network error."); }
  }

  const cardStyle = { background:"#fff", border:"1px solid #E0E1DD", borderRadius:8, padding:16, marginBottom:14 };

  return (
    <div className="page-pad page-enter" style={{ padding:"24px 24px 32px", maxWidth:1100, margin:"0 auto" }}>
      <PageHeader title="Protection Center" subtitle="IRON protects you by detecting suspicious activity and helping you verify it." onBack={() => setPage && setPage("dashboard")} />
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {["overview","account","payment","privacy"].map(tab => (
          <button key={tab} onClick={()=>setActiveTab(tab)}
            style={{ padding:"8px 14px", borderRadius:20, border: activeTab===tab?"1px solid #1B263B":"1px solid #E0E1DD", background: activeTab===tab?"#1B263B":"#fff", color: activeTab===tab?"#fff":"#45474D", fontWeight:700, fontSize:12, cursor:"pointer", textTransform:"capitalize" }}>{tab}</button>
        ))}
      </div>

      {activeTab==="overview" && (
        <>
          <div style={cardStyle}>
            <h3 style={{ fontSize:14, fontWeight:800, color:"#1B263B", marginBottom:8 }}>How IRON protects you</h3>
            <ul style={{ fontSize:13, color:"#45474D", lineHeight:1.6, paddingLeft:18 }}>
              <li>Risk is assessed for every payment (SAFE / CAUTION / HIGH_RISK).</li>
              <li>HIGH_RISK means warning + OTP — you can still proceed after verification.</li>
              <li>Reports are evidence for future warnings, not payment blocks.</li>
              <li>Unfamiliar device is a risk signal, not a freeze.</li>
            </ul>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:12 }}>
            <div style={cardStyle}>
              <h4 style={{ fontSize:13, fontWeight:800, color:"#1B263B", marginBottom:6 }}>Recent risky payments</h4>
              {loading ? <div style={{ fontSize:13, color:"#64748b" }}>Checking payment safety...</div> : recentRisky.length===0 ? <div style={{ fontSize:13, color:"#64748b" }}>No risky payments — looks normal.</div> : recentRisky.map((t,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom: i<recentRisky.length-1?"1px solid #f1f5f9":"none" }}>
                  <span style={{ fontSize:13, color:"#0f172a" }}>{t.to||t.recipient_name||t.recipient||"Unknown"} • ₹{t.amt||t.amount}</span>
                  <span style={{ fontSize:11, fontWeight:700, padding:"2px 6px", borderRadius:10, background: t.status==="high_risk"?"#fef2f2":"#fffbeb", color: t.status==="high_risk"?"#991b1b":"#92400e", border:"1px solid #E0E1DD" }}>{(t.status||t.risk_tier||"caution").toUpperCase()}</span>
                </div>
              ))}
            </div>
            <div style={cardStyle}>
              <h4 style={{ fontSize:13, fontWeight:800, color:"#1B263B", marginBottom:6 }}>Security events</h4>
              {eventsLoading ? <div style={{ fontSize:13, color:"#64748b" }}>We couldn't load this information. Please try again.</div> : securityEvents.length===0 ? <div style={{ fontSize:13, color:"#64748b" }}>No security events yet.</div> : securityEvents.slice(0,3).map((e,i)=>(
                <div key={i} style={{ fontSize:12, color:"#334155", padding:"4px 0" }}>• {e.title} <span style={{ color:"#94a3b8" }}>{new Date(e.timestamp).toLocaleTimeString()}</span></div>
              ))}
              <button onClick={()=>setPage && setPage("security")} style={{ marginTop:8, fontSize:12, fontWeight:700, color:"#1B263B", background:"none", border:"1px solid #E0E1DD", padding:"6px 10px", borderRadius:6, cursor:"pointer" }}>Open Security Center →</button>
            </div>
          </div>
        </>
      )}

      {activeTab==="account" && (
        <>
          <div style={cardStyle}>
            <h3 style={{ fontSize:14, fontWeight:800, color:"#1B263B", marginBottom:10 }}>Account Security</h3>
            <form onSubmit={handleChangePin} style={{ display:"grid", gap:8, maxWidth:360 }}>
              <label style={{ fontSize:11, fontWeight:700, color:"#45474D" }}>Change PIN</label>
              <input type="password" value={pinOld} onChange={e=>setPinOld(e.target.value.replace(/\D/,"").slice(0,6))} placeholder="Current PIN (optional for demo)" style={{ padding:"10px 12px", border:"1px solid #E0E1DD", borderRadius:6, fontSize:13 }} />
              <input type="password" value={pinNew} onChange={e=>setPinNew(e.target.value.replace(/\D/,"").slice(0,6))} placeholder="New PIN 4-6 digits" style={{ padding:"10px 12px", border:"1px solid #E0E1DD", borderRadius:6, fontSize:13 }} />
              <Btn variant="primary" style={{ marginTop:4 }}>Update PIN</Btn>
              {pinStatus && <div style={{ fontSize:12, color: pinStatus.includes("updated")?"#166534":"#ba1a1a", background: pinStatus.includes("updated")?"#f0fdf4":"#fef2f2", border:"1px solid #E0E1DD", padding:"8px 10px", borderRadius:6 }}>{pinStatus}</div>}
            </form>
          </div>

          <div style={cardStyle}>
            <h3 style={{ fontSize:14, fontWeight:800, color:"#1B263B", marginBottom:10 }}>Active sessions / devices</h3>
            {sessionsLoading ? <div style={{ fontSize:13, color:"#64748b" }}>Checking payment safety...</div> : sessions.length===0 ? <div style={{ fontSize:13, color:"#64748b" }}>No active sessions.</div> : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {sessions.map((s,i)=>(
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", background:"#f8fafc", border:"1px solid #E0E1DD", borderRadius:6 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{s.is_current?"Current device":"Other session"} • ...{s.token_masked}</div>
                      <div style={{ fontSize:11, color:"#64748b" }}>Last active: {s.last_used? new Date(s.last_used).toLocaleString(): s.created_at} {s.is_current && <span style={{ background:"#dcfce7", color:"#166534", padding:"1px 6px", borderRadius:10, fontWeight:700, border:"1px solid #86efac" }}>This device</span>}</div>
                    </div>
                    {!s.is_current && <button onClick={()=>handleSignOutSession(s.token_masked)} style={{ fontSize:12, fontWeight:700, color:"#ba1a1a", background:"#fff", border:"1px solid #fca5a5", padding:"6px 10px", borderRadius:6, cursor:"pointer" }}>Sign out</button>}
                    {s.is_current && <span style={{ fontSize:11, color:"#94a3b8" }}>Current</span>}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize:11, color:"#64748b", marginTop:8 }}>Unfamiliar device remains a risk signal — it does not freeze payments. You can still proceed after verification.</div>
          </div>
        </>
      )}

      {activeTab==="payment" && (
        <>
          <div style={cardStyle}>
            <h3 style={{ fontSize:14, fontWeight:800, color:"#1B263B", marginBottom:10 }}>Report suspicious recipient</h3>
            <form onSubmit={handleReportRecipient} style={{ display:"grid", gap:8, maxWidth:420 }}>
              <label style={{ fontSize:11, fontWeight:700, color:"#45474D" }}>Recipient: phone or UPI</label>
              <input value={reportRecipient} onChange={e=>setReportRecipient(e.target.value)} placeholder="9876543210 or name@upi" style={{ padding:"10px 12px", border:"1px solid #E0E1DD", borderRadius:6, fontSize:13 }} />
              <label style={{ fontSize:11, fontWeight:700, color:"#45474D" }}>Reason</label>
              <select value={reportReason} onChange={e=>setReportReason(e.target.value)} style={{ padding:"10px 12px", border:"1px solid #E0E1DD", borderRadius:6, fontSize:13 }}>
                <option value="suspected_scam">Suspected scam</option>
                <option value="wrong_recipient">Wrong recipient</option>
                <option value="fraudulent_request">Fraudulent request</option>
                <option value="other">Other</option>
              </select>
              <Btn variant="primary" disabled={reportLoading}>{reportLoading?"Reporting...":"Report recipient"}</Btn>
              {reportStatus && <div style={{ fontSize:12, padding:"8px 10px", borderRadius:6, background: reportStatus.includes("Thank")?"#f0fdf4":"#fef2f2", color: reportStatus.includes("Thank")?"#166534":"#ba1a1a", border:"1px solid #E0E1DD" }}>{reportStatus}</div>}
              <div style={{ fontSize:11, color:"#64748b" }}>A report is evidence, not a payment block.</div>
            </form>
          </div>

          <div style={cardStyle}>
            <h3 style={{ fontSize:14, fontWeight:800, color:"#1B263B", marginBottom:10 }}>Report transaction</h3>
            <form onSubmit={handleReportTx} style={{ display:"grid", gap:8, maxWidth:420 }}>
              <label style={{ fontSize:11, fontWeight:700, color:"#45474D" }}>Transaction ID</label>
              <input value={reportTxId} onChange={e=>setReportTxId(e.target.value)} placeholder="paste transaction_id" style={{ padding:"10px 12px", border:"1px solid #E0E1DD", borderRadius:6, fontSize:13 }} />
              <label style={{ fontSize:11, fontWeight:700, color:"#45474D" }}>Reason</label>
              <select value={reportTxReason} onChange={e=>setReportTxReason(e.target.value)} style={{ padding:"10px 12px", border:"1px solid #E0E1DD", borderRadius:6, fontSize:13 }}>
                <option value="suspected_scam">Suspected scam</option>
                <option value="wrong_recipient">Wrong recipient</option>
                <option value="fraudulent_request">Fraudulent request</option>
                <option value="other">Other</option>
              </select>
              <Btn variant="primary">Report transaction</Btn>
              {reportTxStatus && <div style={{ fontSize:12, padding:"8px 10px", borderRadius:6, background: reportTxStatus.includes("reported")?"#f0fdf4":"#fef2f2", color:"#166534", border:"1px solid #E0E1DD" }}>{reportTxStatus}</div>}
              <div style={{ fontSize:11, color:"#64748b" }}>We store reported=true, not blocked.</div>
            </form>
          </div>

          <div style={cardStyle}>
            <h3 style={{ fontSize:14, fontWeight:800, color:"#1B263B", marginBottom:8 }}>Review recent activity</h3>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {(txs||[]).slice(0,6).map((t,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"8px 10px", background:"#f8fafc", border:"1px solid #E0E1DD", borderRadius:6 }}>
                  <span style={{ fontSize:13, color:"#0f172a" }}>{t.to||t.recipient_name||t.recipient||"?" } • ₹{(t.amt||t.amount||0).toLocaleString("en-IN")}</span>
                  <span style={{ fontSize:11, fontWeight:700, color: (t.risk>=85||t.risk_tier==="HIGH_RISK")?"#991b1b":(t.risk>=70?"#92400e":"#166534") }}>{t.status||t.risk_tier||"success"}</span>
                </div>
              ))}
              {(!txs || txs.length===0) && <div style={{ fontSize:13, color:"#64748b" }}>No transactions yet.</div>}
            </div>
          </div>
        </>
      )}

      {activeTab==="privacy" && (
        <>
          <div style={cardStyle}>
            <h3 style={{ fontSize:14, fontWeight:800, color:"#1B263B", marginBottom:8 }}>Device / session information</h3>
            <div style={{ fontSize:13, color:"#45474D", lineHeight:1.6 }}>
              <div>Current device: {navigator.userAgent.slice(0,60)}…</div>
              <div>Sessions active: {sessions.length||"1"} • Last active: just now</div>
              <div style={{ marginTop:6, fontSize:11, color:"#64748b" }}>We show only your sessions. Reporter identity is never exposed publicly. No OTP/PIN/secrets are logged.</div>
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ fontSize:14, fontWeight:800, color:"#1B263B", marginBottom:8 }}>Security events</h3>
            {eventsLoading ? <div style={{ fontSize:13, color:"#64748b" }}>Checking payment safety...</div> : securityEvents.length===0 ? <div style={{ fontSize:13, color:"#64748b" }}>No security events yet.</div> : (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {securityEvents.slice(0,6).map((e,i)=>(
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"8px 10px", background:"#f8fafc", border:"1px solid #E0E1DD", borderRadius:6 }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#0f172a" }}>{e.title}</div>
                      <div style={{ fontSize:11, color:"#64748b" }}>{e.description}</div>
                    </div>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:10, background: e.severity==="HIGH"?"#fef2f2":e.severity==="MEDIUM"?"#fffbeb":"#f0fdf4", color: e.severity==="HIGH"?"#991b1b":e.severity==="MEDIUM"?"#92400e":"#166534", border:"1px solid #E0E1DD" }}>{e.severity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
