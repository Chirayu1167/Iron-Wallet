// js/security-center.js — Security Center (Phase 13)
// Centralized visibility, not another risk engine.
// Shows security posture via backend data, no fabricated scores.

function SecurityCenter({ user, setPage }) {
  const [overview, setOverview] = useState(null);
  const [events, setEvents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [ledger, setLedger] = useState({ event_count: 0, intact: true });
  const [ledgerChecking, setLedgerChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eventsPage, setEventsPage] = useState(0);
  const pageSize = 10;

  useEffect(() => {
    async function load() {
      setLoading(true); setError(null);
      const hdr = getAuthHeader();
      if (!hdr.Authorization) { setError("Please log in."); setLoading(false); return; }
      try {
        const [ovRes, evRes, sessRes, ledgerRes] = await Promise.all([
          fetch(`${API}/security/overview`, { headers: hdr }),
          fetch(`${API}/security/events?limit=${pageSize}&offset=${eventsPage*pageSize}`, { headers: hdr }),
          fetch(`${API}/security/sessions`, { headers: hdr }),
          fetch(`${API}/security/ledger`, { headers: hdr })
        ]);
        if (!ovRes.ok) throw new Error("Failed to load overview");
        const ov = await ovRes.json();
        const ev = evRes.ok ? await evRes.json() : { events: [] };
        const sess = sessRes.ok ? await sessRes.json() : { sessions: [] };
        const led = ledgerRes.ok ? await ledgerRes.json() : { event_count: 0, intact: true };
        setOverview(ov);
        setEvents(ev.events || []);
        setSessions(sess.sessions || []);
        setLedger(led);
      } catch (e) {
        setError("We couldn't load this information. Please try again.");
      } finally { setLoading(false); }
    }
    load();
  }, [eventsPage]);

  async function verifyLedger() {
    setLedgerChecking(true);
    try {
      const res = await fetch(`${API}/security/ledger/verify`, { headers: getAuthHeader() });
      if (!res.ok) throw new Error("Verification unavailable");
      setLedger(await res.json());
    } catch {
      setLedger({ ...ledger, intact: false, message: "Security history could not be verified." });
    } finally { setLedgerChecking(false); }
  }

  async function revokeSession(suffix) {
    const hdr = getAuthHeader();
    try {
      const res = await fetch(`${API}/security/sessions/${encodeURIComponent(suffix)}/logout`, { method:"POST", headers: hdr });
      if (!res.ok) { const d=await res.json().catch(()=>({})); alert(d.detail||d.error||"Failed"); return; }
      // reload
      const r = await fetch(`${API}/security/sessions`, { headers: hdr });
      if (r.ok) { const j=await r.json(); setSessions(j.sessions||[]); }
    } catch { alert("Network error"); }
  }

  function statusColor(s) {
    if (s==="Good") return "#166534";
    if (s==="Needs attention") return "#92400e";
    return "#991b1b";
  }
  function statusBg(s) {
    if (s==="Good") return "#dcfce7";
    if (s==="Needs attention") return "#fef3c7";
    return "#fef2f2";
  }
  function severityStyle(sev) {
    if (sev==="HIGH") return { bg:"#fef2f2", color:"#991b1b", border:"#fca5a5" };
    if (sev==="MEDIUM") return { bg:"#fffbeb", color:"#92400e", border:"#fcd34d" };
    if (sev==="LOW") return { bg:"#eff6ff", color:"#1e40af", border:"#bfdbfe" };
    return { bg:"#f0fdf4", color:"#166534", border:"#86efac" };
  }
  function formatEventTime(ts) {
    try { const d=new Date(ts); return d.toLocaleString("en-IN",{ dateStyle:"medium", timeStyle:"short" }); } catch { return ts; }
  }
  function typeIcon(t) {
    if (t==="LOGIN") return "🔐";
    if (t==="LOGOUT") return "🚪";
    if (t==="OTP_VERIFIED") return "✅";
    if (t==="PIN_CHANGED") return "🔑";
    if (t==="RISK_ESCALATED") return "⚠️";
    if (t==="HIGH_RISK_PAYMENT_VERIFIED") return "🛡️";
    if (t==="RECIPIENT_REPORTED") return "🚩";
    if (t==="SESSION_REVOKED") return "🧹";
    if (t==="NEW_RECIPIENT") return "👤";
    return "ℹ️";
  }

  if (loading) return (
    <div className="page-pad page-enter" style={{ padding:"24px", maxWidth:1100, margin:"0 auto", textAlign:"center", color:"#64748b" }}>Checking payment safety...</div>
  );
  if (error) return (
    <div className="page-pad page-enter" style={{ padding:"24px", maxWidth:1100, margin:"0 auto" }}>
      <PageHeader title="Security Center" subtitle="Your security posture at a glance." onBack={()=>setPage && setPage("dashboard")} />
      <div style={{ padding:"16px", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, color:"#991b1b" }}>{error}</div>
      <Btn onClick={()=>location.reload()} variant="secondary" style={{ marginTop:12 }}>Retry</Btn>
    </div>
  );

  const secStatus = overview?.account_security || "Good";
  const recentActivity = overview?.recent_activity || "Normal";
  const activeSessions = overview?.active_sessions ?? sessions.length;
  const recentAlerts = overview?.recent_risk_alerts ?? 0;

  return (
    <div className="page-pad page-enter" style={{ padding:"24px 24px 32px", maxWidth:1100, margin:"0 auto" }}>
      <PageHeader title="Security Center" subtitle="A visibility and control layer — not another risk engine." onBack={()=>setPage && setPage("dashboard")} />

      <div style={{ background:"#fff", border:"1px solid #E0E1DD", borderRadius:8, padding:16, marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
          <div>
            <h3 style={{ fontSize:14, fontWeight:800, color:"#1B263B", margin:0 }}>Security Integrity</h3>
            <div style={{ fontSize:13, color:ledger.intact?"#166534":"#991b1b", fontWeight:700, marginTop:7 }}>
              {ledger.intact ? "✓ Security history verified" : "⚠ Security history could not be verified"}
            </div>
            <div style={{ fontSize:12, color:"#64748b", marginTop:4 }}>
              {ledger.intact ? `${ledger.event_count || 0} security events • No tampering detected` : (ledger.message || "Review the security history.")}
            </div>
          </div>
          <button onClick={verifyLedger} disabled={ledgerChecking} style={{ padding:"8px 12px", border:"1px solid #E0E1DD", borderRadius:6, background:"#fff", color:"#1B263B", fontSize:12, fontWeight:700, cursor:ledgerChecking?"wait":"pointer" }}>
            {ledgerChecking ? "Verifying…" : "Verify Security History"}
          </button>
        </div>
      </div>

      {/* Security Status */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12, marginBottom:16 }}>
        <div style={{ background:"#fff", border:"1px solid #E0E1DD", borderRadius:8, padding:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:.5 }}>Account security</div>
          <div style={{ marginTop:6, display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ padding:"4px 10px", borderRadius:20, fontWeight:800, fontSize:13, background:statusBg(secStatus), color:statusColor(secStatus), border:"1px solid #E0E1DD" }}>{secStatus}</span>
          </div>
          <div style={{ fontSize:11, color:"#94a3b8", marginTop:6 }}>{secStatus==="Good"?"No action needed.": secStatus==="Needs attention"?"One or two signals — review." : "Multiple signals — review recommended."}</div>
        </div>
        <div style={{ background:"#fff", border:"1px solid #E0E1DD", borderRadius:8, padding:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase" }}>Recent activity</div>
          <div style={{ fontSize:18, fontWeight:800, color:"#0f172a", marginTop:6 }}>{recentActivity}</div>
          <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>Based on your recent transactions</div>
        </div>
        <div style={{ background:"#fff", border:"1px solid #E0E1DD", borderRadius:8, padding:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase" }}>Active sessions</div>
          <div style={{ fontSize:18, fontWeight:800, color:"#0f172a", marginTop:6 }}>{activeSessions}</div>
          <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>{activeSessions===1?"This device only.":"Includes other devices."}</div>
        </div>
        <div style={{ background:"#fff", border:"1px solid #E0E1DD", borderRadius:8, padding:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase" }}>Recent risk alerts</div>
          <div style={{ fontSize:18, fontWeight:800, color: recentAlerts>0?"#991b1b":"#166534", marginTop:6 }}>{recentAlerts}</div>
          <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>{recentAlerts===0?"No recent alerts.":"Review below."}</div>
        </div>
      </div>

      {/* Recent Security Events timeline */}
      <div style={{ background:"#fff", border:"1px solid #E0E1DD", borderRadius:8, padding:16, marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <h3 style={{ fontSize:14, fontWeight:800, color:"#1B263B" }}>Recent Security Events</h3>
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={()=>setEventsPage(p=>Math.max(0,p-1))} disabled={eventsPage===0} style={{ padding:"6px 10px", border:"1px solid #E0E1DD", borderRadius:6, background: eventsPage===0?"#f1f5f9":"#fff", color:"#334155", cursor: eventsPage===0?"not-allowed":"pointer", fontSize:12, fontWeight:700 }}>Prev</button>
            <button onClick={()=>setEventsPage(p=>p+1)} style={{ padding:"6px 10px", border:"1px solid #E0E1DD", borderRadius:6, background:"#fff", color:"#334155", cursor:"pointer", fontSize:12, fontWeight:700 }}>Next</button>
          </div>
        </div>
        {events.length===0 ? <div style={{ fontSize:13, color:"#64748b", textAlign:"center", padding:20 }}>No security events yet.</div> : (
          <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:.5, marginBottom:8 }}>Today</div>
            {events.map((e,i)=> {
              const st = severityStyle(e.severity);
              return (
                <div key={e.event_id||i} style={{ display:"flex", gap:12, padding:"10px 0", borderBottom: i<events.length-1?"1px solid #f1f5f9":"none" }}>
                  <div style={{ width:36, height:36, borderRadius:8, background:st.bg, border:`1px solid ${st.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>{typeIcon(e.type)}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#0f172a" }}>{e.type.replace(/_/g," ")} • {e.severity}</div>
                      <div style={{ fontSize:11, color:"#94a3b8" }}>{formatEventTime(e.timestamp)}</div>
                    </div>
                    <div style={{ fontSize:13, fontWeight:600, color:"#1B263B", marginTop:2 }}>{e.title}</div>
                    <div style={{ fontSize:12, color:"#475569", marginTop:2 }}>{e.description}</div>
                    {e.transaction_id && <div style={{ fontSize:11, color:"#64748b" }}>Tx: {e.transaction_id.slice(0,8)}…</div>}
                  </div>
                  <span style={{ height:"fit-content", padding:"2px 8px", borderRadius:10, fontSize:10, fontWeight:800, background:st.bg, color:st.color, border:`1px solid ${st.border}` }}>{e.severity}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Protection actions */}
      <div style={{ background:"#fff", border:"1px solid #E0E1DD", borderRadius:8, padding:16, marginBottom:16 }}>
        <h3 style={{ fontSize:14, fontWeight:800, color:"#1B263B", marginBottom:12 }}>Protection</h3>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:10 }}>
          <button onClick={()=>setPage && setPage("protection")} style={{ padding:"14px", background:"#f8fafc", border:"1px solid #E0E1DD", borderRadius:8, cursor:"pointer", textAlign:"left" }}>
            <div style={{ fontSize:13, fontWeight:800, color:"#1B263B" }}>🔑 Change PIN</div>
            <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>Update your 4-digit PIN</div>
          </button>
          <button onClick={()=>setPage && setPage("protection")} style={{ padding:"14px", background:"#f8fafc", border:"1px solid #E0E1DD", borderRadius:8, cursor:"pointer", textAlign:"left" }}>
            <div style={{ fontSize:13, fontWeight:800, color:"#1B263B" }}>📱 Manage sessions</div>
            <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>{activeSessions} active • Sign out others</div>
          </button>
          <button onClick={()=>setPage && setPage("protection")} style={{ padding:"14px", background:"#f8fafc", border:"1px solid #E0E1DD", borderRadius:8, cursor:"pointer", textAlign:"left" }}>
            <div style={{ fontSize:13, fontWeight:800, color:"#1B263B" }}>🚩 Report suspicious activity</div>
            <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>Flag recipient or transaction</div>
          </button>
        </div>
      </div>

      {/* Sessions detail */}
      <div style={{ background:"#fff", border:"1px solid #E0E1DD", borderRadius:8, padding:16 }}>
        <h3 style={{ fontSize:14, fontWeight:800, color:"#1B263B", marginBottom:12 }}>Active sessions</h3>
        {sessions.length===0 ? <div style={{ fontSize:13, color:"#64748b" }}>We couldn't load this information.</div> : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {sessions.map((s,i)=>(
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", background: s.is_current?"#f0fdf4":"#f8fafc", border:"1px solid #E0E1DD", borderRadius:6 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{s.is_current?"Current device • ..."+s.token_masked:"Session ..."+s.token_masked} {s.is_current && <span style={{ background:"#dcfce7", color:"#166534", padding:"1px 6px", borderRadius:10, fontSize:10, fontWeight:800, border:"1px solid #86efac" }}>This device</span>}</div>
                  <div style={{ fontSize:11, color:"#64748b" }}>Created: {new Date(s.created_at).toLocaleString()} • Last: {s.last_used? new Date(s.last_used).toLocaleString(): "now"}</div>
                </div>
                {!s.is_current && <button onClick={()=>revokeSession(s.token_masked)} style={{ fontSize:12, fontWeight:700, color:"#ba1a1a", background:"#fff", border:"1px solid #fca5a5", padding:"6px 10px", borderRadius:6, cursor:"pointer" }}>Sign out</button>}
                {s.is_current && <span style={{ fontSize:11, color:"#94a3b8" }}>Current</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
