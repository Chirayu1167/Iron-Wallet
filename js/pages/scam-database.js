/* ═══════════════════════════════════════════════════════════════════════════
   IRONWALLET — Scam Database Page
   scam-database.js

   Browsable network-wide registry of reported scam recipients.
   All data comes from the persistent backend (/scam-db/flagged, /scam-db/stats).

   Tiers
   ─────
   flagged          (1-2 reports)  → amber warning
   high_risk        (3-4 reports)  → orange, triggers fraud engine rules
   network_blocked  (5+ reports)   → red, hard warning on send screen
   ════════════════════════════════════════════════════════════════════════ */

const SCAM_TIER_META = {
  network_blocked: {
    label:"Network Blocked", color:"#dc2626", bg:"#fef2f2",
    border:"#fca5a5", icon:"🚫", desc:"5+ reports — flagged across the entire network",
  },
  high_risk: {
    label:"High Risk", color:"#ea580c", bg:"#fff7ed",
    border:"#fdba74", icon:"🔴", desc:"3-4 reports — strong fraud signal",
  },
  flagged: {
    label:"Flagged", color:"#ca8a04", bg:"#fefce8",
    border:"#fde047", icon:"⚠️", desc:"1-2 reports — under monitoring",
  },
  clean: {
    label:"Clean", color:"#16a34a", bg:"#f0fdf4",
    border:"#86efac", icon:"✅", desc:"No reports",
  },
};

const SCAM_REASONS = [
  "Phishing / Fake Link",
  "Impersonation",
  "Support Scam",
  "Lottery / Prize Scam",
  "Advance Fee Fraud",
  "KYC Update Scam",
  "Investment Fraud",
  "Extortion / Blackmail",
  "Fake Job Offer",
  "Other",
];

