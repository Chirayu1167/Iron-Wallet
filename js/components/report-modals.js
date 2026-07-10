
/* ═══ REPORT REASON MODAL — Pro-Tier Scam-Specific Categories ═══ */
const REPORT_REASONS = [
  {
    emoji: "🎣", value: "Phishing / Fake Link",
    desc: "Requests disguised as refunds, cashback, or prize claims",
    iconBg: "#fff7ed", iconBorder: "#fed7aa", color: "#ea580c"
  },
  {
    emoji: "🎭", value: "Impersonation",
    desc: "Pretending to be a friend, family member, or official",
    iconBg: "#f5f3ff", iconBorder: "#c4b5fd", color: "#7c3aed"
  },
  {
    emoji: "🛑", value: "Extortion / Blackmail",
    desc: "Coerced or threatening payment requests",
    iconBg: "#fef2f2", iconBorder: "#fca5a5", color: "#dc2626"
  },
  {
    emoji: "📞", value: "Support Scam",
    desc: "Fake bank support, KYC agents, or customer care",
    iconBg: "#eff6ff", iconBorder: "#93c5fd", color: "#1d4ed8"
  },
  {
    emoji: "🏪", value: "Unverified Business",
    desc: "Fake merchants, investment scams, or unregistered vendors",
    iconBg: "#f0fdf4", iconBorder: "#86efac", color: "#166534"
  },
  {
    emoji: "⌨️", value: "__other__",
    desc: "Describe the issue in your own words",
    iconBg: "#f8faff", iconBorder: "#e2e8f0", color: "#475569"
  },
];

