/* ═══ REQUESTS PAGE — Fully Upgraded ═══ */
function RequestsPage({user,requests,resolveRequest,addTx,updateBalance,updateUser}){
  const [localRequests, setLocalRequests] = useState(requests);
  const [verifying, setVerifying] = useState(null);
  const [verifyStage, setVerifyStage] = useState('otp');
  const [showFreeze, setShowFreeze] = useState(false);
  const [freezeData, setFreezeData] = useState(null);
  // ── Report modal state: null | { req } ──
  const [reportModal, setReportModal] = useState(null);

  useEffect(() => { setLocalRequests(requests); }, [requests]);

  useEffect(() => {
    const frozen = checkFrozen(user);
    if (frozen.frozen) { setFreezeData(frozen); setShowFreeze(true); }
  }, [user]);

  /* ── Red-flag keyword scanner for payment request notes ── */
  const REQ_SCAM_KEYWORDS = [
    // Greed hooks (critical tier — +50 to +60)
    "prize","lucky draw","won","cashback","reward","lottery","free prize","you won","congratulations",
    "cash win","free win","award","gift card","bonus prize",
    // Urgency / fear (critical tier — +48 to +55)
    "blocked","electricity bill","emergency","processing fee","pending fine","penalty","charge",
    "admin fee","refund fee","claim prize","verify account","account blocked","urgent payment",
    // Authority hooks (critical tier — +48 to +55)
    "kyc update","bank officer","verification","refund department","support","aadhaar update",
    "pan card","immediate action","act now","limit exceeded"
  ];

  // Tiered keyword penalty based on sender verification
  function scanNoteKeywords(note, senderVerified = false) {
    if (!note) return { hit: false, matched: [], penalty: 0, tier: null };
    const lower = note.toLowerCase();
    const matched = REQ_SCAM_KEYWORDS.filter(kw => lower.includes(kw));
    if (matched.length === 0) return { hit: false, matched: [], penalty: 0, tier: null };
    // Unknown/unverified sender + scam keyword → critical penalty
    if (!senderVerified) {
      const critical = matched.some(k => ["prize","lucky draw","won","emergency","refund fee","claim prize"].some(c => lower.includes(c)));
      return { hit: true, matched, penalty: critical ? 60 : 50, tier: "critical" };
    }
    // Known sender but still flagged → medium-high
    return { hit: true, matched, penalty: 35, tier: "high" };
  }

  /* ── Risk helpers for a request — with keyword penalty & deduplication ── */
  function reqRiskInfo(req) {
    const result        = calculateRisk(user, req.amt, req.fromNum);
    const senderVerified = (user.contacts || {}).hasOwnProperty(req.fromNum);
    const kwScan        = scanNoteKeywords(req.reason, senderVerified);
    const kwPenalty     = kwScan.penalty;

    // Deduplicate amount-based signals before adding keyword ones
    const amtPatterns = [
      /This transaction drains \d+% of your balance/i,
      /Large transfer:.*of your current balance/i,
      /Amount.*is unusually far outside your typical range/i,
      /Amount ₹[\d,]+ is (much higher|higher) than your usual/i,
      /This transaction.*is.*higher than your usual amount/i,
      /Large transaction for.*your age group/i,
      /High.?value transaction/i,
      /\d+(\.\d+)?× (your avg|higher than)/i,
    ];
    let seenAmt = false;
    const dedupedSignals = result.signals.filter(s => {
      const isAmt = amtPatterns.some(rx => rx.test(s));
      if (isAmt) { if (!seenAmt) { seenAmt = true; return true; } return false; }
      return true;
    });

    // Append keyword signals if triggered
    const signals = [...dedupedSignals];
    if (kwScan.hit) {
      const severity = kwScan.tier === "critical" ? "🚨 Critical" : "⚠️ High";
      signals.push(
        `${severity} scam keyword${kwScan.matched.length > 1 ? "s" : ""} in note: "${kwScan.matched.slice(0,3).join('", "')}" — high-fraud pattern.`
      );
    }

    let rawRisk = result.risk + kwPenalty;

    // ── Minimum risk floor for scam keywords ──
    if (kwScan.hit) {
      const hasOtherSignals = result.signals.length > 0 || rawRisk > result.risk;
      const floor = hasOtherSignals ? 85 : 70;
      rawRisk = Math.max(rawRisk, floor);
    }

    const totalRisk = Math.min(100, user.risk_score + rawRisk);
    let tier = 'normal';
    if (totalRisk >= RISK_OTP)  tier = 'otp';
    else if (totalRisk >= RISK_INFO) tier = 'info';
    return { result: {...result, risk: rawRisk, signals}, totalRisk, tier, kwScan };
  }

  async function acceptReq(req) {
    // === VPN Detection Check ===
    // Run this check before accepting any payment request
    const vpnCheck = await checkVPNDetection(user.number);
    if (vpnCheck.vpnDetected && vpnCheck.blocked) {
      alert("VPN detected. Please turn off VPN to proceed with payment.");
      return;
    }

    const { result, totalRisk, tier } = reqRiskInfo(req);
    setVerifying({ req, result, tier, totalRisk });
    setVerifyStage(tier !== 'normal' ? 'otp' : 'pin');
  }

  async function completeAccept() {
    const { req, result, tier } = verifying;
    const { date, time } = nowStamp();
    if (req.amt > user.balance) {
      alert("Insufficient balance to pay this request");
      setVerifying(null); return;
    }

    // === VPN Detection Check ===
    // Run this check before completing any transaction
    const vpnCheck = await checkVPNDetection(user.number);
    if (vpnCheck.vpnDetected && vpnCheck.blocked) {
      alert("VPN detected. Please turn off VPN to proceed with payment.");
      setVerifying(null); return;
    }

    const otpUsed = tier === 'otp' || tier === 'high_risk';
    const status  = tier === 'high_risk' ? 'verified' : 'success';
    const tx = {
      id: Date.now(), to: req.from, toNum: req.fromNum, upi: req.upi,
      amt: req.amt, date, time, risk: verifying.totalRisk, status,
      type: "debit", note: req.reason, isNew: true,
      risk_tag: tier, otp_used: otpUsed
    };
    addTx(tx);
    updateBalance(b => b - req.amt);
    if (req.fromNum) {
      if (!user.known_recipients) user.known_recipients = new Set();
      user.known_recipients.add(req.fromNum);
    }
    user.risk_score = Math.max(0, user.risk_score + result.risk - (otpUsed ? OTP_DISCOUNT : 0));
    resolveRequest(req.id, "paid");
    setLocalRequests(prev => prev.map(r => r.id === req.id ? {...r, status:"paid"} : r));

    // Record network info for VPN detection on the NEXT transaction.
    getNetworkInfo().then(netInfo => {
      recordTxNetwork(user.number, netInfo);
    });

    setVerifying(null);
  }

  function declineReq(id) {
    resolveRequest(id, "declined");
    setLocalRequests(prev => prev.map(r => r.id === id ? {...r, status:"declined"} : r));
  }

  function openReportModal(req) { setReportModal({ req }); }

  function completeReport(reason) {
    const { req } = reportModal;
    if (req.fromNum) {
      reportRecipient(user.number, req.fromNum, req.amt, reason);
    }
    resolveRequest(req.id, "reported");
    setLocalRequests(prev => prev.map(r => r.id === req.id ? {...r, status:"reported"} : r));
    setReportModal(null);
  }

  const pending  = localRequests.filter(r => r.status === "pending");
  const resolved = localRequests.filter(r => r.status !== "pending");

  if (showFreeze && freezeData) {
    return <FreezeModal message={freezeData.message} permanent={freezeData.permanent}
      remaining={freezeData.remaining} onClose={() => setShowFreeze(false)}/>;
  }

  return(
    <div className="page-pad page-enter" style={{padding:24,maxWidth:720,margin:"0 auto"}}>

      {/* ── Report Reason Modal ── */}
      {reportModal && (
        <ReportReasonModal
          title="Report This Request"
          onSelect={completeReport}
          onCancel={() => setReportModal(null)}
        />
      )}

      {/* ── OTP / PIN verification modals ── */}
      {verifying && (
        verifying.tier !== 'normal' && verifyStage === 'otp' ? (
          <OTPModal
            mobile={user.number}
            onSuccess={() => setVerifyStage('pin')}
            onCancel={() => { setVerifying(null); setVerifyStage('otp'); }}
          />
        ) : (
          <PINModal
            userPin={user.pin} user={user}
            onSuccess={completeAccept}
            onCancel={() => { setVerifying(null); setVerifyStage('otp'); }}
          />
        )
      )}

      <div style={{marginBottom:22}}>
        <h2 style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Payment Requests</h2>
        <p style={{fontSize:14,color:"#64748b"}}>{pending.length} pending · {resolved.length} resolved · Paying these will debit your balance</p>
      </div>

      {localRequests.length===0 && (
        <Card style={{padding:"40px",textAlign:"center"}}>
          <div style={{color:"#94a3b8",fontSize:15}}>No payment requests.</div>
        </Card>
      )}

      {localRequests.map((req, ri) => {
        const { result, totalRisk, tier, kwScan } = reqRiskInfo(req);
        const m = riskMeta(totalRisk);
        const requiresOTP  = totalRisk >= RISK_OTP;   // 85+: PIN+OTP enforced
        const useOTPLabel  = totalRisk >= 90;          // 90+: button reads "Verify with OTP"
        const needsTimer   = totalRisk >= 90;          // 90+: timer shown
        const isSuspicious = requiresOTP;
        const recipRisk    = getRecipientRisk(req.fromNum || "");
        const recipReason  = getRecipientReportReason(req.fromNum || "");

        // signals are already deduped inside reqRiskInfo
        const signals = result.signals || [];

        return (
          <Card key={req.id} style={{
            padding: 0, marginBottom: 16, overflow: "hidden",
            border: (req.id === 999 || (needsTimer && recipRisk > 0))
                    ? "2px solid #dc2626"
                    : needsTimer ? "1.5px solid #fca5a5"
                    : isSuspicious ? "1.5px solid #fdba74"
                    : "1px solid rgba(0,80,200,.07)",
            boxShadow: (req.id === 999 || (needsTimer && recipRisk > 0))
                    ? "0 0 0 3px rgba(220,38,38,.15), 0 8px 28px rgba(220,38,38,.18)"
                    : undefined,
          }}>
            {/* risk accent bar */}
            <div style={{height:4, background:`linear-gradient(90deg,${m.dot},${m.color})`, borderRadius:"18px 18px 0 0"}}/>

            <div style={{padding:"18px 20px 0"}}>
              {/* ── 90+ Extra Caution Banner ── */}
              {needsTimer && req.status === "pending" && (
                <div style={{
                  display:"flex", alignItems:"flex-start", gap:10,
                  padding:"11px 14px", marginBottom:14,
                  background:"linear-gradient(135deg,#fef2f2,#fff1f2)",
                  border:"2px solid #dc2626", borderRadius:12,
                  animation:"slideDown .3s ease"
                }}>
                  <span style={{fontSize:20, lineHeight:1, flexShrink:0}}>⚠️</span>
                  <div>
                    <div style={{fontWeight:800, fontSize:13, color:"#dc2626"}}>BE EXTRA CAREFUL</div>
                    <div style={{fontSize:12, color:"#991b1b", marginTop:2, lineHeight:1.4}}>
                      This request has multiple high-risk signals. Verify the sender's identity before paying.
                    </div>
                  </div>
                </div>
              )}

              {/* ── Suspicious (85–89) inline warning ── */}
              {isSuspicious && !needsTimer && req.status === "pending" && (
                <div style={{
                  display:"flex", alignItems:"center", gap:9,
                  padding:"9px 13px", marginBottom:12,
                  background:"#fff7ed", border:"1px solid #fdba74", borderRadius:10,
                  animation:"slideDown .3s ease"
                }}>
                  {Ic.warn("#f97316")}
                  <span style={{fontSize:12, color:"#92400e", fontWeight:600}}>
                    Suspicious request — OTP verification required before paying
                  </span>
                </div>
              )}

              {/* ── Request header ── */}
              <div style={{display:"flex", alignItems:"center", gap:14, marginBottom:14}}>
                <Avatar name={req.from} size={48}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800, fontSize:15, color:"#0f172a"}}>{req.from}</div>
                  <div style={{fontSize:12, color:"#94a3b8", marginTop:2}}>{req.upi} · {req.ago}</div>
                  <div style={{fontSize:12, color:"#64748b", fontStyle:"italic", marginTop:3}}>"{req.reason}"</div>
                  {/* Prior report signal from registry */}
                  {recipRisk >= 1 && (
                    <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:5}}>
                      <div style={{display:"inline-flex", alignItems:"center", gap:5,
                        padding:"3px 10px", background:"#fef2f2", border:"1px solid #fca5a5",
                        borderRadius:20, fontSize:11, fontWeight:700, color:"#dc2626"}}>
                        {Ic.flag("#dc2626")}
                        ⚠ Reported {recipRisk}× {recipReason ? `for ${recipReason}` : "in network"}
                      </div>
                      {recipRisk > 3 && (
                        <div style={{display:"inline-flex", alignItems:"center", gap:5,
                          padding:"3px 10px", background:"#450a0a", border:"1px solid #dc2626",
                          borderRadius:20, fontSize:11, fontWeight:700, color:"#fca5a5"}}>
                          🚨 High-risk recipient
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{textAlign:"right", flexShrink:0}}>
                  <div style={{fontWeight:800, fontSize:20, color:"#dc2626"}}>
                    −₹{req.amt.toLocaleString("en-IN")}
                  </div>
                  <div style={{fontSize:11, color:"#94a3b8", marginTop:2}}>will debit your account</div>
                  <div style={{marginTop:6}}>
                    <RiskPill score={totalRisk}/>
                  </div>
                </div>
              </div>

              {/* ── Engine Insights (deduped signals) ── */}
              {signals.length > 0 && req.status === "pending" && (
                <div style={{marginBottom:12}}>
                  <p style={{fontSize:10, fontWeight:800, color:"#94a3b8",
                    textTransform:"uppercase", letterSpacing:.8, marginBottom:7}}>
                    🔍 Engine Insights
                  </p>
                  <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
                    {signals.slice(0,5).map((s, i) => {
                      const isKW = s.startsWith("⚠️") || s.startsWith("🚨");
                      return (
                        <div key={i} style={{
                          display:"flex", alignItems:"flex-start", gap:7,
                          padding:"6px 10px",
                          background: isKW ? "#fff7ed" : m.bg,
                          border:`1px solid ${isKW ? "#fdba74" : m.border}`,
                          borderRadius:9, fontSize:12,
                          color: isKW ? "#92400e" : m.color,
                          fontWeight: isKW ? 600 : 500, lineHeight:1.4,
                          animation:`slideInL .2s ${i*.06}s ease both`
                        }}>
                          <svg width="6" height="6" style={{flexShrink:0, marginTop:4}}>
                            <circle cx="3" cy="3" r="3" fill={isKW ? "#f59e0b" : m.dot}/>
                          </svg>
                          {s}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Why is this risky? (Layer 2: short reasons + Layer 3: tags) ── */}
              {req.status === "pending" && totalRisk >= 60 && (()=>{
                const TAG_STYLE_REQ = (tag) => {
                  const map = {
                    "Reported":    {c:"#dc2626", bg:"#fef2f2", bd:"#fca5a5"},
                    "New":         {c:"#f59e0b", bg:"#fef3c7", bd:"#fcd34d"},
                    "High Amount": {c:"#f97316", bg:"#fff7ed", bd:"#fdba74"},
                    "Large Spend": {c:"#ea580c", bg:"#fff7ed", bd:"#fb923c"},
                    "Odd Hour":    {c:"#7c3aed", bg:"#f5f3ff", bd:"#c4b5fd"},
                    "Off-Network": {c:"#0369a1", bg:"#e0f2fe", bd:"#7dd3fc"},
                  };
                  return map[tag] || {c:"#64748b", bg:"#f8faff", bd:"#e2e8f0"};
                };
                const rr2 = getRecipientRisk(req.fromNum || "");
                const reqReasons = [];
                const reqTags    = [];
                if (rr2 > 0) { reqReasons.push(`Reported by ${rr2} user${rr2>1?"s":""}`); reqTags.push("Reported"); }
                signals.forEach(s => {
                  const sl = s.toLowerCase();
                  if ((sl.includes("new recipient") || sl.includes("not seen in your contacts")) &&
                      !reqReasons.some(r=>r.toLowerCase().includes("new"))) {
                    reqReasons.push("New recipient"); reqTags.push("New");
                  }
                  if ((sl.includes("drain") || sl.includes("large transfer") || sl.includes("higher than your usual") || sl.includes("unusually far outside")) &&
                      !reqReasons.some(r=>r.toLowerCase().includes("amount"))) {
                    reqReasons.push("High amount"); if(!reqTags.includes("High Amount")) reqTags.push("High Amount");
                  }
                  if ((sl.includes("off-network") || sl.includes("outside the upi network")) &&
                      !reqReasons.some(r=>r.toLowerCase().includes("network"))) {
                    reqReasons.push("Off-network account"); if(!reqTags.includes("Off-Network")) reqTags.push("Off-Network");
                  }
                  if ((sl.includes("daily spending") || sl.includes("starting balance") || sl.includes("portion")) &&
                      !reqReasons.some(r=>r.toLowerCase().includes("spend"))) {
                    reqReasons.push("Large spend"); if(!reqTags.includes("Large Spend")) reqTags.push("Large Spend");
                  }
                });
                const dedupedR = [...new Set(reqReasons)];
                const dedupedT = [...new Set(reqTags)];
                if(dedupedR.length === 0) return null;
                return (
                  <div style={{marginBottom:12,padding:"10px 12px",background:"#fff7ed",
                    border:"1.5px solid #fdba74",borderRadius:10,animation:"slideInL .3s ease both"}}>
                    <p style={{fontSize:10,fontWeight:800,color:"#92400e",textTransform:"uppercase",
                      letterSpacing:.6,marginBottom:7}}>🤔 Why is this risky?</p>
                    {dedupedR.map((r,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"flex-start",gap:6,marginBottom:4,
                        fontSize:12,color:"#9a3412",fontWeight:600,lineHeight:1.4}}>
                        <span style={{flexShrink:0}}>⚠</span><span>{r}</span>
                      </div>
                    ))}
                    {dedupedT.length > 0 && (
                      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:8}}>
                        {dedupedT.map((tag,i)=>{
                          const ts = TAG_STYLE_REQ(tag);
                          return(
                            <span key={i} style={{display:"inline-flex",alignItems:"center",gap:4,
                              padding:"2px 9px",borderRadius:14,fontSize:11,fontWeight:700,
                              background:ts.bg,color:ts.c,border:`1.5px solid ${ts.bd}`}}>
                              {tag}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* ── Status / Actions ── */}
            <div style={{padding:"0 20px 18px", marginTop:4}}>
              {req.status !== "pending" ? (
                <div style={{
                  padding:"10px 16px",
                  background: req.status==="paid"?"#dcfce7" : req.status==="declined"?"#f1f5f9" : "#fef2f2",
                  borderRadius:10,
                  color: req.status==="paid"?"#166534" : req.status==="declined"?"#64748b" : "#dc2626",
                  fontWeight:700, fontSize:13, textAlign:"center",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:7
                }}>
                  {req.status==="paid" && <>{Ic.check("#166534")} Paid — debited from your account</>}
                  {req.status==="declined" && <>{Ic.x("#64748b")} Declined</>}
                  {req.status==="reported" && <>{Ic.flag("#dc2626")} Reported as fraud</>}
                </div>
              ) : (
                <div style={{display:"flex", gap:8}}>
                  <Btn onClick={() => acceptReq(req)} style={{flex:1}}>
                    {useOTPLabel ? "Verify with OTP →" : requiresOTP ? "Pay with PIN+OTP" : "Pay with PIN"}
                  </Btn>
                  <Btn onClick={() => declineReq(req.id)} variant="ghost" style={{flex:1}}>Decline</Btn>
                  <Btn onClick={() => openReportModal(req)} variant="danger">
                    {Ic.flag("#dc2626")} Report
                  </Btn>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ═══ HISTORY PAGE ═══ */