// js/risk-components.js — Phase 14: Risk visualization + Transaction detail + consistent UX
// Phase 16: Attack Intelligence display (advisory, reuses backend signals).
// Phase 17: Account Takeover Intelligence display (combination-based, advisory).
// Phase 18: Scam Network & Campaign Intelligence display (existing data, advisory).
// Simple readable presentation, no excessive gradients, serious security-focused.

// Phase 16 — human labels + icons for attack types (frontend display only;
// authoritative classification lives in backend RiskEngine).
const ATTACK_META = {
  FAKE_KYC_SUSPENSION: { label: "Fake KYC / Account Suspension", icon: "🛡️" },
  IMPERSONATION: { label: "Impersonation", icon: "🎭" },
  FAKE_REFUND_REWARD: { label: "Fake Refund / Reward", icon: "🎁" },
  INVESTMENT_LOAN_SCAM: { label: "Investment / Loan Scam", icon: "📈" },
  REMOTE_ACCESS: { label: "Remote Access", icon: "🖥️" },
  OTP_HARVESTING: { label: "OTP Harvesting", icon: "🔑" },
  PAYMENT_ANOMALY: { label: "Payment Anomaly", icon: "⚡" },
  ACCOUNT_THREAT: { label: "Account-related threats", icon: "👤" },
  NONE: { label: "No attack detected", icon: "✅" },
};

