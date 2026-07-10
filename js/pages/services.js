/* ═══ SAFEPAY ASSISTANT with Quick Reply Buttons ═══ */

// ===== TOAST NOTIFICATION =====
function useToast(){
  const[toast,setToast]=useState(null);
  function showToast(msg,ms=2500){
    setToast(msg);
    setTimeout(()=>setToast(null),ms);
  }
  const ToastEl=toast?(
    <div className="pt-toast">{toast}</div>
  ):null;
  return{showToast,ToastEl};
}


// ===== SMART GUARD GAME =====
function SmartGuardGame({onComplete}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const POOL = [
    // Scam or Legit - 5 questions
    { id: 1, type: 'scamlegit', question: 'You receive an SMS: "Your bank account will be frozen. Click here to verify your details immediately."', options: ['Scam', 'Legit'], correctAnswer: 0 },
    { id: 2, type: 'scamlegit', question: 'Your UPI app shows a notification: "Welcome! Tap to claim ₹500 cashback. No verification needed."', options: ['Scam', 'Legit'], correctAnswer: 0 },
    { id: 3, type: 'scamlegit', question: 'You get a call from your bank asking for your full ATM pin to unblock your card.', options: ['Scam', 'Legit'], correctAnswer: 0 },
    { id: 4, type: 'scamlegit', question: 'An email from your bank says: "Update your KYC now or your account will be suspended."', options: ['Scam', 'Legit'], correctAnswer: 0 },
    { id: 5, type: 'scamlegit', question: 'You win a lottery message saying you can withdraw ₹10,000 by paying ₹500 processing fee.', options: ['Scam', 'Legit'], correctAnswer: 0 },
    // Spot the Red Flag - 5 questions
    { id: 6, type: 'redflag', question: 'A stranger sends you ₹500 on UPI and calls: "I made a mistake, please return it to this number."', options: ['Safe', 'Red Flag'], correctAnswer: 1 },
    { id: 7, type: 'redflag', question: 'A "bank executive" calls and says your Aadhaar is linked to illegal activities and asks for OTP.', options: ['Safe', 'Red Flag'], correctAnswer: 1 },
    { id: 8, type: 'redflag', question: 'Your friend asks you to transfer ₹2000 via UPI as they are stuck without cash.', options: ['Safe', 'Red Flag'], correctAnswer: 0 },
    { id: 9, type: 'redflag', question: 'A website promises 50% cashback on first recharge if you enter your UPI PIN on their page.', options: ['Red Flag', 'Safe'], correctAnswer: 0 },
    { id: 10, type: 'redflag', question: 'You receive a link to track your delivery, it asks for your card number to confirm.', options: ['Red Flag', 'Safe'], correctAnswer: 0 },
    // Escape Room - 5 questions
    { id: 11, type: 'escape', question: 'You accidentally tap an unknown UPI link. What do you do first?', options: ['Enter your details', 'Close the app', 'Tell a family member', 'Call the police'], correctAnswer: 2 },
    { id: 12, type: 'escape', question: 'Your bank calls asking for UPI PIN. What should you do?', options: ['Give the PIN', 'Hang up and call bank official number', 'Ask them to verify first', 'Ignore the call'], correctAnswer: 1 },
    { id: 13, type: 'escape', question: 'You see ₹5000 credited by mistake. The sender asks for it back. What do you do?', options: ['Ignore', 'Transfer immediately', 'Report to bank', 'Block them'], correctAnswer: 2 },
    { id: 14, type: 'escape', question: 'OTP for a transaction you did not initiate arrives. What next?', options: ['Share with caller', 'Enter on unknown app', 'Delete and ignore', 'Tell everyone'], correctAnswer: 2 },
    { id: 15, type: 'escape', question: 'Someone creates a fake ID of you on social media. What should you do first?', options: ['Create fake ID of them', 'Report to cyber crime', 'Ignore it', 'Hack their account'], correctAnswer: 1 },
  ];

  const questions = useMemo(() => {
    function shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    return shuffle(POOL).slice(0, 5);
  }, []);

  function handleSelect(idx) {
    if (selected !== null) return;
    setSelected(idx);
    setShowResult(true);
    if (idx === questions[currentIdx].correctAnswer) {
      setCorrectCount(c => c + 1);
    }
  }

  function handleNext() {
    if (currentIdx < 4) {
      setCurrentIdx(currentIdx + 1);
      setSelected(null);
      setShowResult(false);
    } else {
      // Game finished - save coins to localStorage
      const earned = correctCount * 5;
      const coins = parseInt(localStorage.getItem('coins') || '0');
      localStorage.setItem('coins', coins + earned);
      localStorage.setItem('lastPlayedDate', new Date().toDateString());
      setGameOver(true);
    }
  }

  function handleFinish() {
    onComplete();
  }

  if (gameOver) {
    const earned = correctCount * 5;
    return (
      <Modal>
        <div style={{ background: '#fff', borderRadius: 24, padding: 32, maxWidth: 360, width: '90vw', textAlign: 'center', animation: 'scaleIn .3s ease' }}>
          <div style={{ width: 72, height: 72, borderRadius: 22, background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', boxShadow: '0 8px 24px rgba(139,92,246,.35)' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h3 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Game Completed!</h3>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 20, lineHeight: 1.5 }}>Great job testing your fraud detection skills!</p>
          <div style={{ background: '#f0f6ff', borderRadius: 16, padding: '18px', marginBottom: 14 }}>
            <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Total Correct Answers</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{correctCount} out of 5</div>
          </div>
          <div style={{ background: '#dcfce7', borderRadius: 16, padding: '18px', marginBottom: 22 }}>
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Coins Earned</div>
            <div style={{ fontSize: 38, fontWeight: 800, color: '#0078FF' }}>🪙 {earned}</div>
          </div>
          <button onClick={handleFinish} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg,#0078FF,#0055cc)', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", boxShadow: '0 6px 20px rgba(0,120,255,.3)' }}>
            Back to Dashboard
          </button>
        </div>
      </Modal>
    );
  }

  const q = questions[currentIdx];
  const typeLabel = q.type === 'scamlegit' ? 'Scam or Legit' : q.type === 'redflag' ? 'Red Flag' : 'Escape Room';
  return (
    <Modal>
      <div style={{ background: '#fff', borderRadius: 24, padding: 28, maxWidth: 420, width: '90vw', animation: 'scaleIn .3s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0078FF', background: '#e8f1ff', padding: '4px 12px', borderRadius: 20 }}>
            Question {currentIdx + 1} of 5
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6', background: '#f5f3ff', padding: '4px 10px', borderRadius: 20 }}>
            {typeLabel}
          </span>
        </div>
        <div style={{ background: '#f8faff', borderRadius: 14, padding: '16px', marginBottom: 20 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', lineHeight: 1.5 }}>{q.question}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {q.options.map((opt, i) => {
            let bg = '#f0f6ff';
            let bd = '#dbeafe';
            let color = '#0f172a';
            let cursor = 'pointer';
            if (showResult) {
              if (i === q.correctAnswer) { bg = '#dcfce7'; bd = '#86efac'; color = '#166534'; }
              else if (i === selected && i !== q.correctAnswer) { bg = '#fef2f2'; bd = '#fca5a5'; color = '#dc2626'; }
              cursor = 'default';
            } else if (selected === i) {
              bg = '#e8f1ff'; bd = '#0078FF';
            }
            return (
              <button key={i} onClick={() => handleSelect(i)} disabled={selected !== null}
                style={{ padding: '14px 16px', background: bg, border: `2px solid ${bd}`, borderRadius: 14, fontSize: 14, fontWeight: 600, color, cursor, fontFamily: "'DM Sans',sans-serif", textAlign: 'left', transition: 'all .2s' }}>
                {opt}
              </button>
            );
          })}
        </div>
        {showResult && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleNext} style={{ padding: '10px 24px', background: '#0078FF', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", boxShadow: '0 4px 14px rgba(0,120,255,.3)' }}>
              {currentIdx < 4 ? 'Next →' : 'See Results'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ===== REDEEM REWARDS =====
function RedeemRewards({coins, onClose}) {
  const rewards = [
    { cost: 75, label: 'Nykaa Voucher', icon: '💄', desc: 'Flat ₹75 off on beauty & skincare' },
    { cost: 80, label: 'boAt Voucher', icon: '🎧', desc: '₹80 off on audio & wearables' },
    { cost: 100, label: 'Amazon Voucher', icon: '📦', desc: '₹100 off on any order' },
    { cost: 95, label: 'Flipkart Voucher', icon: '🛒', desc: '₹95 off on fashion & electronics' },
    { cost: 85, label: 'Swiggy Voucher', icon: '🍔', desc: '₹85 off on food delivery' },
    { cost: 85, label: 'Zomato Voucher', icon: '🍕', desc: '₹85 off on restaurant orders' },
    { cost: 90, label: 'Uber Ride Coupon', icon: '🚗', desc: '₹90 off on your next ride' },
    { cost: 120, label: 'MakeMyTrip Voucher', icon: '✈️', desc: '₹120 off on flight bookings' },
    { cost: 110, label: 'BookMyShow Ticket', icon: '🎬', desc: '₹110 off on movie tickets' },
    { cost: 70, label: 'Reliance Smart Coupon', icon: '🛍️', desc: '₹70 off at Reliance Smart stores' },
  ];

  function handleRedeem(r, label) {
    if (coins < r.cost) {
      alert('Not enough coins! Keep playing to earn more.');
      return;
    }
    const newCoins = coins - r.cost;
    localStorage.setItem('coins', newCoins);
    alert(`🎉 Congratulations! You redeemed ${r.label}. Enjoy!`);
    onClose();
  }

  return (
    <Modal>
      <div style={{ background: '#fff', borderRadius: 24, padding: 28, maxWidth: 380, width: '90vw', animation: 'scaleIn .3s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Redeem Rewards</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>
        <div style={{ background: '#f0f6ff', borderRadius: 14, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🪙</span>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Your Coins</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0078FF' }}>{coins}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
          {rewards.map(r => (
            <div key={r.cost + r.label} style={{ padding: '14px', background: coins >= r.cost ? '#f8faff' : '#fef2f2', border: `1.5px solid ${coins >= r.cost ? '#dbeafe' : '#fecaca'}`, borderRadius: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: coins >= r.cost ? '#e8f1ff' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{r.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{r.label}</div>
                <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.3 }}>{r.desc}</div>
              </div>
              <button onClick={() => handleRedeem(r, r.label)} disabled={coins < r.cost} style={{ padding: '7px 12px', background: coins >= r.cost ? 'linear-gradient(135deg,#0078FF,#0055cc)' : '#94a3b8', color: '#fff', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: coins >= r.cost ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans',sans-serif", whiteSpace: 'nowrap' }}>
                {r.cost} 🪙
              </button>
            </div>
          ))}
        </div>
        {coins < 70 && (
          <div style={{ marginTop: 16, padding: '12px', background: '#fef3c7', borderRadius: 12, textAlign: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>Not enough coins — play Learn & Play to earn more!</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ===== FEATURE 5: SERVICES GRID =====
function ServicesGrid({setPage}){
  const{showToast,ToastEl}=useToast();
  const primary=[
    {icon:<svg width="22"height="22"viewBox="0 0 24 24"fill="none"stroke="#0078FF"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12"cy="13"r="4"/></svg>,label:"Scan & Pay",color:"#0078FF"},
    {icon:<svg width="22"height="22"viewBox="0 0 24 24"fill="none"stroke="#7c3aed"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16"y1="13"x2="8"y2="13"/><line x1="16"y1="17"x2="8"y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,label:"Pay Bills",color:"#7c3aed"},
    {icon:<svg width="22"height="22"viewBox="0 0 24 24"fill="none"stroke="#22c55e"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><rect x="5"y="2"width="14"height="20"rx="2"ry="2"/><line x1="12"y1="18"x2="12.01"y2="18"/></svg>,label:"Recharge",color:"#22c55e"},
    {icon:<svg width="22"height="22"viewBox="0 0 24 24"fill="none"stroke="#f59e0b"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,label:"Electricity",color:"#f59e0b"},
    {icon:<svg width="22"height="22"viewBox="0 0 24 24"fill="none"stroke="#06b6d4"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M12 2a10 10 0 0 1 0 20 10 10 0 0 1 0-20z"/><path d="M12 8v4l3 3"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>,label:"Water Bill",color:"#06b6d4"},
    {icon:<svg width="22"height="22"viewBox="0 0 24 24"fill="none"stroke="#0ea5e9"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M1 6l5.5 5.5L12 6l5.5 5.5L23 6"/><path d="M1 12l5.5 5.5L12 12l5.5 5.5L23 12"/></svg>,label:"DTH",color:"#0ea5e9"},
    {icon:<svg width="22"height="22"viewBox="0 0 24 24"fill="none"stroke="#0078FF"strokeWidth="2"strokeLinecap="round" strokeLinejoin="round"><line x1="12"y1="20"x2="12"y2="10"/><line x1="18"y1="20"x2="18"y2="4"/><line x1="6"y1="20"x2="6"y2="16"/></svg>,label:"Invest",color:"#0078FF"},
    {icon:<svg width="22"height="22"viewBox="0 0 24 24"fill="none"stroke="#6366f1"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,label:"Insurance",color:"#6366f1"},
  ];
  const secondary=[
    {icon:<svg width="22"height="22"viewBox="0 0 24 24"fill="none"stroke="#f97316"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M3 17l2-8h14l2 8H3z"/><path d="M8 17v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2"/><circle cx="7"cy="9"r="1"/><circle cx="17"cy="9"r="1"/></svg>,label:"Train",color:"#f97316"},
    {icon:<svg width="22"height="22"viewBox="0 0 24 24"fill="none"stroke="#10b981"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2"y="7"width="20"height="5"/><line x1="12"y1="22"x2="12"y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>,label:"Gift Cards",color:"#10b981"},
    {icon:<svg width="22"height="22"viewBox="0 0 24 24"fill="none"stroke="#8b5cf6"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,label:"Learn and Earn",color:"#8b5cf6",action:"smartguard"},
    {icon:<svg width="22"height="22"viewBox="0 0 24 24"fill="none"stroke="#f59e0b"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,label:"Redeem",color:"#f59e0b",action:"redeem"},
    {icon:<svg width="22"height="22"viewBox="0 0 24 24"fill="none"stroke="#0f172a"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><circle cx="12"cy="12"r="10"/><path d="M12 16v-4M12 8h.01"/></svg>,label:"RBI Guidelines",color:"#0f172a",action:"rbi"},
  ];
  const [showMore,setShowMore]=React.useState(false);
  const handleClick=(s)=>{
    if(s.action){
      setPage(s.action);
    }else{
      showToast(`${s.label} — Coming Soon!`);
    }
  };
  return(
    <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:20,marginBottom:0}}>
      {ToastEl}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div>
          <div style={{fontWeight:700,fontSize:14,color:"#111827"}}>Explore Services</div>
          <div style={{fontSize:12,color:"#9ca3af",marginTop:2,lineHeight:1.5}}>Tap to preview</div>
        </div>
        <button onClick={()=>setShowMore(!showMore)} style={{background:"none",border:"none",color:"#1A56DB",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"'Inter',sans-serif",display:"flex",alignItems:"center",gap:4}}>
          {showMore?"← Back":"View All →"}</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
        {primary.map(s=>(
          <button key={s.label} className="svc-card"
            onClick={()=>handleClick(s)}>
            <div style={{width:44,height:44,borderRadius:14,display:"flex",alignItems:"center",
              justifyContent:"center",
              background:`${s.color}18`,border:`1.5px solid ${s.color}30`}}>
              {s.icon}
            </div>
            <span style={{fontSize:11,fontWeight:700,color:"#374151",textAlign:"center",lineHeight:1.3}}>
              {s.label}
            </span>
          </button>
        ))}
      </div>
      {showMore&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:8}}>
          {secondary.map(s=>(
            <button key={s.label} className="svc-card"
              onClick={()=>handleClick(s)}>
              <div style={{width:44,height:44,borderRadius:14,display:"flex",alignItems:"center",
                justifyContent:"center",
                background:`${s.color}18`,border:`1.5px solid ${s.color}30`}}>
                {s.icon}
              </div>
              <span style={{fontSize:11,fontWeight:700,color:"#374151",textAlign:"center",lineHeight:1.3}}>
                {s.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== FEATURE 6: RISK EXPLAINER TAGS =====
function RiskExplainer({tx, user}){
  if(!tx) return null;
  const avg=calculateAvgTransaction(user);
  const tags=[];
  const inContacts=tx.toNum&&(tx.toNum in(user.contacts||{}));
  const inHistory=tx.toNum&&user.known_recipients?.has(tx.toNum);
  const inUPI=tx.toNum&&(tx.toNum in USERS);

  if(tx.amt>avg*3) tags.push({label:`${Math.round(tx.amt/Math.max(avg,1))}× your avg amount`,color:"#dc2626",bg:"#fef2f2",border:"#fca5a5"});
  if(!inContacts&&!inHistory&&tx.type==="debit") tags.push({label:"New recipient",color:"#f59e0b",bg:"#fef3c7",border:"#fcd34d"});
  if(!inUPI&&tx.type==="debit") tags.push({label:"Off-network recipient",color:"#dc2626",bg:"#fef2f2",border:"#fca5a5"});
  const h=tx.time?parseInt(tx.time.split(":")[0]):12;
  if(h>=1&&h<5) tags.push({label:"Late-night (1–5AM)",color:"#7c3aed",bg:"#f5f3ff",border:"#c4b5fd"});
  if(tx.otp_used) tags.push({label:"OTP verified",color:"#22c55e",bg:"#dcfce7",border:"#86efac"});
  if(tx.status==="blocked") tags.push({label:"Blocked — high risk",color:"#dc2626",bg:"#fef2f2",border:"#fca5a5"});
  const recRisk=getRecipientRisk(tx.toNum||"");
  const recReason=getRecipientReportReason(tx.toNum||"");
  if(recRisk>=1&&recReason) tags.push({label:`Reported for ${recReason}`,color:"#dc2626",bg:"#fef2f2",border:"#fca5a5"});
  else if(recRisk>=2) tags.push({label:`Flagged ${recRisk}× network-wide`,color:"#dc2626",bg:"#fef2f2",border:"#fca5a5"});
  if(tx.risk<40&&!tags.length) tags.push({label:"Low risk",color:"#22c55e",bg:"#dcfce7",border:"#86efac"});

  return(
    <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:6}}>
      {tags.map((t,i)=>(
        <span key={i} className="risk-tag"
          style={{color:t.color,background:t.bg,borderColor:t.border,fontSize:10,padding:"3px 9px",borderRadius:14,fontWeight:700}}>
          {t.label}
        </span>
      ))}
    </div>
  );
}

// ===== FEATURE 1: FINANCE ANALYTICS PAGE =====
function FinanceAnalyticsPage({txs,user}){
  const fin=React.useMemo(()=>getFinanceInsights(txs),[txs]);
  const{catThis,totalThis,insights,sorted,thisMonth}=fin;
  const maxSpend=sorted.length>0?sorted[0][1]:1;
  const insColor={top:"#0078FF",up:"#dc2626",down:"#22c55e",info:"#94a3b8"};
  const insBg={top:"#e8f1ff",up:"#fef2f2",down:"#dcfce7",info:"#f8faff"};

  return(
    <div className="page-pad page-enter" style={{padding:24,maxWidth:860,margin:"0 auto"}}>
      <div style={{marginBottom:22}}>
        <h2 style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Finance Analytics</h2>
        <p style={{fontSize:14,color:"#64748b"}}>Smart spending insights powered by your transaction data</p>
      </div>

      {/* Summary strip */}
      <div className="stats-3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20}}>
        {[
          {label:"Spent This Month",value:`₹${totalThis.toLocaleString("en-IN")}`,color:"#0078FF",bg:"#e8f1ff",icon:"💸"},
          {label:"Categories Active",value:String(sorted.filter(([,v])=>v>0).length),color:"#7c3aed",bg:"#f5f3ff",icon:"📊"},
          {label:"Avg per Transaction",value:`₹${thisMonth.length?Math.round(totalThis/thisMonth.length).toLocaleString("en-IN"):"0"}`,color:"#22c55e",bg:"#dcfce7",icon:"📐"},
        ].map(s=>(
          <Card key={s.label} hover style={{padding:"18px 16px"}}>
            <div style={{fontSize:22,marginBottom:6}}>{s.icon}</div>
            <div style={{fontSize:20,fontWeight:800,color:s.color,marginBottom:4}}>{s.value}</div>
            <div style={{fontSize:11,color:"#94a3b8",fontWeight:600}}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Smart Insights */}
      <Card style={{padding:22,marginBottom:20}}>
        <div style={{fontWeight:800,fontSize:15,color:"#0f172a",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
          🧠 Smart Insights
        </div>
        {insights.map((ins,i)=>(
          <div key={i} className="ins-chip" style={{background:insBg[ins.type]||"#f8faff",
            border:`1px solid ${insColor[ins.type]||"#e2e8f0"}22`,marginBottom:8,animationDelay:`${i*0.08}s`}}>
            <span style={{fontSize:18,lineHeight:1}}>{ins.icon}</span>
            <span style={{color:insColor[ins.type]||"#0f172a"}}>{ins.text}</span>
          </div>
        ))}
      </Card>

      {/* Category breakdown */}
      <Card style={{padding:22,marginBottom:20}}>
        <div style={{fontWeight:800,fontSize:15,color:"#0f172a",marginBottom:16}}>📊 Spending by Category</div>
        {sorted.length===0&&<div style={{color:"#94a3b8",fontSize:13}}>No spending data this month.</div>}
        {sorted.filter(([,v])=>v>0).map(([cat,amt])=>{
          const data=TX_CATEGORIES[cat]||TX_CATEGORIES.other;
          const pct=Math.round((amt/Math.max(maxSpend,1))*100);
          const share=Math.round((amt/Math.max(totalThis,1))*100);
          return(
            <div key={cat} style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:18}}>{data.icon}</span>
                  <span style={{fontWeight:700,fontSize:13,color:"#0f172a"}}>{data.label}</span>
                  <span style={{fontSize:11,color:"#94a3b8",background:"#f8faff",padding:"2px 8px",borderRadius:10}}>{share}%</span>
                </div>
                <span style={{fontWeight:800,fontSize:13,color:data.color}}>₹{amt.toLocaleString("en-IN")}</span>
              </div>
              <div style={{height:8,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}>
                <div className="cat-fill" style={{height:"100%",width:`${pct}%`,
                  background:`linear-gradient(90deg,${data.color}cc,${data.color})`,borderRadius:4}}/>
              </div>
            </div>
          );
        })}
      </Card>

      {/* Recent transactions this month */}
      <Card style={{padding:22}}>
        <div style={{fontWeight:800,fontSize:15,color:"#0f172a",marginBottom:14}}>🗓️ This Month's Transactions ({thisMonth.length})</div>
        {thisMonth.length===0&&<div style={{color:"#94a3b8",fontSize:13}}>No debit transactions this month.</div>}
        {thisMonth.slice(0,8).map((tx,i)=>{
          const cat=categorizeTx(tx)||"other";
          const data=TX_CATEGORIES[cat];
          return(
            <div key={tx.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",
              borderBottom:i<Math.min(thisMonth.length,8)-1?"1px solid #f8faff":"none"}}>
              <div style={{width:36,height:36,borderRadius:10,background:data.bg,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>
                {data.icon}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:13,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.to||tx.from}</div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>{data.label} · {tx.date}</div>
              </div>
              <div style={{fontWeight:800,fontSize:13,color:"#dc2626",flexShrink:0}}>−₹{tx.amt.toLocaleString("en-IN")}</div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}



/* ═══ PRELOAD: Demo network reports for 9111111111 ═══ */
reportRecipient("user1", "9111111111", 15000, "Scam");
reportRecipient("user2", "9111111111", 12000, "Fraud");
reportRecipient("user3", "9111111111", 18000, "Fake refund");

// ===== SMART GUARD PAGE =====
function SmartGuardPage({setPage, user}) {
  const today = new Date().toDateString();
  const isAdmin = user && user.isAdmin;
  const [canPlay, setCanPlay] = useState(isAdmin ? true : localStorage.getItem('lastPlayedDate') !== today);
  const [coins, setCoins] = useState(parseInt(localStorage.getItem('coins') || '0'));
  const [showModal, setShowModal] = useState(false);

  function handlePlayNow() {
    setShowModal(true);
  }

  function handlePlayLater() {
    setPage('dashboard');
  }

  function handleGameComplete() {
    setShowModal(false);
    // Refresh coins and canPlay from localStorage after game ends
    setCoins(parseInt(localStorage.getItem('coins') || '0'));
    if (!isAdmin) {
      setCanPlay(localStorage.getItem('lastPlayedDate') !== new Date().toDateString());
    }
  }

  return (
    <div className="page-pad page-enter" style={{ padding: 24, maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
      {showModal && canPlay && <SmartGuardGame onComplete={handleGameComplete} />}
      <div style={{ width: 64, height: 64, borderRadius: 16, background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid #c4b5fd' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Learn & Play</h2>
      <p style={{ fontSize: 14, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>Test your fraud detection skills and earn coins!</p>
      <div style={{ background: '#f8faff', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #dbeafe' }}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Your Coins</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#0078FF' }}>🪙 {coins}</div>
      </div>
      {canPlay ? (
        <div style={{ background: '#f8faff', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #dbeafe' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>{isAdmin ? 'Admin Access — Unlimited Play!' : 'Ready to play!'}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>Answer 5 questions — earn 5 coins for each correct answer.</div>
          <button id="playNowBtn" onClick={handlePlayNow} style={{ width: '100%', padding: '12px', background: '#0078FF', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", marginBottom: 8 }}>
            Play Now
          </button>
          <button onClick={handlePlayLater} style={{ width: '100%', padding: '12px', background: '#fff', color: '#0078FF', border: '1.5px solid #dbeafe', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
            Play Later
          </button>
        </div>
      ) : (
        <div style={{ background: '#fef3c7', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #fcd34d' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>You already played today.</div>
          <div style={{ fontSize: 13, color: '#b45309' }}>Come back tomorrow for another round!</div>
        </div>
      )}
      <button onClick={() => setPage('dashboard')} style={{ padding: '11px 24px', background: '#0078FF', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
        ← Back to Dashboard
      </button>
    </div>
  );
}

// ===== REDEEM PAGE =====
function RedeemPage({setPage}) {
  const coins = parseInt(localStorage.getItem('coins') || '0');
  const rewards = [
    { cost: 75, label: 'Nykaa Voucher', icon: '💄', desc: 'Flat ₹75 off on beauty & skincare' },
    { cost: 80, label: 'boAt Voucher', icon: '🎧', desc: '₹80 off on audio & wearables' },
    { cost: 100, label: 'Amazon Voucher', icon: '📦', desc: '₹100 off on any order' },
    { cost: 95, label: 'Flipkart Voucher', icon: '🛒', desc: '₹95 off on fashion & electronics' },
    { cost: 85, label: 'Swiggy Voucher', icon: '🍔', desc: '₹85 off on food delivery' },
    { cost: 85, label: 'Zomato Voucher', icon: '🍕', desc: '₹85 off on restaurant orders' },
    { cost: 90, label: 'Uber Ride Coupon', icon: '🚗', desc: '₹90 off on your next ride' },
    { cost: 120, label: 'MakeMyTrip Voucher', icon: '✈️', desc: '₹120 off on flight bookings' },
    { cost: 110, label: 'BookMyShow Ticket', icon: '🎬', desc: '₹110 off on movie tickets' },
    { cost: 70, label: 'Reliance Smart Coupon', icon: '🛍️', desc: '₹70 off at Reliance Smart stores' },
  ];

  function handleRedeem(r) {
    if (coins < r.cost) return;
    const newCoins = coins - r.cost;
    localStorage.setItem('coins', newCoins);
    alert(`🎉 Congratulations! You redeemed ${r.label}. Enjoy!`);
    setPage('dashboard');
  }

  return (
    <div className="page-pad page-enter" style={{ padding: 24, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', border: '1px solid #fcd34d' }}>
          <span style={{ fontSize: 28 }}>🎁</span>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Redeem Rewards</h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>Spend your hard-earned coins on exciting rewards!</p>
      </div>
      <div style={{ background: '#f8faff', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #dbeafe', display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 32 }}>🪙</span>
        <div>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Your Coins</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#0078FF' }}>{coins}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {rewards.map(r => (
          <div key={r.cost + r.label} style={{ padding: '14px', background: coins >= r.cost ? '#f8faff' : '#fef2f2', border: `1px solid ${coins >= r.cost ? '#dbeafe' : '#fecaca'}`, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: coins >= r.cost ? '#e8f1ff' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{r.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>{r.label}</div>
            <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.3 }}>{r.desc}</div>
            <button onClick={() => handleRedeem(r)} disabled={coins < r.cost} style={{ padding: '7px 12px', background: coins >= r.cost ? '#0078FF' : '#94a3b8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: coins >= r.cost ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans',sans-serif", whiteSpace: 'nowrap', marginTop: 4 }}>
              {r.cost} 🪙
            </button>
          </div>
        ))}
      </div>
      {coins < 70 && (
        <div style={{ marginTop: 20, padding: '14px', background: '#fef3c7', borderRadius: 14, textAlign: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>Not enough coins — play Learn & Play to earn more!</span>
        </div>
      )}
      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button onClick={() => setPage('dashboard')} style={{ padding: '12px 28px', background: '#0078FF', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );
}

// ===== RBI GUIDELINES PAGE =====
function RBIGuidelinesPage({setPage}) {
  const guidelines = [
    {
      date: "April 1, 2026",
      title: "Stronger Authentication Requirements",
      desc: "Stronger authentication requirements introduced for digital payments beyond OTP-only verification."
    },
    {
      date: "January 1, 2026",
      title: "Inactive Account Closure",
      desc: "Banks may close inactive or dormant accounts after extended inactivity to reduce fraud risk."
    },
    {
      date: "January 1, 2026",
      title: "Prepayment Charges Removed",
      desc: "Prepayment charges removed on many floating-rate retail loans to improve transparency for borrowers."
    },
    {
      date: "November 6, 2025",
      title: "Nominee Information Disclosure",
      desc: "Banks must inform customers about nominee options during account opening and related services."
    },
  ];

  return (
    <div className="page-pad page-enter" style={{padding:24,maxWidth:800,margin:"0 auto"}}>
      <div style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid #FFD700"}}>
            <span style={{fontSize:20,fontWeight:900,color:"#FFD700"}}>₹</span>
          </div>
          <div>
            <h2 style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:2}}>Reserve Bank of India</h2>
            <p style={{fontSize:13,color:"#64748b"}}>Latest Digital Payment Guidelines</p>
          </div>
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {guidelines.map((g,i) => (
          <Card key={i} style={{padding:20,borderLeft:"4px solid #0f172a"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <span style={{fontSize:11,fontWeight:800,color:"#FFD700",background:"#0f172a",padding:"4px 10px",borderRadius:8}}>
                {g.date}
              </span>
            </div>
            <div style={{fontSize:15,fontWeight:700,color:"#0f172a",marginBottom:6}}>{g.title}</div>
            <div style={{fontSize:13,color:"#64748b",lineHeight:1.6}}>{g.desc}</div>
          </Card>
        ))}
      </div>

      <div style={{marginTop:24,background:"#f8faff",borderRadius:14,padding:16,border:"1px solid #dbeafe"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <svg width="18"height="18"viewBox="0 0 24 24"fill="none"stroke="#0078FF"strokeWidth="2"><circle cx="12"cy="12"r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <span style={{fontSize:13,fontWeight:700,color:"#0078FF"}}>Stay Safe, Stay Vigilant</span>
        </div>
        <p style={{fontSize:12,color:"#64748b",margin:0}}>
          Always verify recipient details before making payments. Never share OTP, PIN, or sensitive information with anyone.
          Report suspicious activity immediately at cybercrime.gov.in or call 1930.
        </p>
      </div>

      <div style={{textAlign:"center",marginTop:24}}>
        <button onClick={()=>setPage("dashboard")} style={{padding:"12px 28px",background:"#0078FF",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );
}