function ScamDatabasePage({ user, setPage }) {
  const [records,  setRecords]  = React.useState([]);
  const [stats,    setStats]    = React.useState(null);
  const [loading,  setLoading]  = React.useState(true);
  const [filter,   setFilter]   = React.useState("all");   // all | network_blocked | high_risk | flagged
  const [search,   setSearch]   = React.useState("");
  const [showReport, setShowReport] = React.useState(false);
  const [reportNum,  setReportNum]  = React.useState("");
  const [reportReason, setReportReason] = React.useState(SCAM_REASONS[0]);
  const [reportAmt,  setReportAmt]  = React.useState("");
  const [reporting,  setReporting]  = React.useState(false);
  const [reportDone, setReportDone] = React.useState(null);

  const base = typeof API !== "undefined" ? API : "";

  async function fetchData() {
    setLoading(true);
    try {
      const [recRes, statRes] = await Promise.all([
        fetch(`${base}/scam-db/flagged?min_count=1`),
        fetch(`${base}/scam-db/stats`),
      ]);
      const recs  = await recRes.json();
      const stats = await statRes.json();
      setRecords(Array.isArray(recs) ? recs : []);
      setStats(stats);
    } catch (e) {
      setRecords([]);
    }
    setLoading(false);
  }

  React.useEffect(() => { fetchData(); }, []);

  async function handleReport() {
    if (!reportNum || reportNum.length < 10) return;
    setReporting(true);
    try {
      const res = await fetch(`${base}/scam-db/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: reportNum,
          reporter:  user.number,
          reason:    reportReason,
          amount:    parseFloat(reportAmt) || 0,
        }),
      });
      const data = await res.json();
      setReportDone(data);
      fetchData();
    } catch (e) {
      setReportDone({ error: true });
    }
    setReporting(false);
  }

  const filtered = records.filter(r => {
    if (filter !== "all" && r.tier !== filter) return false;
    if (search && !r.recipient.includes(search)) return false;
    return true;
  });

  return (
    <div style={{ padding: "0 0 80px" }}>

      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(135deg,#7f1d1d,#dc2626)",
        padding: "20px 16px 16px", marginBottom: 16,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          <button onClick={() => setPage("dashboard")} style={{
            background:"rgba(255,255,255,.15)", border:"none", borderRadius:8,
            color:"#fff", padding:"6px 10px", cursor:"pointer",
            fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:700,
          }}>← Back</button>
          <div>
            <div style={{ fontSize:18, fontWeight:900, color:"#fff" }}>🛡 Scam Database</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,.8)" }}>
              Network-wide community fraud registry
            </div>
          </div>
        </div>

        {/* Stats strip */}
        {stats && (
          <div style={{
            display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8,
          }}>
            {[
              { label:"Total Flagged", val: stats.total_flagged_recipients, color:"#fcd34d" },
              { label:"Total Reports", val: stats.total_reports,            color:"#fca5a5" },
              { label:"High Risk",     val: stats.high_risk_count,          color:"#fb923c" },
              { label:"Blocked",       val: stats.network_blocked_count,    color:"#f87171" },
            ].map((s,i) => (
              <div key={i} style={{
                background:"rgba(255,255,255,.12)", borderRadius:10, padding:"8px 10px",
                textAlign:"center",
              }}>
                <div style={{ fontSize:20, fontWeight:900, color:s.color }}>{s.val}</div>
                <div style={{ fontSize:9, color:"rgba(255,255,255,.75)", marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding:"0 16px" }}>

        {/* ── Search + Filter ── */}
        <div style={{ marginBottom:12, display:"flex", gap:8 }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by number..."
            style={{
              flex:1, padding:"10px 12px", borderRadius:10,
              border:"1.5px solid #e2e8f0", fontSize:13,
              fontFamily:"'DM Sans',sans-serif", outline:"none",
            }}
          />
          <button onClick={() => setShowReport(true)} style={{
            padding:"10px 14px", borderRadius:10,
            background:"linear-gradient(135deg,#dc2626,#991b1b)",
            border:"none", color:"#fff", fontSize:12, fontWeight:800,
            cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
            whiteSpace:"nowrap",
          }}>+ Report</button>
        </div>

        {/* Filter chips */}
        <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
          {[
            { key:"all",             label:"All" },
            { key:"network_blocked", label:"🚫 Blocked" },
            { key:"high_risk",       label:"🔴 High Risk" },
            { key:"flagged",         label:"⚠️ Flagged" },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding:"5px 12px", borderRadius:20, fontSize:11, fontWeight:700,
              cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
              background: filter===f.key ? "#0078FF" : "#f1f5f9",
              color: filter===f.key ? "#fff" : "#64748b",
              border: filter===f.key ? "none" : "1px solid #e2e8f0",
            }}>{f.label}</button>
          ))}
        </div>

        {/* ── Records list ── */}
        {loading ? (
          <div style={{ textAlign:"center", padding:"40px 0", color:"#94a3b8" }}>
            <div style={{ fontSize:24, marginBottom:8 }}>🔍</div>
            Loading scam database...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign:"center", padding:"40px 20px",
            background:"#f8faff", borderRadius:12, border:"1.5px dashed #e2e8f0",
          }}>
            <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:4 }}>
              {search || filter!=="all" ? "No matching records" : "No Scam Reports Yet"}
            </div>
            <div style={{ fontSize:12, color:"#94a3b8" }}>
              {search || filter!=="all"
                ? "Try adjusting your search or filter"
                : "Be the first to report suspicious activity"}
            </div>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {filtered.map((r, i) => {
              const tm = SCAM_TIER_META[r.tier] || SCAM_TIER_META.flagged;
              const lastDate = r.last_reported
                ? new Date(r.last_reported * 1000).toLocaleDateString("en-IN", {day:"numeric",month:"short",year:"numeric"})
                : "Unknown";
              return (
                <div key={i} style={{
                  background:"#fff", borderRadius:12,
                  border:`1.5px solid ${tm.border}`,
                  padding:"12px 14px",
                  animation:"slideDown .2s ease",
                }}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                    {/* Tier icon */}
                    <div style={{
                      width:36, height:36, borderRadius:10, flexShrink:0,
                      background:tm.bg, display:"flex",
                      alignItems:"center", justifyContent:"center", fontSize:18,
                    }}>{tm.icon}</div>

                    <div style={{ flex:1, minWidth:0 }}>
                      {/* Number + tier badge */}
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4, flexWrap:"wrap" }}>
                        <span style={{ fontSize:14, fontWeight:800, color:"#0f172a", fontFamily:"monospace" }}>
                          {r.recipient}
                        </span>
                        <span style={{
                          fontSize:10, fontWeight:800, color:tm.color,
                          background:tm.bg, padding:"2px 8px", borderRadius:8,
                          border:`1px solid ${tm.border}`, textTransform:"uppercase",
                        }}>{tm.label}</span>
                      </div>

                      {/* Report count + date */}
                      <div style={{ fontSize:11, color:"#64748b", marginBottom:6 }}>
                        <span style={{ fontWeight:700, color:tm.color }}>
                          {r.report_count} report{r.report_count!==1?"s":""}
                        </span>
                        {" · "}Last reported {lastDate}
                      </div>

                      {/* Reason tags */}
                      {(r.reasons||[]).length > 0 && (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                          {r.reasons.map((reason, j) => (
                            <span key={j} style={{
                              fontSize:10, color:"#374151",
                              background:"#f1f5f9", padding:"2px 8px",
                              borderRadius:6, border:"1px solid #e2e8f0",
                            }}>{reason}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── How it works explainer ── */}
        <div style={{
          marginTop:20, padding:"14px 16px",
          background:"#f8faff", borderRadius:12,
          border:"1px solid #e2e8f0", fontSize:11, color:"#64748b", lineHeight:1.6,
        }}>
          <div style={{ fontWeight:800, color:"#374151", marginBottom:6 }}>🛡 How the Scam Database works</div>
          <div>When you report a recipient, it's stored permanently and visible to <b>all IronWallet users</b>. At <b>3+ reports</b> the fraud engine automatically raises the risk score on any payment to that number. At <b>5+ reports</b> it shows a hard warning before any transfer.</div>
        </div>
      </div>

      {/* ── Report Modal ── */}
      {showReport && (
        <Modal>
          <div style={{ padding:"22px 20px 18px", maxWidth:360, margin:"0 auto" }}>
            <div style={{ fontSize:17, fontWeight:800, color:"#0f172a", marginBottom:14, textAlign:"center" }}>
              🚨 Report Suspicious Recipient
            </div>

            {reportDone ? (
              <div style={{ textAlign:"center", padding:"20px 0" }}>
                {reportDone.error ? (
                  <div style={{ color:"#dc2626", fontWeight:700 }}>Failed to submit report. Try again.</div>
                ) : (
                  <>
                    <div style={{ fontSize:36, marginBottom:10 }}>✅</div>
                    <div style={{ fontSize:14, fontWeight:800, color:"#16a34a", marginBottom:6 }}>
                      Report Submitted
                    </div>
                    <div style={{ fontSize:12, color:"#64748b", lineHeight:1.5 }}>
                      {reportDone.recipient} now has <b>{reportDone.report_count}</b> report{reportDone.report_count!==1?"s":""}.
                      Tier: <b style={{ color: SCAM_TIER_META[reportDone.tier]?.color }}>{reportDone.tier}</b>
                      {reportDone.deduplicated && <><br/><span style={{color:"#94a3b8",fontSize:11}}>(You already reported this number today — count unchanged)</span></>}
                    </div>
                    <button onClick={() => { setShowReport(false); setReportDone(null); setReportNum(""); setReportAmt(""); }}
                      style={{
                        marginTop:16, padding:"10px 24px",
                        background:"#0078FF", border:"none", borderRadius:10,
                        color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer",
                        fontFamily:"'DM Sans',sans-serif",
                      }}>Done</button>
                  </>
                )}
              </div>
            ) : (
              <>
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>
                    Recipient Number / UPI ID
                  </label>
                  <input value={reportNum} onChange={e => setReportNum(e.target.value)}
                    placeholder="9876543210 or name@upi"
                    style={{
                      width:"100%", padding:"10px 12px", borderRadius:10,
                      border:"1.5px solid #e2e8f0", fontSize:13,
                      fontFamily:"'DM Sans',sans-serif", outline:"none",
                      boxSizing:"border-box",
                    }}
                  />
                </div>

                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>
                    Scam Type
                  </label>
                  <select value={reportReason} onChange={e => setReportReason(e.target.value)}
                    style={{
                      width:"100%", padding:"10px 12px", borderRadius:10,
                      border:"1.5px solid #e2e8f0", fontSize:13,
                      fontFamily:"'DM Sans',sans-serif", outline:"none",
                      background:"#fff", cursor:"pointer",
                    }}>
                    {SCAM_REASONS.map((r,i) => <option key={i} value={r}>{r}</option>)}
                  </select>
                </div>

                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>
                    Amount Lost (optional)
                  </label>
                  <input value={reportAmt} onChange={e => setReportAmt(e.target.value)}
                    type="number" placeholder="0"
                    style={{
                      width:"100%", padding:"10px 12px", borderRadius:10,
                      border:"1.5px solid #e2e8f0", fontSize:13,
                      fontFamily:"'DM Sans',sans-serif", outline:"none",
                      boxSizing:"border-box",
                    }}
                  />
                </div>

                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={() => { setShowReport(false); setReportNum(""); }}
                    style={{
                      flex:1, padding:"12px 0", background:"#f8faff",
                      border:"1.5px solid #e2e8f0", borderRadius:10,
                      fontSize:13, fontWeight:700, color:"#64748b",
                      cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
                    }}>Cancel</button>
                  <button onClick={handleReport} disabled={!reportNum || reporting}
                    style={{
                      flex:2, padding:"12px 0",
                      background: reportNum && !reporting ? "linear-gradient(135deg,#dc2626,#991b1b)" : "#e2e8f0",
                      border:"none", borderRadius:10, fontSize:13, fontWeight:700,
                      color: reportNum && !reporting ? "#fff" : "#94a3b8",
                      cursor: reportNum && !reporting ? "pointer" : "not-allowed",
                      fontFamily:"'DM Sans',sans-serif",
                    }}>
                    {reporting ? "Submitting..." : "🚨 Submit Report"}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