function ReportReasonModal({ onSelect, onCancel, title = "Report Recipient" }) {
  const [otherText, setOtherText] = useState("");
  const [showOther, setShowOther] = useState(false);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  function handleSelect(r) {
    if (r.value === "__other__") {
      setShowOther(true);
    } else {
      onSelect(r.value);
    }
  }

  function submitOther() {
    const trimmed = otherText.trim();
    if (!trimmed) return;
    onSelect(`Other: ${trimmed}`);
  }

  return (
    <Modal>
      <div style={{
        position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
        zIndex: 10000,
        background: "rgba(10,18,60,.78)",
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px"
      }}>
        {/* Glass card */}
        <div style={{
          background: "rgba(255,255,255,.97)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: 28,
          maxWidth: 420, width: "100%",
          maxHeight: "92vh", overflowY: "auto",
          boxShadow: "0 40px 100px rgba(0,0,0,.32), 0 0 0 1px rgba(255,255,255,.6) inset",
          border: "1px solid rgba(220,38,38,.18)",
          animation: "scaleIn .26s cubic-bezier(.16,1,.3,1)",
        }}>

          {/* ── Header ── */}
          <div style={{
            background: "linear-gradient(135deg,#1e0a0a,#7f1d1d,#991b1b)",
            padding: "20px 22px 16px", borderRadius: "28px 28px 0 0",
            position: "relative", overflow: "hidden"
          }}>
            {/* decorative glow orb */}
            <div style={{
              position: "absolute", top: -20, right: -20,
              width: 120, height: 120, borderRadius: "50%",
              background: "rgba(255,255,255,.06)", pointerEvents: "none"
            }}/>
            <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
              <div style={{
                width: 46, height: 46, borderRadius: 14,
                background: "rgba(255,255,255,.15)",
                border: "1.5px solid rgba(255,255,255,.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, boxShadow: "0 4px 14px rgba(0,0,0,.2)"
              }}>🚩</div>
              <div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 17, letterSpacing: "-.2px" }}>{title}</div>
                <div style={{ color: "rgba(255,255,255,.65)", fontSize: 12, marginTop: 2 }}>
                  Helps protect the IronWallet network
                </div>
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          <div style={{ padding: "16px 18px 6px" }}>
            {!showOther ? (
              <>
                <p style={{
                  fontSize: 11, color: "#94a3b8", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: .8, marginBottom: 12
                }}>
                  Select the fraud category
                </p>
                {REPORT_REASONS.map((r) => {
                  const isHov = hovered === r.value;
                  return (
                    <button
                      key={r.value}
                      onClick={() => handleSelect(r)}
                      onMouseEnter={() => setHovered(r.value)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        display: "flex", alignItems: "center", width: "100%",
                        padding: "11px 14px", marginBottom: 8,
                        background: isHov ? r.iconBg : "#fff",
                        border: `1.5px solid ${isHov ? r.iconBorder : "#f1f5f9"}`,
                        borderRadius: 16, cursor: "pointer", gap: 13,
                        fontFamily: "'DM Sans',sans-serif",
                        textAlign: "left",
                        boxShadow: isHov ? `0 4px 18px ${r.iconBg}` : "0 1px 4px rgba(0,0,0,.04)",
                        transition: "all .15s cubic-bezier(.4,0,.2,1)",
                        transform: isHov ? "translateY(-1px)" : "none"
                      }}
                    >
                      {/* icon circle */}
                      <div style={{
                        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                        background: r.iconBg,
                        border: `1.5px solid ${r.iconBorder}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 20, boxShadow: `0 2px 8px ${r.iconBg}`
                      }}>
                        {r.emoji}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 700, fontSize: 13,
                          color: isHov ? r.color : "#0f172a",
                          transition: "color .15s"
                        }}>
                          {r.value === "__other__" ? "Other (Write Reason)" : r.value}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, lineHeight: 1.4 }}>
                          {r.desc}
                        </div>
                      </div>
                      {/* chevron */}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke={isHov ? r.color : "#cbd5e1"} strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round"
                        style={{ flexShrink: 0, transition: "stroke .15s" }}>
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  );
                })}
              </>
            ) : (
              /* ── "Other" text input panel ── */
              <div style={{ paddingTop: 4 }}>
                <button
                  onClick={() => setShowOther(false)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "#64748b", fontSize: 13, fontWeight: 600,
                    fontFamily: "'DM Sans',sans-serif",
                    display: "flex", alignItems: "center", gap: 5, marginBottom: 14, padding: 0
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                  Back
                </button>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
                  ⌨️ Describe the issue
                </p>
                <textarea
                  value={otherText}
                  onChange={e => setOtherText(e.target.value)}
                  placeholder="e.g. Person kept calling me to send money urgently..."
                  rows={4}
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 14,
                    border: `1.5px solid ${otherText.trim() ? "#93c5fd" : "#e2e8f0"}`,
                    fontSize: 13, fontFamily: "'DM Sans',sans-serif",
                    outline: "none", resize: "vertical", boxSizing: "border-box",
                    color: "#0f172a", background: "#f8faff", lineHeight: 1.5,
                    transition: "border-color .2s"
                  }}
                />
                <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, marginBottom: 16 }}>
                  Your description is stored privately and used to improve fraud detection.
                </p>
                <button
                  onClick={submitOther}
                  disabled={!otherText.trim()}
                  style={{
                    width: "100%", padding: "13px",
                    background: otherText.trim()
                      ? "linear-gradient(135deg,#dc2626,#b91c1c)"
                      : "#e2e8f0",
                    border: "none", borderRadius: 14,
                    color: otherText.trim() ? "#fff" : "#94a3b8",
                    fontWeight: 700, fontSize: 14, cursor: otherText.trim() ? "pointer" : "not-allowed",
                    fontFamily: "'DM Sans',sans-serif",
                    boxShadow: otherText.trim() ? "0 4px 14px rgba(220,38,38,.28)" : "none",
                    transition: "all .2s"
                  }}
                >
                  Submit Report →
                </button>
              </div>
            )}
          </div>

          {/* ── Cancel ── */}
          {!showOther && (
            <div style={{ padding: "8px 18px 20px" }}>
              <button
                onClick={onCancel}
                style={{
                  width: "100%", padding: "12px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: 14, background: "#f8faff", color: "#64748b",
                  fontWeight: 600, fontSize: 14, cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif",
                  transition: "all .15s"
                }}
                onMouseEnter={e => { e.currentTarget.style.background="#f1f5f9"; e.currentTarget.style.borderColor="#cbd5e1"; }}
                onMouseLeave={e => { e.currentTarget.style.background="#f8faff"; e.currentTarget.style.borderColor="#e2e8f0"; }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ===== FEATURE 7: NETWORK FRAUD REPORTER (post-transaction) =====
function ReportRecipientBtn({tx, user}){
  const[done,setDone]=useState(false);
  const[reportModal,setReportModal]=useState(null); // null | tx object
  if(!tx||!tx.toNum||tx.type==="credit") return null;
  function doReport(reason){
    reportRecipient(user.number, tx.toNum, tx.amt, reason);
    setReportModal(null);
    setDone(true);
  }
  return(
    <>
      {reportModal && (
        <ReportReasonModal
          onSelect={(reason) => doReport(reason)}
          onCancel={() => setReportModal(null)}
        />
      )}
      {done?(
        <span style={{fontSize:11,color:"#dc2626",fontWeight:700}}>✓ Reported</span>
      ):(
        <button onClick={() => setReportModal(tx)}
          style={{fontSize:11,color:"#dc2626",background:"#fef2f2",border:"1px solid #fecaca",
            borderRadius:8,padding:"3px 10px",cursor:"pointer",fontWeight:700,fontFamily:"'DM Sans',sans-serif"}}>
          Report
        </button>
      )}
    </>
  );
}

/* ═══ REPORT ISSUE MODAL (Scam Recovery Flow) ═══ */
/* ═══ FRAUD SEVERITY HELPERS ═══ */
function getFraudSeverity(reason) {
  if (reason.includes("Unauthorized") || reason.includes("Fraud")) return "HIGH";
  if (reason.includes("Wrong") || reason.includes("wrong")) return "MEDIUM";
  if (reason.includes("Failed") || reason.includes("deducted")) return "LOW";
  return "MEDIUM";
}
function getSeverityMeta(severity) {
  if (severity === "HIGH") return { color: "#dc2626", bg: "#fef2f2", border: "#fca5a5", emoji: "🔴", label: "Under Review", badge: "#450a0a", resolution: "0–24 Hours", sublabel: "Investigation Underway" };
  if (severity === "MEDIUM") return { color: "#d97706", bg: "#fffbeb", border: "#fcd34d", emoji: "🟡", label: "Under Review", badge: "#78350f", resolution: "2–5 Days", sublabel: "Standard Review" };
  return { color: "#16a34a", bg: "#f0fdf4", border: "#86efac", emoji: "🟢", label: "Under Review", badge: "#14532d", resolution: "1–3 Days", sublabel: "Processing" };
}
function generateRefId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "CFCFRMS-IND-2026-";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}
function getAIRiskInsights(tx) {
  const insights = [];
  const riskLevel = tx.risk >= 70 ? "HIGH" : tx.risk >= 40 ? "MEDIUM" : "LOW";
  if (tx.risk >= 70) insights.push({ icon: "⚠️", label: "High Risk Transaction", desc: `Risk score ${tx.risk}/100 — flagged` });
  if (!tx.otp_used && tx.type === "debit") insights.push({ icon: "🔐", label: "No OTP Verified", desc: "Transaction not verified via OTP" });
  if (tx.location && tx.location.toLowerCase().includes("unknown")) insights.push({ icon: "📍", label: "Unusual Location", desc: tx.location });
  if (tx.risk_tag === "new_device") insights.push({ icon: "📱", label: "New Device Detected", desc: "Login from unrecognized device" });
  if (tx.risk >= 50) insights.push({ icon: "💸", label: "Large Amount", desc: `₹${tx.amt?.toLocaleString("en-IN")} — unusual for this account` });
  return { insights, riskLevel, riskPercent: tx.risk || 0 };
}

/* ═══ LOADING SIMULATION MODAL ═══ */
function FraudReportLoadingModal({ reason, onDone }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const STEPS = [
    { label: "Validating transaction...", sub: "Verifying transaction details & amounts", duration: 1200 },
    { label: "Forwarding to bank...", sub: "Notifying your bank for immediate action", duration: 1800 },
    { label: "Sending to cyber system...", sub: "CFCFRMS — Cyber Fraud Coordination Centre", duration: 1600 },
    { label: "Generating reference ID...", sub: "Creating official complaint reference", duration: 1000 },
  ];
  useEffect(() => {
    let timer;
    const run = (i) => {
      if (i >= STEPS.length) { setDone(true); timer = setTimeout(() => onDone(), 800); return; }
      setStep(i);
      timer = setTimeout(() => run(i + 1), STEPS[i].duration);
    };
    timer = setTimeout(() => run(0), 300);
    return () => clearTimeout(timer);
  }, []);
  const sev = getFraudSeverity(reason);
  const sm = getSeverityMeta(sev);
  return (
    <Modal>
      <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 10001, background: "rgba(10,18,60,.88)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ background: "rgba(255,255,255,.98)", borderRadius: 28, maxWidth: 420, width: "100%", boxShadow: "0 40px 100px rgba(0,0,0,.32)", animation: "scaleIn .3s cubic-bezier(.16,1,.3,1)", overflow: "hidden" }}>
          <div style={{ background: "linear-gradient(135deg,#1e0533,#4c1d95,#5b21b6)", padding: "24px 26px 20px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -30, right: -30, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,.06)" }}/>
            <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(255,255,255,.15)", border: "1.5px solid rgba(255,255,255,.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>🚨</div>
              <div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>Auto Reporting in Progress</div>
                <div style={{ color: "rgba(255,255,255,.65)", fontSize: 12, marginTop: 2 }}>Submitting to CFCFRMS + Your Bank</div>
              </div>
            </div>
          </div>
          <div style={{ padding: "24px 26px 28px" }}>
            <div style={{ marginBottom: 20 }}>
              {STEPS.map((s, i) => {
                const done2 = i < step || done;
                const active = i === step && !done;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, opacity: i > step ? 0.45 : 1, transition: "opacity .3s" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: active ? "linear-gradient(135deg,#7c3aed,#5b21b6)" : done2 ? "linear-gradient(135deg,#16a34a,#15803d)" : "#f1f5f9", border: `2px solid ${active ? "#a78bfa" : done2 ? "#86efac" : "#e2e8f0"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .4s", transform: active ? "scale(1.1)" : "scale(1)" }}>
                      {done2 && !active ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        : active ? <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#fff", animation: "pulse 1s infinite" }}/> : <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#cbd5e1" }}/>}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: done ? "#16a34a" : active ? "#5b21b6" : "#94a3b8", transition: "color .3s" }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{s.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {done && <div style={{ textAlign: "center", padding: "12px", background: "#f0fdf4", borderRadius: 14, border: "1.5px solid #86efac" }}><span style={{ color: "#16a34a", fontWeight: 800, fontSize: 14 }}>✓ All steps complete — Forwarding to success screen...</span></div>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ═══ FRAUD REPORT SUCCESS MODAL ═══ */
function FraudReportSuccessModal({ ticket, tx, onClose }) {
  const sev = getFraudSeverity(ticket.reason);
  const sm = getSeverityMeta(sev);
  const riskData = getAIRiskInsights(tx);
  return (
    <Modal>
      <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 10001, background: "rgba(10,18,60,.88)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ background: "rgba(255,255,255,.98)", borderRadius: 28, maxWidth: 460, width: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 40px 100px rgba(0,0,0,.32)", animation: "scaleIn .3s cubic-bezier(.16,1,.3,1)" }}>
          {/* Header */}
          <div style={{ background: "linear-gradient(135deg,#064e3b,#065f46,#047857)", padding: "22px 24px 20px", borderRadius: "28px 28px 0 0", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -20, right: -20, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,.06)" }}/>
            <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
              <div style={{ width: 50, height: 50, borderRadius: 16, background: "rgba(255,255,255,.15)", border: "1.5px solid rgba(255,255,255,.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>✅</div>
              <div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>Complaint Submitted Successfully</div>
                <div style={{ color: "rgba(255,255,255,.65)", fontSize: 12, marginTop: 2 }}>Your report has been auto-forwarded</div>
              </div>
            </div>
          </div>
          <div style={{ padding: "20px 22px 24px" }}>
            {/* Reference ID */}
            <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 16, padding: "14px 18px", marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#065f46", textTransform: "uppercase", letterSpacing: .8, marginBottom: 6 }}>Official Reference ID</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#064e3b", letterSpacing: 1, fontFamily: "monospace" }}>{ticket.id}</div>
              <div style={{ fontSize: 11, color: "#047857", marginTop: 4 }}>CFCFRMS — Cyber Fraud Coordination Centre</div>
            </div>
            {/* Actions Initiated */}
            <div style={{ background: "#eff6ff", border: "1.5px solid #93c5fd", borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#1e40af", marginBottom: 10 }}>Actions Initiated</div>
              {[
                "Beneficiary account flagged for review",
                "Fund freeze request triggered",
                "Transaction marked suspicious",
                "Investigation in progress",
              ].map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#1d4ed8", fontWeight: 800 }}>{i + 1}</div>
                  <span style={{ fontSize: 12, color: "#1e40af", fontWeight: 600 }}>{a}</span>
                </div>
              ))}
            </div>
            {/* AI Risk Analysis */}
            {riskData.insights.length > 0 && (
              <div style={{ background: "#f8faff", border: "1.5px solid #c4b5fd", borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: "#5b21b6", marginBottom: 10 }}>🧠 AI Risk Analysis</div>
                {riskData.insights.map((ins, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 14 }}>{ins.icon}</span>
                    <div><div style={{ fontSize: 12, fontWeight: 700, color: "#4c1d95" }}>{ins.label}</div><div style={{ fontSize: 11, color: "#64748b" }}>{ins.desc}</div></div>
                  </div>
                ))}
                <div style={{ marginTop: 10, padding: "8px 12px", background: riskData.riskLevel === "HIGH" ? "#fef2f2" : riskData.riskLevel === "MEDIUM" ? "#fffbeb" : "#f0fdf4", borderRadius: 10, border: `1px solid ${riskData.riskLevel === "HIGH" ? "#fca5a5" : riskData.riskLevel === "MEDIUM" ? "#fcd34d" : "#86efac"}` }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: riskData.riskLevel === "HIGH" ? "#dc2626" : riskData.riskLevel === "MEDIUM" ? "#d97706" : "#16a34a" }}>Risk Level: {riskData.riskLevel} — {riskData.riskPercent}%</span>
                </div>
              </div>
            )}
            {/* Timeline */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", marginBottom: 12, textTransform: "uppercase", letterSpacing: .5 }}>📋 Case Timeline</div>
              {[
                { step: "✔ Submitted", done: true, time: new Date(ticket.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
                { step: "✔ Sent to Bank", done: true, time: new Date(ticket.created_at + 5000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
                { step: "✔ Sent to Cyber Cell", done: true, time: new Date(ticket.created_at + 10000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
                { step: "⏳ Fund Freeze Attempt", done: false, time: "Pending..." },
                { step: "⏳ Investigation Ongoing", done: false, time: "In progress" },
                { step: "⏳ Resolution Pending", done: false, time: `ETA: ${sm.resolution}` },
              ].map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "center" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: t.done ? "#16a34a" : "#e2e8f0", flexShrink: 0 }}/>
                  <div style={{ fontSize: 12, fontWeight: t.done ? 700 : 500, color: t.done ? "#064e3b" : "#94a3b8" }}>{t.step}</div>
                  <div style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>{t.time}</div>
                </div>
              ))}
            </div>
            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={{ flex: 1, minWidth: 120, padding: "12px 16px", borderRadius: 14, border: "1.5px solid #e2e8f0", background: "#f8faff", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>📌 Track Complaint</div>
              </button>
              <button style={{ flex: 1, minWidth: 120, padding: "12px 16px", borderRadius: 14, border: "1.5px solid #fca5a5", background: "#fef2f2", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#dc2626" }}>📞 Call 1930</div>
              </button>
              <button style={{ flex: 1, minWidth: 120, padding: "12px 16px", borderRadius: 14, border: "1.5px solid #93c5fd", background: "#eff6ff", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1d4ed8" }}>🌐 Cybercrime Portal</div>
              </button>
            </div>
            <button onClick={onClose} style={{ width: "100%", marginTop: 12, padding: "13px", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#064e3b,#047857)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 14px rgba(4,120,87,.28)" }}>Close</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ═══ ENHANCED REPORT ISSUE MODAL ═══ */
function ReportIssueModal({tx, user, onClose, onSubmit}){
  const[reason, setReason] = useState("");
  const[note, setNote] = useState("");
  const[showLoading, setShowLoading] = useState(false);
  const[showSuccess, setShowSuccess] = useState(false);
  const[createdTicket, setCreatedTicket] = useState(null);
  const REASONS = ["Unauthorized / Fraudulent Transaction","Sent Money to Wrong Person","Payment Failed but Amount Deducted","Other Issue"];

  useEffect(()=>{
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow="";};
  },[]);

  const sev = reason ? getFraudSeverity(reason) : null;
  const sm = sev ? getSeverityMeta(sev) : null;

  function handleContinue(){
    if(!reason) return;
    setShowLoading(true);
  }

  function handleLoadingDone(){
    setShowLoading(false);
    const ticketId = generateRefId();
    const now = Date.now();
    const ticket = {
      id: ticketId,
      reason,
      note,
      amount: tx.amt,
      recipient: tx.to || tx.toNum,
      transaction_id: tx.id,
      status: "Under Review",
      refund_status: "Pending",
      created_at: now,
      timeline: [{ status: "Submitted", time: now }],
      severity: sev,
    };
    setCreatedTicket(ticket);
    setShowSuccess(true);
    onSubmit(reason, note, ticketId);
  }

  if (showLoading) return <FraudReportLoadingModal reason={reason} onDone={handleLoadingDone}/>;
  if (showSuccess) return <FraudReportSuccessModal ticket={createdTicket} tx={tx} onClose={onClose}/>;

  return(
    <Modal>
      <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:10000,
        background:"rgba(10,18,60,.78)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
        display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
        <div style={{background:"rgba(255,255,255,.98)",borderRadius:26,maxWidth:460,width:"100%",
          maxHeight:"92vh",overflowY:"auto",boxShadow:"0 40px 100px rgba(0,0,0,.28)",
          border:"1px solid rgba(124,58,237,.15)",animation:"scaleIn .26s cubic-bezier(.16,1,.3,1)"}}>

          {/* Header */}
          <div style={{background:"linear-gradient(135deg,#1e0533,#4c1d95,#5b21b6)",
            padding:"22px 24px 18px",borderRadius:"26px 26px 0 0",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-20,right:-20,width:120,height:120,borderRadius:"50%",
              background:"rgba(255,255,255,.06)",pointerEvents:"none"}}/>
            <div style={{display:"flex",alignItems:"center",gap:12,position:"relative"}}>
              <div style={{width:46,height:46,borderRadius:14,background:"rgba(255,255,255,.15)",
                border:"1.5px solid rgba(255,255,255,.25)",display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:22,boxShadow:"0 4px 14px rgba(0,0,0,.2)"}}>🚨</div>
              <div>
                <div style={{color:"#fff",fontWeight:800,fontSize:17,letterSpacing:"-.2px"}}>Report Issue / Fraud Instantly</div>
                <div style={{color:"rgba(255,255,255,.65)",fontSize:12,marginTop:2}}>
                  Auto Report to Bank &amp; Cyber Cell
                </div>
              </div>
              <button onClick={onClose} style={{marginLeft:"auto",background:"rgba(255,255,255,.15)",
                border:"none",color:"#fff",cursor:"pointer",borderRadius:8,padding:"5px 8px"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          <div style={{padding:"20px 22px 24px"}}>
            {/* Auto-Forward Description */}
            <div style={{background:"#fffbeb",border:"1.5px solid #fcd34d",borderRadius:14,padding:"12px 16px",marginBottom:18}}>
              <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                <span style={{fontSize:18,flexShrink:0}}>⚡</span>
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#92400e",marginBottom:4}}>Instant Auto-Report</div>
                  <div style={{fontSize:12,color:"#a16207",lineHeight:1.5}}>
                    This will automatically forward your complaint to your bank and the cyber fraud monitoring system (simulation). No need to report manually elsewhere.
                  </div>
                </div>
              </div>
            </div>

            {/* What happens section */}
            <div style={{background:"#f8faff",borderRadius:14,padding:"12px 16px",marginBottom:18,
              border:"1px solid #e8f1ff"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:.6,marginBottom:10}}>What happens when you continue:</div>
              {[
                "Transaction will be analyzed",
                "Report will be forwarded to Cyber Fraud System (CFCFRMS simulation)",
                "Bank will be notified for immediate action",
                "Official reference ID will be generated",
              ].map((item, i) => (
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:"#7c3aed",flexShrink:0}}/>
                  <span style={{fontSize:12,color:"#4c1d95",fontWeight:600}}>{item}</span>
                </div>
              ))}
            </div>

            {/* Transaction Summary */}
            <div style={{background:"#f8faff",borderRadius:14,padding:"14px 16px",marginBottom:18,
              border:"1px solid #e8f1ff"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",
                letterSpacing:.8,marginBottom:10}}>Transaction Details</div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontSize:13,color:"#64748b"}}>Amount</span>
                <span style={{fontSize:15,fontWeight:800,color:"#dc2626"}}>₹{tx.amt.toLocaleString("en-IN")}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontSize:13,color:"#64748b"}}>Recipient</span>
                <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{tx.to || tx.toNum}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:13,color:"#64748b"}}>Date &amp; Time</span>
                <span style={{fontSize:13,color:"#0f172a"}}>{tx.date} · {tx.time}</span>
              </div>
            </div>

            {/* Reason Dropdown */}
            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:8,
                textTransform:"uppercase",letterSpacing:.5}}>Reason for Fraud Report</label>
              <select value={reason} onChange={e=>setReason(e.target.value)}
                style={{width:"100%",padding:"12px 14px",borderRadius:12,
                  border:`1.5px solid ${reason?"#a78bfa":"#e2e8f0"}`,fontSize:14,
                  outline:"none",boxSizing:"border-box",color:reason?"#0f172a":"#94a3b8",
                  background:"#fff",fontFamily:"'DM Sans',sans-serif",cursor:"pointer",
                  appearance:"none",WebkitAppearance:"none"}}>
                <option value="">Select a reason…</option>
                {REASONS.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Optional Note */}
            <div style={{marginBottom:20}}>
              <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:8,
                textTransform:"uppercase",letterSpacing:.5}}>Additional Note (optional)</label>
              <textarea value={note} onChange={e=>setNote(e.target.value)}
                placeholder="Describe what happened…" rows={3}
                style={{width:"100%",padding:"12px 14px",borderRadius:12,
                  border:"1.5px solid #e2e8f0",fontSize:13,outline:"none",resize:"vertical",
                  boxSizing:"border-box",color:"#0f172a",background:"#f8faff",
                  fontFamily:"'DM Sans',sans-serif",lineHeight:1.5,transition:"border-color .2s"}}
                onFocus={e=>e.target.style.borderColor="#a78bfa"}
                onBlur={e=>e.target.style.borderColor="#e2e8f0"}
              />
            </div>

            <div style={{display:"flex",gap:10}}>
              <button onClick={handleContinue} disabled={!reason}
                style={{flex:1,padding:"13px",borderRadius:14,border:"none",
                  background:reason?"linear-gradient(135deg,#7c3aed,#5b21b6)":"#e2e8f0",
                  color:reason?"#fff":"#94a3b8",fontWeight:700,fontSize:14,
                  cursor:reason?"pointer":"not-allowed",fontFamily:"'DM Sans',sans-serif",
                  boxShadow:reason?"0 4px 14px rgba(124,58,237,.28)":"none",transition:"all .2s"}}>
                Continue → Auto Report
              </button>
              <button onClick={onClose}
                style={{padding:"13px 20px",borderRadius:14,border:"1.5px solid #e2e8f0",
                  background:"#f8faff",color:"#64748b",fontWeight:600,fontSize:14,
                  cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ═══ TICKET DETAIL MODAL ═══ */
function TicketDetailModal({ticket, onClose, tx}){
  useEffect(()=>{
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow="";};
  },[]);

  const statusMeta = {
    "Under Review":  {color:"#92400e",bg:"#fef3c7",border:"#fcd34d",dot:"#f59e0b"},
    "Investigating": {color:"#1e40af",bg:"#dbeafe",border:"#93c5fd",dot:"#3b82f6"},
    "Resolved":      {color:"#166534",bg:"#dcfce7",border:"#86efac",dot:"#22c55e"},
  };
  const refundMeta = {
    "Pending":  {color:"#92400e",bg:"#fef3c7",label:"⏳ Pending"},
    "Approved": {color:"#166534",bg:"#dcfce7",label:"✅ Approved"},
    "Rejected": {color:"#dc2626",bg:"#fef2f2",label:"❌ Rejected"},
  };
  const sm = statusMeta[ticket.status] || statusMeta["Under Review"];
  const rm = refundMeta[ticket.refund_status] || refundMeta["Pending"];
  const sev = ticket.severity || getFraudSeverity(ticket.reason || "");
  const svm = getSeverityMeta(sev);
  const riskData = tx ? getAIRiskInsights(tx) : { insights: [], riskLevel: "LOW", riskPercent: 0 };

  const TIMELINE_STEPS = ["Submitted","Sent to Bank","Sent to Cyber Cell","Fund Freeze Attempt","Investigation Ongoing","Resolution Pending"];

  return(
    <Modal>
      <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:10000,
        background:"rgba(10,18,60,.78)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
        display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
        <div style={{background:"rgba(255,255,255,.98)",borderRadius:26,maxWidth:460,width:"100%",
          maxHeight:"92vh",overflowY:"auto",boxShadow:"0 40px 100px rgba(0,0,0,.28)",
          animation:"scaleIn .26s cubic-bezier(.16,1,.3,1)"}}>

          {/* Header */}
          <div style={{background:"linear-gradient(135deg,#0f172a,#1e3a5f,#0055cc)",
            padding:"22px 24px 18px",borderRadius:"26px 26px 0 0",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-20,right:-20,width:120,height:120,borderRadius:"50%",
              background:"rgba(255,255,255,.05)",pointerEvents:"none"}}/>
            <div style={{display:"flex",alignItems:"center",gap:12,position:"relative"}}>
              <div style={{width:46,height:46,borderRadius:14,background:"rgba(255,255,255,.15)",
                border:"1.5px solid rgba(255,255,255,.25)",display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:22}}>🚨</div>
              <div>
                <div style={{color:"#fff",fontWeight:800,fontSize:17}}>{ticket.id}</div>
                <div style={{color:"rgba(255,255,255,.65)",fontSize:12,marginTop:2}}>
                  Filed {new Date(ticket.created_at).toLocaleString()}
                </div>
              </div>
              {/* Severity Badge */}
              <div style={{marginLeft:"auto",background:svm.bg,border:`1.5px solid ${svm.border}`,borderRadius:10,padding:"4px 10px"}}>
                <div style={{fontSize:11,fontWeight:800,color:svm.color}}>{svm.emoji} {svm.label}</div>
              </div>
              <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",
                border:"none",color:"#fff",cursor:"pointer",borderRadius:8,padding:"5px 8px"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          <div style={{padding:"20px 22px 24px"}}>
            {/* Status + Refund + Severity Row */}
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              <div style={{flex:1,padding:"10px 12px",background:sm.bg,borderRadius:12,
                border:`1px solid ${sm.border}`,textAlign:"center"}}>
                <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,marginBottom:3}}>Status</div>
                <div style={{fontWeight:800,fontSize:12,color:sm.color,display:"flex",
                  alignItems:"center",justifyContent:"center",gap:4}}>
                  <svg width="6" height="6"><circle cx="3" cy="3" r="3" fill={sm.dot}/></svg>
                  {ticket.status}
                </div>
              </div>
              <div style={{flex:1,padding:"10px 12px",background:rm.bg,borderRadius:12,
                border:"1px solid rgba(0,0,0,.06)",textAlign:"center"}}>
                <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,marginBottom:3}}>Refund</div>
                <div style={{fontWeight:800,fontSize:12,color:rm.color}}>{rm.label}</div>
              </div>
              <div style={{flex:1,padding:"10px 12px",background:svm.bg,borderRadius:12,
                border:`1px solid ${svm.border}`,textAlign:"center"}}>
                <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,marginBottom:3}}>Status</div>
                <div style={{fontWeight:800,fontSize:12,color:svm.color,display:"flex",
                  alignItems:"center",justifyContent:"center",gap:4}}>
                  <svg width="6" height="6"><circle cx="3" cy="3" r="3" fill={sm.dot}/></svg>
                  {ticket.status}
                </div>
              </div>
              <div style={{flex:1,padding:"10px 12px",background:rm.bg,borderRadius:12,
                border:"1px solid rgba(0,0,0,.06)",textAlign:"center"}}>
                <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,marginBottom:3}}>Refund</div>
                <div style={{fontWeight:800,fontSize:12,color:rm.color}}>{rm.label}</div>
              </div>
            </div>

            {/* Expected Resolution Time — dynamic */}
            <div style={{
              padding:"12px 16px",
              background: svm.bg,
              border:`1.5px solid ${svm.border}`,
              borderRadius:12,
              marginBottom:16,
              display:"flex",
              alignItems:"center",
              gap:10
            }}>
              <span style={{fontSize:20,flexShrink:0}}>⏱️</span>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:svm.color}}>
                  Under Review
                </div>
                <div style={{fontSize:12,color:svm.color,opacity:0.8,marginTop:2}}>
                  {svm.resolution} — {svm.sublabel}
                </div>
              </div>
            </div>

            {/* AI Risk Analysis */}
            {riskData.insights.length > 0 && (
              <div style={{background:"#f8faff",border:"1.5px solid #c4b5fd",borderRadius:14,padding:"12px 16px",marginBottom:16}}>
                <div style={{fontWeight:800,fontSize:12,color:"#5b21b6",marginBottom:10,textTransform:"uppercase",letterSpacing:.5}}>🧠 AI Risk Analysis</div>
                {riskData.insights.map((ins, i) => (
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:6}}>
                    <span style={{fontSize:14,flexShrink:0}}>{ins.icon}</span>
                    <div><div style={{fontSize:12,fontWeight:700,color:"#4c1d95"}}>{ins.label}</div><div style={{fontSize:11,color:"#64748b"}}>{ins.desc}</div></div>
                  </div>
                ))}
                <div style={{marginTop:10,padding:"8px 12px",background:riskData.riskLevel === "HIGH" ? "#fef2f2" : riskData.riskLevel === "MEDIUM" ? "#fffbeb" : "#f0fdf4",borderRadius:10,border:`1px solid ${riskData.riskLevel === "HIGH" ? "#fca5a5" : riskData.riskLevel === "MEDIUM" ? "#fcd34d" : "#86efac"}`}}>
                  <span style={{fontSize:11,fontWeight:800,color:riskData.riskLevel === "HIGH" ? "#dc2626" : riskData.riskLevel === "MEDIUM" ? "#d97706" : "#16a34a"}}>Risk Level: {riskData.riskLevel} — {riskData.riskPercent}%</span>
                </div>
              </div>
            )}

            {/* Transaction Info */}
            <div style={{background:"#f8faff",borderRadius:12,padding:"14px 16px",marginBottom:16,
              border:"1px solid #e8f1ff"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",
                letterSpacing:.8,marginBottom:10}}>Dispute Case Info</div>
              {[
                ["Amount", `₹${ticket.amount?.toLocaleString("en-IN")}`],
                ["Recipient", ticket.recipientName || ticket.recipient],
                ["Reason", ticket.reason],
                ["Ref ID", ticket.id],
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",
                  padding:"6px 0",borderBottom:"1px solid #f0f6ff"}}>
                  <span style={{fontSize:13,color:"#64748b"}}>{k}</span>
                  <span style={{fontSize:13,fontWeight:700,color:"#0f172a",textAlign:"right",maxWidth:"60%"}}>{v}</span>
                </div>
              ))}
              {ticket.note && (
                <div style={{padding:"8px 0",fontSize:13,color:"#64748b"}}>
                  <span style={{fontWeight:700,color:"#0f172a"}}>Note: </span>{ticket.note}
                </div>
              )}
            </div>

            {/* Timeline */}
            <div style={{marginBottom:4}}>
              <div style={{fontSize:12,fontWeight:800,color:"#0f172a",marginBottom:14,textTransform:"uppercase",letterSpacing:.5}}>📋 Case Timeline</div>
              {TIMELINE_STEPS.map((step, i) => {
                const done = ticket.timeline.some(t => t.status === step);
                const entry = ticket.timeline.find(t => t.status === step);
                const isLast = i === TIMELINE_STEPS.length - 1;
                return (
                  <div key={step} style={{display:"flex",gap:12,position:"relative"}}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                      <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
                        background:done?"linear-gradient(135deg,#0078FF,#0055cc)":"#f1f5f9",
                        border:`2px solid ${done?"#0078FF":"#e2e8f0"}`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:13,zIndex:1}}>
                        {done ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                               : <div style={{width:8,height:8,borderRadius:"50%",background:"#e2e8f0"}}/>}
                      </div>
                      {!isLast && <div style={{width:2,height:32,background:done?"#bfdbfe":"#f1f5f9",margin:"4px 0"}}/>}
                    </div>
                    <div style={{paddingBottom: isLast ? 0 : 28, flex:1}}>
                      <div style={{fontWeight:700,fontSize:13,color:done?"#0f172a":"#94a3b8"}}>{step}</div>
                      {entry && (
                        <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>
                          {new Date(entry.time).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}
                        </div>
                      )}
                      {!done && (
                        <div style={{fontSize:11,color:"#cbd5e1",marginTop:2}}>Pending…</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
