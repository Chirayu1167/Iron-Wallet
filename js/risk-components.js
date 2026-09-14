// js/risk-components.js — Phase 14: Risk visualization + Transaction detail + consistent UX
// Simple readable presentation, no excessive gradients, serious security-focused.

function RiskScoreCard({ score, tier, explanation, reasons, requires_otp }) {
  const meta = riskMeta(score) || riskMetaIron(score);
  const tierColor = tier==="HIGH_RISK" ? "#991b1b" : tier==="CAUTION" ? "#92400e" : "#166534";
  const tierBg = tier==="HIGH_RISK" ? "#fef2f2" : tier==="CAUTION" ? "#fef3c7" : "#dcfce7";
  const tierBorder = tier==="HIGH_RISK" ? "#fca5a5" : tier==="CAUTION" ? "#fcd34d" : "#86efac";
  const icon = tier==="HIGH_RISK" ? "🔴" : tier==="CAUTION" ? "🟡" : "🟢";
  // accessibility: icon + text, not color alone
  return (
    <div style={{ background:"#fff", border:"1px solid #E0E1DD", borderRadius:8, padding:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:.5 }}>Risk Score</div>
          <div style={{ display:"flex", alignItems:"baseline", gap:6, marginTop:4 }}>
            <span style={{ fontSize:28, fontWeight:800, color:"#0f172a" }}>{score}</span>
            <span style={{ fontSize:13, color:"#64748b" }}>/ 100</span>
            <span style={{ marginLeft:8, padding:"4px 10px", borderRadius:20, fontSize:12, fontWeight:800, background:tierBg, color:tierColor, border:`1px solid ${tierBorder}` }}>{icon} {tier}</span>
          </div>
        </div>
        <div style={{ width:56, height:56, borderRadius:12, background: tierBg, border:`1px solid ${tierBorder}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>{tier==="HIGH_RISK"?"⚠️": tier==="CAUTION"?"🔍":"✅"}</div>
      </div>
      <div style={{ fontSize:13, color:"#334155", lineHeight:1.5 }}>
        {tier==="SAFE" && "Looks normal — This payment matches your usual activity. You can continue."}
        {tier==="CAUTION" && "Review this payment — We detected some unusual activity. You can continue after review."}
        {tier==="HIGH_RISK" && "High-risk payment — This payment has multiple risk signals. Verify with OTP to continue. You can still proceed."}
      </div>
      {explanation && <div style={{ marginTop:8, fontSize:12, color:"#475569", fontStyle:"italic" }}>{explanation}</div>}
      {reasons && reasons.length>0 && (
        <div style={{ marginTop:12 }}>
          <div style={{ fontSize:11, fontWeight:800, color:"#1B263B", marginBottom:6 }}>Why?</div>
          <ul style={{ margin:0, paddingLeft:18 }}>
            {reasons.slice(0,4).map((r,i)=>(
              <li key={i} style={{ fontSize:12, color:"#334155", marginBottom:4 }}>
                <span style={{ fontWeight:600 }}>{r.title || r.id}</span>{r.description? ": "+r.description : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {requires_otp && <div style={{ marginTop:10, padding:"8px 10px", background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:6, fontSize:12, color:"#92400e", fontWeight:600 }}>Verification required • You can still proceed after OTP</div>}
    </div>
  );
}

function RiskBreakdown({ components }) {
  if (!components) return null;
  const items = [
    { key:"behavior", label:"Behaviour", val: components.behavior ?? components.behaviour ?? 0 },
    { key:"fraud_intelligence", label:"Fraud Intel", val: components.fraud_intelligence ?? 0 },
    { key:"recipient", label:"Recipient", val: components.recipient ?? 0 },
    { key:"context", label:"Context", val: components.context ?? 0 },
  ];
  return (
    <div style={{ background:"#fff", border:"1px solid #E0E1DD", borderRadius:8, padding:14 }}>
      <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", marginBottom:8 }}>Risk component scores • not probabilities</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
        {items.map(it=>(
          <div key={it.key} style={{ padding:"10px 12px", background:"#f8fafc", border:"1px solid #E0E1DD", borderRadius:6, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:12, fontWeight:700, color:"#334155" }}>{it.label}</span>
            <span style={{ fontSize:14, fontWeight:800, color: it.val>=70?"#991b1b": it.val>=50?"#92400e":"#166534" }}>{Math.round(it.val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransactionDetailCard({ tx, risk, onClose }) {
  // tx from backend or local; risk from prepare
  const amount = tx?.amt ?? tx?.amount ?? 0;
  const recipient = tx?.toNum || tx?.recipient || tx?.to || "?";
  const recipientName = tx?.to || tx?.recipient_name || recipient;
  const score = risk?.score ?? tx?.risk ?? tx?.risk_score ?? 0;
  const tier = risk?.tier ?? tx?.risk_tier ?? (score>=85?"HIGH_RISK": score>=70?"CAUTION":"SAFE");
  const reasons = risk?.explanation_detail?.reasons || risk?.reasons || [];
  const verification = tx?.otp_used ? "OTP verified" : (risk?.requires_otp ? "OTP required" : "PIN verified");
  const status = tx?.status || "SUCCESS";
  return (
    <div style={{ background:"#fff", border:"1px solid #E0E1DD", borderRadius:8, overflow:"hidden" }}>
      <div style={{ padding:"16px", background:"linear-gradient(135deg,#1B263B,#0F1E2E)", color:"#fff" }}>
        <div style={{ fontSize:28, fontWeight:800 }}>₹{Number(amount).toLocaleString("en-IN")}</div>
        <div style={{ fontSize:12, opacity:.8, marginTop:4 }}>Ref: {tx?.id || tx?.transaction_id || "—"} • {tx?.date || (tx?.timestamp ? new Date(tx.timestamp).toLocaleDateString():"")}</div>
      </div>
      <div style={{ padding:16 }}>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase" }}>Recipient</div>
          <div style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>{recipientName} <span style={{ fontWeight:500, color:"#64748b" }}>({recipient})</span></div>
        </div>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase" }}>Risk</div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
            <span style={{ padding:"4px 10px", borderRadius:20, fontSize:12, fontWeight:800, background: tier==="HIGH_RISK"?"#fef2f2":tier==="CAUTION"?"#fef3c7":"#dcfce7", color: tier==="HIGH_RISK"?"#991b1b":tier==="CAUTION"?"#92400e":"#166534", border:"1px solid #E0E1DD" }}>{tier} — {score}</span>
            <span style={{ fontSize:11, color:"#64748b" }}>Component view below</span>
          </div>
          {reasons.length>0 && (
            <ul style={{ marginTop:8, paddingLeft:18 }}>
              {reasons.slice(0,3).map((r,i)=><li key={i} style={{ fontSize:12, color:"#334155" }}>{r.title || r.description || r}</li>)}
            </ul>
          )}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
          <div style={{ padding:10, background:"#f8fafc", border:"1px solid #E0E1DD", borderRadius:6 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#64748b" }}>Verification</div>
            <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>{verification}</div>
          </div>
          <div style={{ padding:10, background:"#f8fafc", border:"1px solid #E0E1DD", borderRadius:6 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#64748b" }}>Status</div>
            <div style={{ fontSize:13, fontWeight:700, color: status==="SUCCESS"?"#166534": status==="HIGH_RISK"?"#991b1b":"#92400e" }}>{status} {tier==="HIGH_RISK" && status==="SUCCESS" && <span style={{ fontSize:11, fontWeight:500 }}>• High risk can still succeed — intentional.</span>}</div>
          </div>
        </div>
        {risk?.components && <RiskBreakdown components={risk.components} />}
        <div style={{ marginTop:12, display:"flex", gap:8 }}>
          {risk && <button onClick={()=>{ if(risk) window.dispatchEvent(new CustomEvent("iron-open-investigate",{detail:{risk}})); }} style={{ flex:1, padding:"10px", background:"#fff", border:"1px solid #1B263B", borderRadius:6, fontWeight:700, fontSize:12, cursor:"pointer" }}>Investigate with AI</button>}
          {onClose && <button onClick={onClose} style={{ flex:1, padding:"10px", background:"#1B263B", color:"#fff", border:"none", borderRadius:6, fontWeight:700, fontSize:12, cursor:"pointer" }}>Close</button>}
        </div>
      </div>
    </div>
  );
}

function LiveAlertBanner({ alerts, onDismiss }) {
  if (!alerts || alerts.length===0) return null;
  const latest = alerts[alerts.length-1];
  return (
    <div role="alert" aria-live="polite" style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"12px 14px", background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:8, marginBottom:12 }}>
      <span style={{ fontSize:16 }}>🔔</span>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:800, color:"#92400e" }}>IRON Alert</div>
        <div style={{ fontSize:12, color:"#78350f", marginTop:2 }}>{latest.message || "Risk increased for your payment."}</div>
        {latest.data?.risk && <div style={{ fontSize:11, fontWeight:700, color: latest.data.risk.tier==="HIGH_RISK"?"#991b1b":"#92400e", marginTop:4 }}>{latest.data.risk.tier} — {latest.data.risk.score}</div>}
        <div style={{ fontSize:11, color:"#92400e", marginTop:4 }}>Additional risk signals were detected. <a href="#" onClick={e=>{e.preventDefault(); onDismiss && onDismiss(latest);}} style={{ color:"#92400e", fontWeight:700 }}>Review</a></div>
      </div>
      {onDismiss && <button onClick={()=>onDismiss(latest)} aria-label="Dismiss alert" style={{ background:"none", border:"none", fontSize:16, cursor:"pointer", color:"#92400e" }}>×</button>}
    </div>
  );
}
