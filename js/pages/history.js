/* ═══ HISTORY PAGE ═══ */
function HistoryPage({txs, user, tickets, createTicket}){
  const [filter, setFilter] = useState("all");
  const [reportIssueTx, setReportIssueTx] = useState(null); // tx to report
  const [toast, setToast] = useState("");

  function showToastMsg(msg){ setToast(msg); setTimeout(()=>setToast(""),4000); }

  const filtered = txs.filter(t => {
    if (filter === "credit") return t.type === "credit";
    if (filter === "debit") return t.type === "debit";
    if (filter === "flagged") return t.risk >= 40;
    if (filter === "blocked") return t.status === "blocked";
    if (filter === "otp") return t.otp_used;
    return true;
  });

  return(
    <div className="page-pad page-enter" style={{padding:"24px 24px",maxWidth:"1400px",margin:"0 auto"}}>
      {toast && <div className="pt-toast">{toast}</div>}
      {reportIssueTx && (
        <ReportIssueModal
          tx={reportIssueTx}
          user={user}
          onClose={() => setReportIssueTx(null)}
          onSubmit={(reason, note, ticketId) => {
            const id = createTicket(reportIssueTx, reason, note, user, ticketId);
            setReportIssueTx(null);
            showToastMsg(`Complaint registered – Ref ID: ${id}`);
          }}
        />
      )}
      <div style={{marginBottom:20}}>
        <h2 style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Transaction History</h2>
        <p style={{fontSize:14,color:"#64748b"}}>{txs.length} total transactions</p>
      </div>
      
      <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
        {["all","debit","credit","flagged","blocked","otp"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{padding:"7px 18px",borderRadius:24,cursor:"pointer",fontSize:13,fontWeight:700,
              border:"none",background:filter===f?`linear-gradient(135deg,#0078FF,#0055cc)`:"#e8f1ff",
              color:filter===f?"#fff":"#0078FF"}}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      
      <Card style={{overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#f8faff"}}>
                {["Date","Recipient / Sender","Amount","Note","Location","OTP","Status","Actions"].map(h => (
                  <th key={h} style={{padding:"13px 16px",color:"#94a3b8",fontSize:11,fontWeight:800,
                    textAlign:"left",whiteSpace:"nowrap",borderBottom:"1px solid #f0f6ff"}}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 && (
                <tr><td colSpan={8} style={{padding:"40px",textAlign:"center",color:"#94a3b8"}}>No transactions found.</td></tr>
              )}
              {filtered.map((tx,i) => {
                const m = riskMeta(tx.risk);
                const hasTicket = tickets && tickets.some(t => t.transaction_id === tx.id);
                const recRisk = getRecipientRisk(tx.toNum || "");
                return (
                  <tr key={tx.id} style={{borderBottom:i<filtered.length-1?"1px solid #f8faff":"none"}}>
                    <td style={{padding:"13px 16px",whiteSpace:"nowrap"}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{tx.date}</div>
                      <div style={{fontSize:11,color:"#94a3b8"}}>{tx.time}</div>
                    </td>
                    <td style={{padding:"13px 16px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <Avatar name={tx.to||tx.from||"?"} size={32}/>
                        <div>
                          <div style={{fontSize:14,fontWeight:600,color:"#0f172a"}}>{tx.to||tx.from}</div>
                          <div style={{fontSize:11,color:"#94a3b8"}}>{tx.upi}</div>
                          {recRisk >= 1 && (
                            <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
                              <span style={{fontSize:10,fontWeight:700,color:"#dc2626",background:"#fef2f2",
                                border:"1px solid #fecaca",borderRadius:8,padding:"1px 7px",display:"inline-block"}}>
                                ⚠ Reported {recRisk}×
                              </span>
                              {recRisk > 3 && (
                                <span style={{fontSize:10,fontWeight:700,color:"#fca5a5",background:"#450a0a",
                                  border:"1px solid #dc2626",borderRadius:8,padding:"1px 7px",display:"inline-block"}}>
                                  🚨 High-risk
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{padding:"13px 16px",whiteSpace:"nowrap",fontSize:15,fontWeight:800,
                      color:tx.type==="credit"?"#166534":tx.status==="blocked"?"#dc2626":"#0f172a"}}>
                      {tx.type==="credit"?"+":"-"}₹{tx.amt.toLocaleString("en-IN")}
                    </td>
                    <td style={{padding:"13px 16px",fontSize:13,color:"#64748b"}}>{tx.note}</td>
                    <td style={{padding:"13px 16px",fontSize:12,color:"#64748b"}}>
                      {tx.location ? (
                        <span style={{fontWeight:600}}>📍 {tx.location}</span>
                      ) : (
                        <span style={{color:"#cbd5e1"}}>—</span>
                      )}
                    </td>
                    <td style={{padding:"13px 16px"}}>
                      {tx.otp_used ? (
                        <span style={{color:"#0078FF",fontWeight:700}}>✓ OTP</span>
                      ) : (
                        <span style={{color:"#94a3b8"}}>—</span>
                      )}
                    </td>
                    <td style={{padding:"13px 16px"}}>
                      <span style={{padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:700,
                        background:tx.status==="success"?"#dcfce7":tx.status==="blocked"?"#fef2f2":"#fef3c7",
                        color:tx.status==="success"?"#166534":tx.status==="blocked"?"#dc2626":"#92400e",
                        display:"inline-flex",alignItems:"center",gap:5}}>
                        {tx.status==="success"?Ic.check("#166534"):tx.status==="blocked"?Ic.x("#dc2626"):Ic.lock("#92400e")}
                        {tx.status==="success"?"Success":tx.status==="blocked"?"Blocked":"Verified"}
                      </span>
                    </td>
                    <td style={{padding:"13px 16px"}}>
                      {tx.type==="debit" && (
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          <ReportRecipientBtn tx={tx} user={user}/>
                          {hasTicket ? (
                            <span style={{fontSize:11,color:"#166534",fontWeight:700,background:"#dcfce7",
                              border:"1px solid #86efac",borderRadius:8,padding:"4px 10px",display:"inline-block"}}>
                              ✓ Dispute Filed
                            </span>
                          ) : (
                            <button onClick={() => setReportIssueTx(tx)}
                              style={{fontSize:11,color:"#15803d",background:"#dcfce7",border:"1px solid #86efac",
                                borderRadius:8,padding:"4px 10px",cursor:"pointer",fontWeight:700,
                                fontFamily:"'DM Sans',sans-serif",display:"inline-flex",alignItems:"center",gap:4}}>
                              Request Refund
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ═══ INSIGHTS PAGE ═══ */