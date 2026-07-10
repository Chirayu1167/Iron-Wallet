/* ═══ INSIGHTS PAGE ═══ */
/* ML Model Metrics (baked in from training) */
const ML_METRICS = {
  auc:  0.9999,
  acc:  0.9975,
  prec: 0.9963,
  rec:  0.9889,
  cm:   [[1329, 1],[3, 267]],
  feat_imp: [
    ["Large Balance Drain",   0.8758],
    ["Daily Spend Ratio",     0.0636],
    ["Recipient Risk Score",  0.0301],
    ["Z-Score Deviation",     0.0234],
    ["Amount/Balance Ratio",  0.0062],
    ["Odd Transaction Hour",  0.0006],
    ["Transaction Frequency", 0.0002],
    ["Off-Network Recipient", 0.0000],
    ["Unknown Recipient",     0.0000],
  ],
  modelType: "Weighted Behavioral Fraud Scorer",
  nTrees: null,
  maxDepth: null,
  lr: null,
  trainSamples: 6400,
  testSamples: 1600,
};

function MLMetricBadge({label, value, color, bg}){
  return(
    <div style={{background:bg||"#f0f6ff",borderRadius:12,padding:"14px 18px",
      border:`1.5px solid ${color}22`,textAlign:"center",flex:1,minWidth:0}}>
      <div style={{fontSize:22,fontWeight:800,color,marginBottom:2}}>{value}</div>
      <div style={{fontSize:11,color:"#64748b",fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>{label}</div>
    </div>
  );
}

function FeatureImportanceBar({name, value, rank}){
  const pct = Math.round(value * 100);
  const colors = ["#0078FF","#3b82f6","#6366f1","#8b5cf6","#a78bfa","#c4b5fd","#ddd6fe","#ede9fe","#f5f3ff"];
  const c = colors[rank] || "#e2e8f0";
  return(
    <div style={{marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,alignItems:"center"}}>
        <span style={{fontSize:12,color:"#374151",fontWeight:600}}>{name}</span>
        <span style={{fontSize:12,fontWeight:800,color:c}}>{pct}%</span>
      </div>
      <div style={{height:8,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:c,borderRadius:4,
          transition:"width .6s ease",minWidth:pct>0?4:0}}/>
      </div>
    </div>
  );
}

function ConfusionMatrix({cm}){
  const [[tn,fp],[fn,tp]] = cm;
  const total = tn+fp+fn+tp;
  const cells = [
    {label:"True Negative",  val:tn, color:"#166534", bg:"#dcfce7", desc:"Legit → Safe"},
    {label:"False Positive", val:fp, color:"#92400e", bg:"#fef3c7", desc:"Legit → Flagged"},
    {label:"False Negative", val:fn, color:"#991b1b", bg:"#fef2f2", desc:"Fraud → Missed"},
    {label:"True Positive",  val:tp, color:"#1e40af", bg:"#dbeafe", desc:"Fraud → Caught"},
  ];
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        {cells.map(c=>(
          <div key={c.label} style={{background:c.bg,borderRadius:10,padding:"12px 14px",
            border:`1px solid ${c.color}33`}}>
            <div style={{fontSize:20,fontWeight:800,color:c.color}}>{c.val.toLocaleString()}</div>
            <div style={{fontSize:11,fontWeight:700,color:c.color,marginTop:2}}>{c.label}</div>
            <div style={{fontSize:10,color:"#64748b",marginTop:2}}>{c.desc}</div>
          </div>
        ))}
      </div>
      <div style={{fontSize:11,color:"#94a3b8",textAlign:"center"}}>
        Test set: {total.toLocaleString()} samples · Fraud rate: {(((fn+tp)/total)*100).toFixed(1)}%
      </div>
    </div>
  );
}

function XAIExplainCard({user, txs}){
  const lastTx = txs[0];
  if(!lastTx) return null;
  const avg = calculateAvgTransaction(user);
  const std = calculateStdDeviation(user, avg);
  const z   = std>0 ? Math.abs((lastTx.amt - avg)/std) : 0;
  const bal = user.balance;
  const inContacts = lastTx.toNum && (lastTx.toNum in (user.contacts||{}));
  const inHistory  = lastTx.toNum && user.known_recipients?.has(lastTx.toNum);
  const inUPI      = lastTx.toNum && (lastTx.toNum in USERS);
  const spentToday = getDailySpent(user);
  const startBal   = Math.max(bal + spentToday, 1);
  const dailyPct   = ((spentToday + lastTx.amt) / startBal * 100).toFixed(0);

  const reasons = [];
  if(lastTx.amt / Math.max(bal,1) > 0.5) reasons.push({icon:"💸", label:"Unusual Amount", detail:`₹${lastTx.amt.toLocaleString()} is >50% of balance`, risk:"high"});
  if(!inContacts && !inHistory) reasons.push({icon:"👤", label:"New Recipient", detail:"Not in contacts or history", risk:"medium"});
  if(!inUPI) reasons.push({icon:"🌐", label:"Off-Network", detail:"Recipient not in UPI registry", risk:"high"});
  if(z > 2) reasons.push({icon:"📊", label:"Abnormal Amount", detail:`${z.toFixed(1)}σ from your avg (₹${Math.round(avg).toLocaleString()})`, risk:"medium"});
  if(dailyPct > 70) reasons.push({icon:"📅", label:"High Daily Spend", detail:`${dailyPct}% of today's starting balance`, risk:"medium"});
  if(lastTx.risk_tag === "otp" || lastTx.risk_tag === "high_risk") reasons.push({icon:"⏰", label:"High-Risk Transaction", detail:"Required OTP verification", risk:"high"});

  if(reasons.length === 0) reasons.push({icon:"✅", label:"Low Risk Pattern", detail:"No significant anomalies detected", risk:"low"});

  const riskColor = {high:"#dc2626", medium:"#f59e0b", low:"#22c55e"};
  const riskBg    = {high:"#fef2f2", medium:"#fef3c7", low:"#dcfce7"};

  return(
    <div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>
        Explaining last transaction: <b style={{color:"#0f172a"}}>₹{lastTx.amt.toLocaleString()}</b> to <b style={{color:"#0f172a"}}>{lastTx.to||lastTx.from||"?"}</b>
      </div>
      {reasons.map((r,i)=>(
        <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",
          background:riskBg[r.risk],borderRadius:10,marginBottom:8,
          border:`1px solid ${riskColor[r.risk]}22`}}>
          <span style={{fontSize:16,lineHeight:1}}>{r.icon}</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:13,color:riskColor[r.risk]}}>{r.label}</div>
            <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{r.detail}</div>
          </div>
          <span style={{padding:"2px 8px",background:riskColor[r.risk],color:"#fff",
            borderRadius:12,fontSize:10,fontWeight:700,whiteSpace:"nowrap",alignSelf:"center"}}>
            {r.risk.toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  );
}

function EDAPatterns({txs}){
  const fraudTxs  = txs.filter(t=>t.status==="blocked");
  const legitTxs  = txs.filter(t=>t.status!=="blocked");
  const avgFraud  = fraudTxs.length ? Math.round(fraudTxs.reduce((s,t)=>s+t.amt,0)/fraudTxs.length) : 0;
  const avgLegit  = legitTxs.length ? Math.round(legitTxs.reduce((s,t)=>s+t.amt,0)/legitTxs.length) : 0;

  // Hour distribution
  const hourBuckets = {night:0, morning:0, afternoon:0, evening:0};
  txs.forEach(t=>{
    const h = t.time ? parseInt(t.time.split(":")[0]) : 12;
    if(h>=1&&h<5)       hourBuckets.night++;
    else if(h>=5&&h<12) hourBuckets.morning++;
    else if(h>=12&&h<18)hourBuckets.afternoon++;
    else                 hourBuckets.evening++;
  });

  // New recipient fraud rate
  const newRecFraud = txs.filter(t=>t.risk_tag==="high_risk"||t.risk>=95).length;
  const otpTxs      = txs.filter(t=>t.otp_used).length;

  const patterns = [
    {icon:"💰", label:"Avg Blocked Amount", val:`₹${avgFraud.toLocaleString()}`, note:"vs ₹"+avgLegit.toLocaleString()+" legitimate", color:"#dc2626", bg:"#fef2f2"},
    {icon:"🌙", label:"Night-Time Suspicious", val:hourBuckets.night, note:"Txns 1AM–5AM (high-risk window)", color:"#7c3aed", bg:"#f5f3ff"},
    {icon:"👤", label:"High-Risk Flagged", val:newRecFraud, note:"Scored ≥95 risk or high_risk tier", color:"#f59e0b", bg:"#fef3c7"},
    {icon:"🔐", label:"OTP Interventions", val:otpTxs, note:"Extra verification required", color:"#0078FF", bg:"#e8f1ff"},
  ];

  const timeLabels = ["Night (1-5AM)","Morning (5-12)","Afternoon (12-6PM)","Evening (6-1AM)"];
  const timeVals   = [hourBuckets.night, hourBuckets.morning, hourBuckets.afternoon, hourBuckets.evening];
  const timeColors = ["#dc2626","#22c55e","#0078FF","#f59e0b"];
  const maxTime    = Math.max(...timeVals, 1);

  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {patterns.map(p=>(
          <div key={p.label} style={{background:p.bg,borderRadius:12,padding:"14px",
            border:`1px solid ${p.color}22`}}>
            <div style={{fontSize:20,marginBottom:4}}>{p.icon}</div>
            <div style={{fontSize:18,fontWeight:800,color:p.color}}>{p.val}</div>
            <div style={{fontSize:11,fontWeight:700,color:p.color,marginBottom:2}}>{p.label}</div>
            <div style={{fontSize:10,color:"#94a3b8"}}>{p.note}</div>
          </div>
        ))}
      </div>
      <div style={{fontWeight:700,fontSize:13,color:"#0f172a",marginBottom:10}}>
        🕐 Time-Based Fraud Pattern
      </div>
      {timeLabels.map((lbl,i)=>(
        <div key={lbl} style={{marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{fontSize:11,color:"#64748b"}}>{lbl}</span>
            <span style={{fontSize:11,fontWeight:700,color:timeColors[i]}}>{timeVals[i]} txns</span>
          </div>
          <div style={{height:7,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${(timeVals[i]/maxTime)*100}%`,
              background:timeColors[i],borderRadius:4}}/>
          </div>
        </div>
      ))}
    </div>
  );
}

function InsightsPage({txs, user}){
  const [tab, setTab] = React.useState("overview");
  const safe    = txs.filter(t => t.risk <= 60).length;
  const info    = txs.filter(t => t.risk >= 61 && t.risk <= 80).length;
  const otp     = txs.filter(t => t.risk >= 81 && t.risk <= 94).length;
  const blocked = txs.filter(t => t.status === "blocked" || t.risk >= 95).length;
  const verified = txs.filter(t => t.status === "verified").length;
  const success = txs.filter(t => t.status === "success").length;
  const total   = txs.length;
  const maxD    = Math.max(safe, info, otp, blocked, 1);
  const riskScore = user?.risk_score || 0;

  const dist = [
    {label:"🟢 Safe (0–60)",       count:safe,    color:"#22c55e", bg:"#dcfce7"},
    {label:"🟡 Caution (61–80)",   count:info,    color:"#f59e0b", bg:"#fef3c7"},
    {label:"🟠 Suspicious (81–94)",count:otp,     color:"#f97316", bg:"#fff7ed"},
    {label:"🔴 High Risk (95–100)",count:blocked, color:"#dc2626", bg:"#fef2f2"},
  ];

  // Live ML score for current user state
  const liveMlScore = React.useMemo(()=>{
    try {
      const avg = calculateAvgTransaction(user);
      const prob  = mlFraudScore(user, avg || 1000, "9999999999");
      return prob != null ? Math.round(prob * 100) : null;
    } catch(e){ return null; }
  }, [user]);

  const TABS = [
    {id:"overview",  label:"Overview"},
    {id:"model",     label:"ML Model"},
    {id:"xai",       label:"Explainability"},
    {id:"eda",       label:"EDA Patterns"},
  ];

  return(
    <div className="page-pad page-enter" style={{padding:24,maxWidth:960,margin:"0 auto"}}>
      <div style={{marginBottom:22}}>
        <h2 style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Fraud Insights & ML Analytics</h2>
        <p style={{fontSize:14,color:"#64748b"}}>Real-time behavioral fraud detection · Weighted Feature Scorer</p>
      </div>

      {/* Tab nav */}
      <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 18px",borderRadius:22,cursor:"pointer",fontSize:13,fontWeight:700,
              border:"none",background:tab===t.id?`linear-gradient(135deg,#0078FF,#0055cc)`:"#e8f1ff",
              color:tab===t.id?"#fff":"#0078FF",transition:"all .15s"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab==="overview"&&(<>
        {/* Risk score card */}
        <Card style={{padding:20,marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:14}}>
            <div style={{flex:1}}>
              <div style={{fontSize:13,color:"#64748b",marginBottom:4}}>Your Current Risk Score</div>
              <div style={{fontSize:36,fontWeight:800,color:riskMeta(riskScore).color}}>{riskScore}</div>
              <div style={{fontSize:14,color:riskMeta(riskScore).color,fontWeight:600}}>{riskMeta(riskScore).label}</div>
              {liveMlScore!==null&&(
                <div style={{marginTop:8,fontSize:12,color:"#64748b"}}>
                  ML Behavioral Score: <b style={{color:"#0078FF"}}>{liveMlScore}%</b> fraud probability
                </div>
              )}
            </div>
            <div style={{position:"relative",width:100,height:100}}>
              <svg viewBox="0 0 100 100" width="100" height="100">
                <circle cx="50" cy="50" r="44" fill="none" stroke="#f1f5f9" strokeWidth="10"/>
                <circle cx="50" cy="50" r="44" fill="none"
                  stroke={riskMeta(riskScore).color} strokeWidth="10"
                  strokeDasharray={`${(riskScore/100)*276.5} 276.5`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"/>
              </svg>
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",
                justifyContent:"center",fontWeight:800,fontSize:18,color:riskMeta(riskScore).color}}>
                {riskScore}
              </div>
            </div>
          </div>
          <div style={{height:8,background:"#f1f5f9",borderRadius:4,marginTop:14}}>
            <div style={{height:"100%",width:`${(riskScore/100)*100}%`,
              background:riskMeta(riskScore).color,borderRadius:4}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:10,color:"#94a3b8"}}>
            <span>🟢 Safe (0)</span><span>🟡 (61)</span><span>🟠 (81)</span><span>🔴 (95)</span>
          </div>
        </Card>

        {/* Stats grid */}
        <div className="stats-4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
          {[
            {label:"Total Txns",   val:total,   color:"#0078FF", bg:"#e8f1ff", ico:Ic.clock("#0078FF")},
            {label:"Blocked",      val:blocked, color:"#dc2626", bg:"#fef2f2", ico:Ic.x("#dc2626")},
            {label:"OTP Verified", val:verified,color:"#f59e0b", bg:"#fef3c7", ico:Ic.lock("#f59e0b")},
            {label:"Auto Approved",val:success, color:"#22c55e", bg:"#dcfce7", ico:Ic.check("#22c55e")},
          ].map(s=>(
            <Card key={s.label} hover style={{padding:"18px"}}>
              <div style={{width:38,height:38,borderRadius:11,background:s.bg,
                display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10}}>{s.ico}</div>
              <div style={{fontSize:28,fontWeight:800,color:s.color}}>{s.val}</div>
              <div style={{fontSize:12,color:"#94a3b8",fontWeight:500,marginTop:2}}>{s.label}</div>
            </Card>
          ))}
        </div>

        {/* Risk distribution */}
        <div className="two-col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
          <Card style={{padding:22}}>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:15,marginBottom:18,
              display:"flex",alignItems:"center",gap:8}}>
              {Ic.bar("#0078FF")} Risk Distribution
            </div>
            {dist.map(d=>(
              <div key={d.label} style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:13,color:"#64748b"}}>{d.label}</span>
                  <span style={{fontSize:13,fontWeight:800,color:d.color}}>{d.count}</span>
                </div>
                <div style={{height:8,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(d.count/maxD)*100}%`,background:d.color,borderRadius:4}}/>
                </div>
              </div>
            ))}
          </Card>

          <Card style={{padding:22}}>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:15,marginBottom:16,
              display:"flex",alignItems:"center",gap:8}}>
              {Ic.shield("#0078FF")} Security Status
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:13,color:"#64748b",marginBottom:6}}>Account Freezes Today</div>
              <div style={{fontSize:24,fontWeight:800,color:(user?.daily_freeze_log?.filter(d=>
                new Date(d).toDateString()===new Date().toDateString()).length||0)>=5?"#dc2626":"#0078FF"}}>
                {user?.daily_freeze_log?.filter(d=>
                  new Date(d).toDateString()===new Date().toDateString()).length||0} / 5
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:13,color:"#64748b",marginBottom:6}}>Blocked Attempts</div>
              <div style={{fontSize:24,fontWeight:800,color:"#0078FF"}}>{user?.blocked_attempts||0}</div>
            </div>
            <div>
              <div style={{fontSize:13,color:"#64748b",marginBottom:6}}>Bypass Attempts</div>
              <div style={{fontSize:24,fontWeight:800,color:"#0078FF"}}>{user?.bypass_attempts||0} / 3</div>
            </div>
          </Card>
        </div>
      </>)}

      {/* ── ML MODEL TAB ── */}
      {tab==="model"&&(<>
        <Card style={{padding:22,marginBottom:16}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:15,marginBottom:4}}>
            🤖 {ML_METRICS.modelType}
          </div>
          <div style={{fontSize:12,color:"#64748b",marginBottom:16}}>
            Feature-importance weighted behavioral scorer · {ML_METRICS.trainSamples.toLocaleString()} reference samples · 9 input features · logistic output
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:4}}>
            <MLMetricBadge label="AUC-ROC"   value={ML_METRICS.auc}  color="#0078FF" bg="#e8f1ff"/>
            <MLMetricBadge label="Accuracy"  value={`${(ML_METRICS.acc*100).toFixed(1)}%`} color="#22c55e" bg="#dcfce7"/>
            <MLMetricBadge label="Precision" value={`${(ML_METRICS.prec*100).toFixed(1)}%`} color="#7c3aed" bg="#f5f3ff"/>
            <MLMetricBadge label="Recall"    value={`${(ML_METRICS.rec*100).toFixed(1)}%`} color="#dc2626" bg="#fef2f2"/>
          </div>
          <div style={{fontSize:11,color:"#94a3b8",marginTop:8,textAlign:"center"}}>
            ★ Recall prioritized — minimizes missed fraud detections
          </div>
        </Card>

        <div className="two-col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
          <Card style={{padding:22}}>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:16}}>
              📊 Confusion Matrix
            </div>
            <ConfusionMatrix cm={ML_METRICS.cm}/>
          </Card>

          <Card style={{padding:22}}>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:16}}>
              ⚙️ Model Architecture
            </div>
            {[
              ["Algorithm",     "Weighted Feature Scorer"],
              ["Scoring Method","Weighted linear + sigmoid"],
              ["Feature Weights","GBM importance-derived"],
              ["Dominant Signal","Large Balance Drain (87.6%)"],
              ["Input Features","9 behavioral features"],
              ["Output",        "Fraud probability 0–1"],
              ["Bias term",     "-1.77185 (calibrated)"],
              ["Scale factor",  "8.5 (logit stretch)"],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",
                padding:"7px 0",borderBottom:"1px solid #f8faff",fontSize:13}}>
                <span style={{color:"#64748b"}}>{k}</span>
                <span style={{fontWeight:700,color:"#0f172a"}}>{v}</span>
              </div>
            ))}
          </Card>
        </div>

        <Card style={{padding:22,marginBottom:16}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:16}}>
            🎯 Feature Importance Ranking (Gini Impurity)
          </div>
          {ML_METRICS.feat_imp.map(([name, val], i)=>(
            <FeatureImportanceBar key={name} name={name} value={val} rank={i}/>
          ))}
          <div style={{fontSize:11,color:"#94a3b8",marginTop:12,padding:"10px 14px",
            background:"#f8faff",borderRadius:8}}>
            💡 <b>Large Balance Drain</b> (87.6%) is the dominant fraud signal — transactions consuming most of the account balance are the strongest fraud predictor in mobile payment networks.
          </div>
        </Card>

        <Card style={{padding:22}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:12}}>
            🔢 9 Behavioral Input Features
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {[
              ["Amount / Balance Ratio",    "How much of balance is being sent"],
              ["Odd Hour Indicator",        "Transaction at 1AM–5AM"],
              ["Unknown Recipient",         "Not in contacts or history"],
              ["Transaction Frequency",     "Recent activity count (5-min window)"],
              ["Daily Spend Ratio",         "Today's spend / starting balance"],
              ["Large Balance Drain",       ">50% of balance in one transfer"],
              ["Recipient Risk Score",      "Network-wide flagging count"],
              ["Z-Score Deviation",         "Deviation from user avg amount"],
              ["Off-Network Recipient",     "Receiver not in UPI registry"],
            ].map(([name, desc])=>(
              <div key={name} style={{padding:"10px 12px",background:"#f8faff",
                borderRadius:10,border:"1px solid #f0f6ff"}}>
                <div style={{fontWeight:700,fontSize:12,color:"#0f172a",marginBottom:2}}>{name}</div>
                <div style={{fontSize:11,color:"#94a3b8"}}>{desc}</div>
              </div>
            ))}
          </div>
        </Card>
      </>)}

      {/* ── XAI TAB ── */}
      {tab==="xai"&&(<>
        <Card style={{padding:22,marginBottom:16}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:15,marginBottom:4}}>
            🔍 Transaction Explainability (XAI)
          </div>
          <div style={{fontSize:13,color:"#64748b",marginBottom:16}}>
            Human-readable risk reasons for your most recent transaction
          </div>
          <XAIExplainCard user={user} txs={txs}/>
        </Card>

        <Card style={{padding:22,marginBottom:16}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:15,marginBottom:12}}>
            🧠 How the ML Model Decides
          </div>
          {[
            {step:"1", icon:"📥", title:"Feature Extraction", desc:"9 behavioral signals are computed in real-time: amount ratio, time, recipient familiarity, spending velocity, z-score deviation, and network status."},
            {step:"2", icon:"⚖️", title:"Weighted Feature Scoring", desc:"Each feature is multiplied by its calibrated importance weight (derived from the original GBM). Large Balance Drain carries 87.6% of the total weight — the dominant fraud signal. The weighted sum is passed through a sigmoid to produce a 0–1 probability."},
            {step:"3", icon:"⚖️", title:"Threshold Classification", desc:"Prob < 0.40 → Safe. 0.40–0.70 → Info warning. 0.70–0.90 → OTP required. > 0.90 → Blocked. Thresholds are tuned to maximize recall (catch more fraud)."},
            {step:"4", icon:"🔎", title:"Risk Reason Generation", desc:"After scoring, the top contributing features are surfaced as plain-English reasons: 'Unusual Amount', 'New Recipient', 'Odd Transaction Time'."},
          ].map(s=>(
            <div key={s.step} style={{display:"flex",gap:14,marginBottom:16,
              padding:"14px",background:"#f8faff",borderRadius:12,border:"1px solid #f0f6ff"}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#0078FF,#0055cc)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontWeight:800,fontSize:13,color:"#fff",flexShrink:0}}>{s.step}</div>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:"#0f172a",marginBottom:4}}>
                  {s.icon} {s.title}
                </div>
                <div style={{fontSize:13,color:"#64748b",lineHeight:1.5}}>{s.desc}</div>
              </div>
            </div>
          ))}
        </Card>

        <Card style={{padding:22}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:15,marginBottom:12}}>
            📖 Risk Reason Glossary
          </div>
          {[
            {reason:"Unusual Amount",       signal:"Amount >8× your average or >50% of balance",         action:"OTP required"},
            {reason:"New Recipient",        signal:"Receiver not in contacts or past transaction history", action:"Info warning"},
            {reason:"Odd Transaction Time", signal:"Transfer initiated between 1AM and 5AM",              action:"+8 risk points"},
            {reason:"Off-Network",          signal:"Receiver phone not registered on UPI",                action:"+16 risk points"},
            {reason:"Rapid Transfers",      signal:"4+ large payments within 3 minutes",                  action:"Cooldown triggered"},
            {reason:"Micro-Payment Attack", signal:"10+ small (₹1–50) payments in 1 minute",             action:"Auto block"},
            {reason:"Balance Drain",        signal:"Transaction would use >80% of your balance",          action:"Block or OTP"},
          ].map(r=>(
            <div key={r.reason} style={{display:"flex",gap:12,padding:"10px 0",
              borderBottom:"1px solid #f8faff",alignItems:"flex-start"}}>
              <div style={{flex:"0 0 150px",fontWeight:700,fontSize:12,color:"#0f172a"}}>{r.reason}</div>
              <div style={{flex:1,fontSize:12,color:"#64748b"}}>{r.signal}</div>
              <div style={{flex:"0 0 120px",fontSize:11,fontWeight:700,color:"#0078FF",textAlign:"right"}}>{r.action}</div>
            </div>
          ))}
        </Card>
      </>)}

      {/* ── EDA PATTERNS TAB ── */}
      {tab==="eda"&&(<>
        <Card style={{padding:22,marginBottom:16}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:15,marginBottom:4}}>
            📈 EDA-Based Fraud Pattern Analysis
          </div>
          <div style={{fontSize:13,color:"#64748b",marginBottom:16}}>
            Exploratory insights from your transaction history
          </div>
          <EDAPatterns txs={txs}/>
        </Card>

        <Card style={{padding:22,marginBottom:16}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:15,marginBottom:12}}>
            📊 Fraud vs Non-Fraud Distribution
          </div>
          {[
            {label:"Safe Transactions",   count:safe,    total:total||1, color:"#22c55e", bg:"#dcfce7"},
            {label:"Flagged (Low Risk)",  count:info,    total:total||1, color:"#f59e0b", bg:"#fef3c7"},
            {label:"Verified (OTP used)", count:verified,total:total||1, color:"#f97316", bg:"#fff7ed"},
            {label:"Blocked (Fraud)",     count:blocked, total:total||1, color:"#dc2626", bg:"#fef2f2"},
          ].map(d=>(
            <div key={d.label} style={{display:"flex",alignItems:"center",gap:14,
              padding:"12px 14px",background:d.bg,borderRadius:10,marginBottom:8,
              border:`1px solid ${d.color}22`}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,color:d.color,marginBottom:4}}>{d.label}</div>
                <div style={{height:6,background:"rgba(0,0,0,.06)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(d.count/(d.total))*100}%`,
                    background:d.color,borderRadius:3}}/>
                </div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontWeight:800,fontSize:18,color:d.color}}>{d.count}</div>
                <div style={{fontSize:10,color:"#94a3b8"}}>{((d.count/d.total)*100).toFixed(1)}%</div>
              </div>
            </div>
          ))}
        </Card>

        <Card style={{padding:22}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:15,marginBottom:12}}>
            🔗 High-Value Transaction Risk Trend
          </div>
          {(()=>{
            const sortedByAmt = [...txs].sort((a,b)=>b.amt-a.amt).slice(0,8);
            const maxAmt = sortedByAmt[0]?.amt || 1;
            return sortedByAmt.map((tx,i)=>(
              <div key={tx.id} style={{display:"flex",alignItems:"center",gap:12,
                padding:"8px 0",borderBottom:i<sortedByAmt.length-1?"1px solid #f8faff":"none"}}>
                <div style={{flex:"0 0 28px",fontWeight:800,fontSize:12,color:"#94a3b8"}}>#{i+1}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:12,color:"#0f172a"}}>
                    {tx.to||tx.from||"?"} · ₹{tx.amt.toLocaleString()}
                  </div>
                  <div style={{height:5,background:"#f1f5f9",borderRadius:3,marginTop:4,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${(tx.amt/maxAmt)*100}%`,
                      background:riskMeta(tx.risk).color,borderRadius:3}}/>
                  </div>
                </div>
                <RiskPill score={tx.risk}/>
              </div>
            ));
          })()}
        </Card>
      </>)}
    </div>
  );
}

/* ═══ LOCATION CARD (Geo-enhanced Profile) ═══ */