function AttackIntelBadge({ attack_type, attack_category, attack_confidence, attack_detail, compact }) {
  const t = attack_type || attack_detail?.attack_type || "NONE";
  if (!t || t === "NONE") {
    if (compact) return null;
    return (
      <div style={{ marginTop:10, padding:"8px 10px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:6, fontSize:12, color:"#166534" }}>
        ✅ No known attack pattern detected
      </div>
    );
  }
  const meta = ATTACK_META[t] || { label: t.replace(/_/g," ").toLowerCase(), icon:"⚠️" };
  const cat = attack_category || attack_detail?.attack_category || "";
  const conf = attack_confidence ?? attack_detail?.attack_confidence ?? null;
  const sigIds = attack_detail?.signal_ids || [];
  return (
    <div style={{ marginTop:10, padding:"10px 12px", background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:6 }}>
      <div style={{ fontSize:11, fontWeight:800, color:"#92400e", textTransform:"uppercase", letterSpacing:.4 }}>Attack Intelligence</div>
      <div style={{ fontSize:13, fontWeight:800, color:"#0f172a", marginTop:4 }}>{meta.icon} {meta.label}</div>
      <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
        {cat ? <span>Category: <b>{cat}</b></span> : null}
        {conf !== null && conf !== undefined ? <span> • Confidence: <b>{Math.round(conf*100)}%</b></span> : null}
      </div>
      {attack_detail?.description ? <div style={{ fontSize:12, color:"#475569", marginTop:4 }}>{attack_detail.description}</div> : null}
      {sigIds.length>0 && !compact ? <div style={{ fontSize:11, color:"#64748b", marginTop:6 }}>Evidence: {sigIds.slice(0,4).join(", ")}{sigIds.length>4 ? ` +${sigIds.length-4} more` : ""}</div> : null}
      <div style={{ fontSize:11, color:"#92400e", marginTop:4 }}>Advisory only — you can still proceed after verification.</div>
    </div>
  );
}

function AccountTakeoverBadge({ detected, confidence, signal_ids, detail, compact }) {
  // Phase 17 — combination-based takeover display (frontend only; authoritative
  // detection lives in backend RiskEngine). Hidden when not detected unless
  // compact is false and caller wants the reassuring state — keep minimal:
  // render nothing when not detected in compact mode, subtle line otherwise.
  if (!detected) {
    if (compact) return null;
    return null;
  }
  const sigIds = signal_ids || detail?.signal_ids || [];
  return (
    <div style={{ marginTop:10, padding:"10px 12px", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:6 }}>
      <div style={{ fontSize:11, fontWeight:800, color:"#991b1b", textTransform:"uppercase", letterSpacing:.4 }}>Account Takeover Risk</div>
      <div style={{ fontSize:13, fontWeight:800, color:"#0f172a", marginTop:4 }}>🔐 Possible account takeover</div>
      <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
        {confidence !== null && confidence !== undefined ? <span>Confidence: <b>{Math.round(confidence*100)}%</b></span> : null}
      </div>
      {detail?.explanation ? <div style={{ fontSize:12, color:"#475569", marginTop:4 }}>{detail.explanation}</div> : null}
      {sigIds.length>0 && !compact ? <div style={{ fontSize:11, color:"#64748b", marginTop:6 }}>Evidence: {sigIds.slice(0,4).join(", ")}{sigIds.length>4 ? ` +${sigIds.length-4} more` : ""}</div> : null}
      <div style={{ fontSize:11, color:"#991b1b", marginTop:4 }}>Advisory only — verify via OTP. You can still proceed.</div>
    </div>
  );
}

const NETWORK_META = {
  REPORTED_RECIPIENT_NETWORK: { label: "Reported recipient network", icon: "🕸️" },
  SHARED_HANDLE_CAMPAIGN: { label: "Shared handle campaign", icon: "🔗" },
  REPEATED_ATTACK_CAMPAIGN: { label: "Repeated attack campaign", icon: "🔁" },
  RECIPIENT_REPEAT_CLUSTER: { label: "Repeat recipient cluster", icon: "👥" },
  NONE: { label: "No network pattern", icon: "✅" },
};

function ScamNetworkBadge({ detected, confidence, network_type, signal_ids, detail, compact }) {
  // Phase 18 — existing-data network display (frontend only; authoritative
  // detection lives in backend RiskEngine). Render nothing when not detected.
  if (!detected) return null;
  const meta = NETWORK_META[network_type] || { label: (network_type || "").replace(/_/g, " ").toLowerCase(), icon: "🕸️" };
  const sigIds = signal_ids || detail?.signal_ids || [];
  return (
    <div style={{ marginTop:10, padding:"10px 12px", background:"#f5f3ff", border:"1px solid #c4b5fd", borderRadius:6 }}>
      <div style={{ fontSize:11, fontWeight:800, color:"#5b21b6", textTransform:"uppercase", letterSpacing:.4 }}>Scam Network Intelligence</div>
      <div style={{ fontSize:13, fontWeight:800, color:"#0f172a", marginTop:4 }}>{meta.icon} {meta.label}</div>
      <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
        {confidence !== null && confidence !== undefined ? <span>Confidence: <b>{Math.round(confidence*100)}%</b></span> : null}
      </div>
      {detail?.explanation ? <div style={{ fontSize:12, color:"#475569", marginTop:4 }}>{detail.explanation}</div> : null}
      {sigIds.length>0 && !compact ? <div style={{ fontSize:11, color:"#64748b", marginTop:6 }}>Evidence: {sigIds.slice(0,4).join(", ")}{sigIds.length>4 ? ` +${sigIds.length-4} more` : ""}</div> : null}
      <div style={{ fontSize:11, color:"#5b21b6", marginTop:4 }}>Advisory only — you can still proceed after verification.</div>
    </div>
  );
}

function RiskScoreCard({ score, tier, explanation, reasons, requires_otp, attack_type, attack_category, attack_confidence, attack_detail, risk, account_threat_detected, account_threat_confidence, account_threat_signal_ids, account_takeover_detail, network_threat_detected, network_confidence, network_type, network_signal_ids, network_detail }) {
  // Phase 16: accept attack fields directly or via `risk` / explanation_detail.
  const atkType = attack_type || risk?.attack_type || risk?.explanation_detail?.attack_type || risk?.attack_detail?.attack_type || "NONE";
  const atkCat = attack_category || risk?.attack_category || risk?.explanation_detail?.attack_category || risk?.attack_detail?.attack_category || "NONE";
  const atkConf = attack_confidence ?? risk?.attack_confidence ?? risk?.explanation_detail?.attack_confidence ?? risk?.attack_detail?.attack_confidence ?? null;
  const atkDetail = attack_detail || risk?.attack_detail || risk?.explanation_detail?.attack || null;
  // Phase 17: accept takeover fields directly or via `risk` / explanation_detail.
  const atoDetail = account_takeover_detail || risk?.account_takeover_detail || risk?.explanation_detail?.account_takeover || null;
  const atoDetected = account_threat_detected ?? risk?.account_threat_detected ?? risk?.explanation_detail?.account_threat_detected ?? atoDetail?.account_threat_detected ?? false;
  const atoConf = account_threat_confidence ?? risk?.account_threat_confidence ?? risk?.explanation_detail?.account_threat_confidence ?? atoDetail?.account_threat_confidence ?? null;
  const atoSigIds = account_threat_signal_ids || risk?.account_threat_signal_ids || risk?.explanation_detail?.account_threat_signal_ids || atoDetail?.signal_ids || [];
  // Phase 18: accept network fields directly or via `risk` / explanation_detail.
  const netDetail = network_detail || risk?.network_detail || risk?.explanation_detail?.scam_network || null;
  const netDetected = network_threat_detected ?? risk?.network_threat_detected ?? risk?.explanation_detail?.network_threat_detected ?? netDetail?.network_threat_detected ?? false;
  const netConf = network_confidence ?? risk?.network_confidence ?? risk?.explanation_detail?.network_confidence ?? netDetail?.network_confidence ?? null;
  const netType = network_type || risk?.network_type || risk?.explanation_detail?.network_type || netDetail?.network_type || "NONE";
  const netSigIds = network_signal_ids || risk?.network_signal_ids || risk?.explanation_detail?.network_signal_ids || netDetail?.signal_ids || [];
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
          <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:.5 }}>Payment check</div>
          <div style={{ display:"flex", alignItems:"baseline", gap:6, marginTop:4 }}>
            <span style={{ fontSize:16, fontWeight:800, color:tierColor }}>{tier==="SAFE" ? "Looks consistent" : "Needs your review"}</span>
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
      <AttackIntelBadge attack_type={atkType} attack_category={atkCat} attack_confidence={atkConf} attack_detail={atkDetail} />
      <AccountTakeoverBadge detected={atoDetected} confidence={atoConf} signal_ids={atoSigIds} detail={atoDetail} />
      <ScamNetworkBadge detected={netDetected} confidence={netConf} network_type={netType} signal_ids={netSigIds} detail={netDetail} />
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
      {requires_otp && <div style={{ marginTop:10, padding:"8px 10px", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:6, fontSize:12, color:"#854d0e", fontWeight:600 }}>We'll ask you to verify this payment before it goes through.</div>}
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
  const atkDetailTx = risk?.attack_detail || risk?.explanation_detail?.attack || null;
  const atkTypeTx = risk?.attack_type || risk?.explanation_detail?.attack_type || atkDetailTx?.attack_type || "NONE";
  const atkCatTx = risk?.attack_category || risk?.explanation_detail?.attack_category || atkDetailTx?.attack_category || "NONE";
  const atkConfTx = risk?.attack_confidence ?? risk?.explanation_detail?.attack_confidence ?? atkDetailTx?.attack_confidence ?? null;
  // Phase 17: takeover fields via risk / explanation_detail.
  const atoDetailTx = risk?.account_takeover_detail || risk?.explanation_detail?.account_takeover || null;
  const atoDetectedTx = risk?.account_threat_detected ?? risk?.explanation_detail?.account_threat_detected ?? atoDetailTx?.account_threat_detected ?? false;
  const atoConfTx = risk?.account_threat_confidence ?? risk?.explanation_detail?.account_threat_confidence ?? atoDetailTx?.account_threat_confidence ?? null;
  const atoSigIdsTx = risk?.account_threat_signal_ids || risk?.explanation_detail?.account_threat_signal_ids || atoDetailTx?.signal_ids || [];
  // Phase 18: network fields via risk / explanation_detail.
  const netDetailTx = risk?.network_detail || risk?.explanation_detail?.scam_network || null;
  const netDetectedTx = risk?.network_threat_detected ?? risk?.explanation_detail?.network_threat_detected ?? netDetailTx?.network_threat_detected ?? false;
  const netConfTx = risk?.network_confidence ?? risk?.explanation_detail?.network_confidence ?? netDetailTx?.network_confidence ?? null;
  const netTypeTx = risk?.network_type || risk?.explanation_detail?.network_type || netDetailTx?.network_type || "NONE";
  const netSigIdsTx = risk?.network_signal_ids || risk?.explanation_detail?.network_signal_ids || netDetailTx?.signal_ids || [];
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
          <AttackIntelBadge attack_type={atkTypeTx} attack_category={atkCatTx} attack_confidence={atkConfTx} attack_detail={atkDetailTx} compact={false} />
          <AccountTakeoverBadge detected={atoDetectedTx} confidence={atoConfTx} signal_ids={atoSigIdsTx} detail={atoDetailTx} compact={false} />
          <ScamNetworkBadge detected={netDetectedTx} confidence={netConfTx} network_type={netTypeTx} signal_ids={netSigIdsTx} detail={netDetailTx} compact={false} />
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
