// js/soc.js — Security Operations Center (Phase 20)
// Unified read-only view over EXISTING intelligence. No new risk engine,
// no new detection, no scoring, no mutation. RiskEngine stays authoritative.
// REAL backend data only (GET /soc/overview, is_simulated:false).
// Simulator results are embedded separately and always labeled SIMULATED.

function SecurityOperationsCenter({ user, setPage }) {
  const [soc, setSoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liveOn, setLiveOn] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [investigateTx, setInvestigateTx] = useState(null);
  const [showSimulator, setShowSimulator] = useState(false);

  async function load() {
    const hdr = getAuthHeader();
    if (!hdr.Authorization) { setError("Please log in."); setLoading(false); return; }
    try {
      const res = await fetch(`${API}/soc/overview`, { headers: hdr });
      if (!res.ok) throw new Error(`SOC unavailable (${res.status})`);
      const data = await res.json();
      setSoc(data);
      setLastSync(new Date().toISOString());
      setError(null);
    } catch (e) {
      setError("We couldn't load this information. Please try again.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    // Live updates from existing WebSocket layer — refresh on new events.
    const onLive = () => {
      try { setLiveOn(!!(window._ironLive && window._ironLive.connected)); } catch {}
      load();
    };
    const onConn = () => { try { setLiveOn(true); } catch {} };
    try { setLiveOn(!!(window._ironLive && window._ironLive.connected)); } catch {}
    const evts = ["iron-live-alert", "iron-live-risk", "iron-live-verification",
      "iron-live-confirmed", "iron-live-transaction", "iron-live-reconnect", "iron-live-connected"];
    evts.forEach(ev => window.addEventListener(ev, onLive));
    window.addEventListener("iron-live-connected", onConn);
    return () => {
      evts.forEach(ev => window.removeEventListener(ev, onLive));
      window.removeEventListener("iron-live-connected", onConn);
    };
  }, []);

  function sevStyle(sev) {
    if (sev === "HIGH" || sev === "CRITICAL") return { bg: "#fef2f2", color: "#991b1b", border: "#fca5a5" };
    if (sev === "MEDIUM") return { bg: "#fffbeb", color: "#92400e", border: "#fcd34d" };
    if (sev === "LOW") return { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" };
    return { bg: "#f0fdf4", color: "#166534", border: "#86efac" };
  }
  function fmtTime(ts) {
    try { return new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
    catch { return ts || "—"; }
  }
  function tierStyle(tier) {
    if (tier === "HIGH_RISK") return { bg: "#fef2f2", color: "#991b1b", border: "#fca5a5" };
    if (tier === "CAUTION") return { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" };
    return { bg: "#dcfce7", color: "#166534", border: "#86efac" };
  }

  if (loading) return (
    <div className="page-pad page-enter" style={{ padding: "24px", maxWidth: 1100, margin: "0 auto", textAlign: "center", color: "#64748b" }}>Loading Security Operations Center…</div>
  );
  if (error && !soc) return (
    <div className="page-pad page-enter" style={{ padding: "24px", maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader title="Security Operations Center" subtitle="Unified view of your existing protection." onBack={() => setPage && setPage("dashboard")} />
      <div style={{ padding: "16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, color: "#991b1b" }}>{error}</div>
      <Btn onClick={() => { setLoading(true); load(); }} variant="secondary" style={{ marginTop: 12 }}>Retry</Btn>
    </div>
  );

  const status = soc?.status || {};
  const intel = soc?.intel || {};
  const inv = intel.investigation || {};
  const riskActivity = soc?.risk_activity || [];
  const activity = soc?.activity || [];
  const secEvents = soc?.security_events || [];
  const suspects = soc?.suspicious_recipients || [];
  const tiers = soc?.tier_counts || { SAFE: 0, CAUTION: 0, HIGH_RISK: 0 };
  let liveAlerts = [];
  try { liveAlerts = (window._ironLive && window._ironLive.liveAlerts) || []; } catch {}

  function eventKey(e, i) { return e.event_id || e.id || e.transaction_id || `ev-${i}`; }

  function renderSignalChips(ids) {
    if (!ids || ids.length === 0) return <span style={{ fontSize: 12, color: "#94a3b8" }}>No signals recorded.</span>;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        {ids.map((id, i) => (
          <span key={i} style={{ padding: "3px 8px", background: "#f8fafc", border: "1px solid #E0E1DD", borderRadius: 6, fontSize: 11, color: "#334155", fontWeight: 600 }}>{id}</span>
        ))}
      </div>
    );
  }

  return (
    <div className="page-pad page-enter" style={{ padding: "24px 24px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader title="Security Operations Center" subtitle="One place for your existing protection — live risk, attack, takeover, network and investigation signals." onBack={() => setPage && setPage("dashboard")} />

      {/* REAL vs LIVE banners */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }}>● REAL DATA — not simulated</span>
        <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800, background: liveOn ? "#dbeafe" : "#f1f5f9", color: liveOn ? "#1e40af" : "#64748b", border: "1px solid #E0E1DD" }}>{liveOn ? "● LIVE — WebSocket connected" : "○ OFFLINE — last synced " + (lastSync ? fmtTime(lastSync) : "never")}</span>
        <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#fff", color: "#64748b", border: "1px solid #E0E1DD" }}>IRON never blocks a payment — verify with OTP to proceed.</span>
      </div>

      {/* 1. Overall security status */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ background: "#fff", border: "1px solid #E0E1DD", borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: .5 }}>Overall status</div>
          <div style={{ marginTop: 6, fontSize: 16, fontWeight: 800, color: status.account_security === "Good" ? "#166534" : status.account_security === "Needs attention" ? "#92400e" : "#991b1b" }}>{status.account_security || "Good"}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>From your security posture</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E0E1DD", borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Recent activity</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginTop: 6 }}>{status.recent_activity || "Normal"}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Based on recent risk events</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E0E1DD", borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Active sessions</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginTop: 6 }}>{status.active_sessions ?? 0}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Devices signed in</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E0E1DD", borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Recent risk alerts</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: (status.recent_risk_alerts || 0) > 0 ? "#991b1b" : "#166534", marginTop: 6 }}>{status.recent_risk_alerts ?? 0}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Escalations &amp; verifications</div>
        </div>
      </div>

      {/* 2. Risk level & transaction activity */}
      <div style={{ background: "#fff", border: "1px solid #E0E1DD", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#1B263B", marginBottom: 4 }}>Risk level &amp; transaction activity</h3>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>Tiers assigned by RiskEngine (single source of truth). {activity.length === 0 ? "No transactions yet." : ""}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {(["SAFE", "CAUTION", "HIGH_RISK"]).map(t => {
            const st = tierStyle(t);
            return <span key={t} style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 800, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{t}: {tiers[t] ?? 0}</span>;
          })}
        </div>
        {activity.slice(0, 5).map((t, i) => {
          const st = tierStyle(t.risk_tier);
          return (
            <div key={t.transaction_id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < Math.min(activity.length, 5) - 1 ? "1px solid #f1f5f9" : "none", gap: 8 }}>
              <div style={{ fontSize: 12, color: "#334155", minWidth: 0 }}>
                <span style={{ fontWeight: 700 }}>₹{Number(t.amount || 0).toLocaleString("en-IN")}</span>
                <span style={{ color: "#94a3b8" }}> → {t.recipient_name || t.recipient || "—"}</span>
              </div>
              <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 800, background: st.bg, color: st.color, border: `1px solid ${st.border}`, whiteSpace: "nowrap" }}>{t.risk_tier} {t.risk_score}</span>
            </div>
          );
        })}
      </div>

      {/* 3-5. Intelligence panels (existing badges, signal-backed) */}
      <div style={{ background: "#fff", border: "1px solid #E0E1DD", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#1B263B", marginBottom: 4 }}>Threat intelligence <span style={{ fontSize: 11, fontWeight: 700, color: "#166534" }}>● REAL</span></h3>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 4px" }}>
          {intel.transaction ? `Latest assessed payment: ₹${Number(intel.transaction.amount || 0).toLocaleString("en-IN")} → ${intel.transaction.recipient_name || intel.transaction.recipient || "—"} (${intel.tier} ${intel.score})` : "No assessed payments yet — intelligence appears after your first transaction."}
        </p>
        {intel.transaction && (
          <React.Fragment>
            <AttackIntelBadge attack_type={intel.attack_type} attack_category={intel.attack_category} attack_confidence={intel.attack_confidence} attack_detail={intel.attack_detail} />
            <AccountTakeoverBadge detected={intel.account_threat_detected} confidence={intel.account_threat_confidence} signal_ids={intel.account_threat_signal_ids} detail={intel.account_takeover_detail} />
            <ScamNetworkBadge detected={intel.network_threat_detected} confidence={intel.network_confidence} network_type={intel.network_type} signal_ids={intel.network_signal_ids} detail={intel.network_detail} />
          </React.Fragment>
        )}
      </div>

      {/* 6. AI Investigator findings */}
      <div style={{ background: "#fff", border: "1px solid #E0E1DD", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#1B263B", marginBottom: 4 }}>AI Investigator findings <span style={{ fontSize: 11, fontWeight: 700, color: "#166534" }}>● REAL</span></h3>
        {!inv.summary ? <div style={{ fontSize: 13, color: "#64748b" }}>No investigation available yet.</div> : (
          <React.Fragment>
            <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.5, marginBottom: 8 }}>{inv.summary}</div>
            {inv.attack_scenario && <div style={{ fontSize: 12, color: "#92400e", fontWeight: 700, marginBottom: 6 }}>Scenario: {inv.attack_scenario}</div>}
            {(inv.key_findings || []).slice(0, 3).map((kf, i) => (
              <div key={i} style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>
                • <span style={{ fontWeight: 600 }}>{kf.finding}</span>
                {(kf.evidence_ids || []).length > 0 && <span style={{ color: "#94a3b8" }}> (evidence: {kf.evidence_ids.slice(0, 3).join(", ")})</span>}
              </div>
            ))}
            {(inv.affected_factors || []).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {inv.affected_factors.map((f, i) => (
                  <span key={i} style={{ padding: "3px 8px", background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: 6, fontSize: 11, color: "#334155" }}>{f}</span>
                ))}
              </div>
            )}
            {(inv.recommended_actions || []).length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {inv.recommended_actions.slice(0, 3).map((a, i) => (
                  <li key={i} style={{ fontSize: 12, color: "#475569", marginBottom: 2 }}>{a}</li>
                ))}
              </ul>
            )}
            {intel.transaction && intel.transaction.transaction_id && (
              <button onClick={() => setInvestigateTx(intel.transaction.transaction_id)} style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: "#1B263B", background: "#fff", border: "1px solid #E0E1DD", padding: "6px 12px", borderRadius: 6, cursor: "pointer" }}>Open full investigation →</button>
            )}
          </React.Fragment>
        )}
      </div>

      {/* 7. Recent / live security events with drill-down */}
      <div style={{ background: "#fff", border: "1px solid #E0E1DD", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#1B263B", marginBottom: 4 }}>Recent &amp; live security events</h3>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>Tap an event to see its supporting signals and evidence.</p>
        {liveAlerts.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#1e40af", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>● LIVE now</div>
            {liveAlerts.slice(-3).reverse().map((a, i) => (
              <div key={a.event_id || `live-${i}`} style={{ padding: "8px 10px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, fontSize: 12, color: "#1e3a8a", marginBottom: 6 }}>
                🔴 {a.message} <span style={{ color: "#93c5fd" }}>• {fmtTime(a.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
        {(riskActivity.length === 0 && secEvents.length === 0) ? <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", padding: 16 }}>No security events yet.</div> : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {riskActivity.slice(0, 5).map((e, i) => {
              const st = tierStyle(e.tier);
              const k = eventKey(e, `r-${i}`);
              const open = expandedId === k;
              return (
                <div key={k} style={{ padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <button onClick={() => setExpandedId(open ? null : k)} style={{ display: "flex", gap: 10, width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, alignItems: "center" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 800, background: st.bg, color: st.color, border: `1px solid ${st.border}`, whiteSpace: "nowrap" }}>{e.tier} {e.risk_score}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
                        {e.transaction && e.transaction.recipient ? `₹${Number(e.transaction.amount || 0).toLocaleString("en-IN")} → ${e.transaction.recipient_name || e.transaction.recipient}` : `Risk event ${String(e.transaction_id || "").slice(0, 8)}…`}
                      </span>
                      <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>{fmtTime(e.timestamp)} {open ? "▲" : "▼"}</span>
                    </span>
                  </button>
                  {open && (
                    <div style={{ marginTop: 8, padding: "10px 12px", background: "#f8fafc", border: "1px solid #E0E1DD", borderRadius: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 4 }}>Supporting signals ({(e.signal_ids || []).length})</div>
                      {renderSignalChips(e.signal_ids)}
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>Verification: {e.verification_required || "NONE"} • Result: {e.verification_result || "—"} • Outcome: {e.outcome || "—"}</div>
                      {e.transaction_id && (
                        <button onClick={() => setInvestigateTx(e.transaction_id)} style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "#1B263B", background: "#fff", border: "1px solid #E0E1DD", padding: "6px 12px", borderRadius: 6, cursor: "pointer" }}>Investigate with AI →</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {secEvents.slice(0, 5).map((e, i) => {
              const st = sevStyle(e.severity);
              const k = eventKey(e, `s-${i}`);
              const open = expandedId === k;
              return (
                <div key={k} style={{ padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <button onClick={() => setExpandedId(open ? null : k)} style={{ display: "flex", gap: 10, width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, alignItems: "center" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 800, background: st.bg, color: st.color, border: `1px solid ${st.border}`, whiteSpace: "nowrap" }}>{e.severity || "INFO"}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{e.title || String(e.type || "").replace(/_/g, " ")}</span>
                      <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>{fmtTime(e.timestamp)} {open ? "▲" : "▼"}</span>
                    </span>
                  </button>
                  {open && (
                    <div style={{ marginTop: 8, padding: "10px 12px", background: "#f8fafc", border: "1px solid #E0E1DD", borderRadius: 6 }}>
                      <div style={{ fontSize: 12, color: "#475569" }}>{e.description || "No description."}</div>
                      {e.transaction_id && <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>Linked transaction: {String(e.transaction_id).slice(0, 13)}…</div>}
                      {e.transaction_id && (
                        <button onClick={() => setInvestigateTx(e.transaction_id)} style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "#1B263B", background: "#fff", border: "1px solid #E0E1DD", padding: "6px 12px", borderRadius: 6, cursor: "pointer" }}>Investigate with AI →</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 8. Recent suspicious recipients */}
      <div style={{ background: "#fff", border: "1px solid #E0E1DD", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#1B263B", marginBottom: 4 }}>Recent suspicious recipients</h3>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>Network-wide reports from the scam registry.</p>
        {suspects.length === 0 ? <div style={{ fontSize: 13, color: "#64748b" }}>No flagged recipients.</div> : (
          suspects.map((s, i) => (
            <div key={s.recipient || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < suspects.length - 1 ? "1px solid #f1f5f9" : "none", gap: 8 }}>
              <div style={{ fontSize: 12, color: "#334155", minWidth: 0 }}>
                <span style={{ fontWeight: 700 }}>{s.recipient}</span>
                {(s.reasons || []).length > 0 && <span style={{ color: "#94a3b8" }}> • {(s.reasons || []).slice(0, 2).join(", ")}</span>}
              </div>
              <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 800, background: "#fef2f2", color: "#991b1b", border: "1px solid #fca5a5", whiteSpace: "nowrap" }}>{s.report_count} report{(s.report_count || 0) === 1 ? "" : "s"} • {s.tier}</span>
            </div>
          ))
        )}
      </div>

      {/* 9. Attack Simulator access (SIMULATED) */}
      <div style={{ background: "#fff", border: "1px solid #E0E1DD", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#1B263B", margin: 0 }}>Attack Simulator <span style={{ fontSize: 11, fontWeight: 800, color: "#5b21b6", background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: 10, padding: "2px 8px" }}>SIMULATED — no real money moves</span></h3>
          <button onClick={() => setShowSimulator(s => !s)} style={{ fontSize: 12, fontWeight: 700, color: "#1B263B", background: "#f8fafc", border: "1px solid #E0E1DD", padding: "8px 14px", borderRadius: 6, cursor: "pointer" }}>{showSimulator ? "Hide simulator ▲" : "Open simulator ▼"}</button>
        </div>
        {!showSimulator && <p style={{ fontSize: 12, color: "#64748b", margin: "8px 0 0" }}>Test scam scenarios safely — simulations never touch real transactions or balances.</p>}
        {showSimulator && <WhatIfSimulator onClose={() => setShowSimulator(false)} />}
      </div>

      <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", fontStyle: "italic" }}>
        Everything above is real backend data except the simulator. IRON never blocks a payment — verify with OTP to proceed.
      </div>

      {/* AI investigation drill-down */}
      {investigateTx && (
        <Modal>
          <div style={{ background: "#fff", borderRadius: 8, width: "100%", maxWidth: 640, maxHeight: "88vh", overflowY: "auto", padding: 16 }}>
            <AIInvestigatorPanel transactionId={investigateTx} onClose={() => setInvestigateTx(null)} />
            <Btn onClick={() => setInvestigateTx(null)} variant="ghost" fullWidth>Close</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
