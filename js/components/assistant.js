
function SafePayAssistant({onClose, user, txs}){
  const GEMINI_API_KEY = window.APP_CONFIG?.GEMINI_API_KEY || "";

  const savedHistory = (() => {
    try {
      const s = localStorage.getItem(`nexus_history_${user?.number}`);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  })();

  const [messages, setMessages] = useState(savedHistory || [
    { role: 'bot', text: "👋 Hello! I'm Nexus, your AI security assistant. I'm here to help with payment safety and fraud concerns.\n\nYou can ask me about:\n• Why was my account frozen?\n• Why was my payment flagged?\n• What is an OTP scam?\n• Is paying through a link safe?\n• How do I report fraud?\n• How do I freeze my account?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [rateLimitTimer, setRateLimitTimer] = useState(0);
  const messagesEndRef = useRef(null);
  const timerRef = useRef(null);

  const quickReplies = [
    "Is this payment safe?",
    "Explain my risk score",
    "Why was my payment blocked?",
    "Why was my account frozen?",
    "What is an OTP scam?",
    "Is this UPI ID safe?",
    "How do I report fraud?",
    "Safety tips for UPI"
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (messages.length > 1 && user?.number) {
      try {
        localStorage.setItem(`nexus_history_${user.number}`, JSON.stringify(messages.slice(-20)));
      } catch {}
    }
  }, [messages]);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function buildSystemPrompt() {
    const recentTxs = (txs || []).slice(0, 5);
    const txLines = recentTxs.length > 0
      ? recentTxs.map(t =>
          `  - ${t.type==='debit'?'Sent':'Received'} ₹${t.amt?.toLocaleString('en-IN')} ${t.type==='debit'?'to':'from'} "${t.to||t.from}" on ${t.date} at ${t.time} | Risk: ${t.risk??'N/A'} | Status: ${t.status??'completed'}${t.otp_used?' | OTP verified':''}`
        ).join('\n')
      : "  No recent transactions.";

    const freezeLevel = getFreezeLevel(user);
    const freezeLabel = getFreezeLevelLabel(freezeLevel);
    const avgAmt = Math.round(calculateAvgTransaction(user));
    const hvThreshold = Math.round(getHighValueThreshold(user));
    const spentToday = Math.round(getDailySpent(user));

    return `You are Nexus, an AI security assistant inside IronWallet — a UPI payment app.
Help users with UPI safety, fraud detection, scam awareness, and their account status only.
Be concise, warm, and clear. Keep replies under 150 words unless explaining something complex.
NEVER ask for or encourage sharing OTPs, PINs, or passwords.
If asked anything unrelated to payments or fraud, politely redirect.

=== USER PROFILE ===
Name: ${user?.name??'Unknown'}, Age: ${user?.age??'Unknown'}
Balance: ₹${user?.balance?.toLocaleString('en-IN')??'0'}
UPI: ${user?.upi??'N/A'}, Verified: ${user?.verified?'Yes':'No'}
Risk Score: ${user?.risk_score??0}/100
Freeze Level: ${freezeLevel} — ${freezeLabel}
Bypass Attempts: ${user?.bypass_attempts??0}, Blocked Attempts: ${user?.blocked_attempts??0}
Frozen: ${user?.permanent_frozen?'YES Permanent':user?.frozen_until?'YES Temporary':'No'}
Avg Transaction: ₹${avgAmt.toLocaleString('en-IN')}
High Value Threshold: ₹${hvThreshold.toLocaleString('en-IN')}
Spent Today: ₹${spentToday.toLocaleString('en-IN')}

=== LAST 5 TRANSACTIONS ===
${txLines}

=== RISK SYSTEM ===
0-60: Safe | 61-80: Low Risk (warning shown) | 81-94: OTP required | 95+: Blocked

=== FREEZE LEVELS ===
0=Safe | 1=Warning(risk>=60) | 2=Delay(3+blocks) | 3=OTP enforced | 4=Temp frozen | 5=Permanent(visit branch)

=== FRAUD PATTERNS DETECTED BY APP ===
KYC fraud, OTP phishing, fake refunds, govt impersonation (RBI/CBI/UIDAI),
remote access scams (AnyDesk/TeamViewer), micro-payment attacks,
balance drain (>80% in one tx), late night tx (1-5AM), unverified new recipient

=== APP FEATURES ===
Freeze: Profile page → Emergency Lock
Report fraud: History page → Report button on any transaction
Risk score: visible on Dashboard
OTP: auto-triggered for high-risk payments
Helpline: 1800-123-4567 (24x7)
Cybercrime: 1930 or cybercrime.gov.in

Use user's actual data above for personalized answers.`;
  }

  const handleSend = async (msgText) => {
    const text = (msgText ?? input).trim();
    if (!text || loading || rateLimited) return;
    setMessages(prev => [...prev, { role:'user', text }]);
    setInput("");
    setLoading(true);

    const history = messages.slice(1).slice(-10).map(m => ({
      role: m.role==='user' ? 'user' : 'model',
      parts: [{ text: m.text }]
    }));

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
            contents: [...history, { role:"user", parts:[{ text }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 800 }
          })
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err?.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const cleaned = (reply || "Sorry, I couldn't get a response. Please try again.")
        .replace(/\*\*(.*?)\*\*/g,'$1')
        .replace(/\*(.*?)\*/g,'$1')
        .replace(/#{1,3} /g,'')
        .replace(/`(.*?)`/g,'$1')
        .trim();

      setMessages(prev => [...prev, { role:'bot', text: cleaned }]);

    } catch(err) {
      console.error("Nexus error:", err);
      const isRateLimit = err.message?.includes("429") ||
        err.message?.toLowerCase().includes("quota") ||
        err.message?.toLowerCase().includes("exceeded");

      if (isRateLimit) {
        let secs = 60;
        setRateLimited(true);
        setRateLimitTimer(secs);
        timerRef.current = setInterval(() => {
          secs -= 1;
          setRateLimitTimer(secs);
          if (secs <= 0) {
            clearInterval(timerRef.current);
            setRateLimited(false);
            setRateLimitTimer(0);
          }
        }, 1000);
        setMessages(prev => [...prev, { role:'bot',
          text:"⏳ Too many requests right now. Please wait 60 seconds and try again." }]);
      } else {
        setMessages(prev => [...prev, { role:'bot',
          text:`⚠️ Something went wrong: ${err.message||"Please check your connection."}` }]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickReply = (text) => handleSend(text);

  return (
    <Modal>
      <div onClick={onClose} style={{position:"fixed",inset:0,
        background:"rgba(10,25,70,.65)",backdropFilter:"blur(8px)",
        display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:24,
          width:"100%",maxWidth:450,maxHeight:"80vh",
          display:"flex",flexDirection:"column",overflow:"hidden"}}>

          <div style={{background:`linear-gradient(135deg,#0078FF,#0055cc)`,padding:"16px 20px",
            display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:40,height:40,borderRadius:"50%",background:"rgba(255,255,255,.2)",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:900,
                color:"#fff",fontFamily:"'Arial Black','Impact',sans-serif",letterSpacing:"1px"}}>N</div>
              <div>
                <div style={{color:"#fff",fontWeight:800,fontSize:15}}>Nexus</div>
                <div style={{color:"rgba(255,255,255,.7)",fontSize:11}}>
                  {loading?"Thinking...":"AI Security Assistant"}
                </div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {messages.length > 1 && (
                <button onClick={()=>{
                  setMessages([{role:'bot',text:"👋 Hello! I'm Nexus. How can I help you stay safe today?"}]);
                  try{localStorage.removeItem(`nexus_history_${user?.number}`);}catch{}
                }} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",
                  fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:12,cursor:"pointer"}}>
                  Clear
                </button>
              )}
              <button onClick={onClose} style={{background:"none",border:"none",color:"#fff",cursor:"pointer"}}>
                <svg width="20"height="20"viewBox="0 0 24 24"fill="none"stroke="#fff"strokeWidth="2.5">
                  <line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:"12px"}}>
            {messages.map((msg,i) => (
              <div key={i} style={{display:"flex",flexDirection:"column",
                alignItems:msg.role==='user'?'flex-end':'flex-start'}}>
                <div style={{maxWidth:"82%",padding:"10px 14px",
                  borderRadius:msg.role==='user'?'16px 16px 4px 16px':'4px 16px 16px 16px',
                  background:msg.role==='user'?`linear-gradient(135deg,#0078FF,#0055cc)`:'#f1f5f9',
                  color:msg.role==='user'?'#fff':'#0f172a',
                  whiteSpace:"pre-wrap",fontSize:14,lineHeight:1.55}}>
                  {msg.text}
                </div>
                <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>
                  {new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
            ))}

            {messages.length === 1 && (
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:4}}>
                {quickReplies.map((qr,idx) => (
                  <button key={idx} className="quick-reply-btn"
                    onClick={()=>handleQuickReply(qr)}
                    disabled={loading||rateLimited}>{qr}</button>
                ))}
              </div>
            )}

            {loading && (
              <div style={{display:"flex",gap:5,padding:"10px 14px",background:"#f1f5f9",
                borderRadius:"4px 16px 16px 16px",width:"fit-content"}}>
                {[0,0.2,0.4].map((d,i)=>(
                  <div key={i} style={{width:8,height:8,borderRadius:"50%",background:"#94a3b8",
                    animation:`blink 1s infinite ${d}s`}}/>
                ))}
              </div>
            )}
            <div ref={messagesEndRef}/>
          </div>

          {rateLimited && (
            <div style={{textAlign:"center",fontSize:12,color:"#f59e0b",fontWeight:600,
              padding:"6px 16px",background:"#fffbeb",borderTop:"1px solid #fde68a"}}>
              ⏳ Too many requests — wait {rateLimitTimer}s
            </div>
          )}

          <div style={{padding:"12px",borderTop:"1px solid #f1f5f9",display:"flex",gap:8}}>
            <input value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleSend()}
              placeholder={rateLimited?`Wait ${rateLimitTimer}s...`:"Ask about fraud safety..."}
              disabled={rateLimited}
              style={{flex:1,padding:"10px 14px",border:"1.5px solid #e2e8f0",borderRadius:22,
                fontSize:13,outline:"none",fontFamily:"'DM Sans',sans-serif",
                opacity:rateLimited?0.5:1}}/>
            <button onClick={()=>handleSend()}
              disabled={!input.trim()||loading||rateLimited}
              style={{width:40,height:40,borderRadius:"50%",
                background:`linear-gradient(135deg,#0078FF,#0055cc)`,
                border:"none",cursor:(loading||rateLimited)?"not-allowed":"pointer",
                opacity:(loading||rateLimited)?0.5:1,
                display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="16"height="16"viewBox="0 0 24 24"fill="none"stroke="#fff"strokeWidth="2.5">
                <line x1="22"y1="2"x2="11"y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>

        </div>
      </div>
    </Modal>
  );
}

/* ═══ ROOT APP ═══ */