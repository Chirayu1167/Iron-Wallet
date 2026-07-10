/* ═══ ROOT APP ═══ */
function App(){
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [txs, setTxs] = useState(SEED_TXS);
  const [balance, setBalance] = useState(0);
  const [requests, setRequests] = useState(SEED_REQS);
  const [showAssistant, setShowAssistant] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [wsToast, setWsToast] = useState("");        // real-time credit toast

  // ── Stable refs for socket callbacks ─────────────────────────────────
  const socketRef = useRef(null);
  const userRef   = useRef(null);
  const addTxRef  = useRef(null);
  const updBalRef = useRef(null);

  // ── WS connection status (drives the dot in the header) ─────────────
  const [wsStatus, setWsStatus] = useState("connecting"); // "connecting"|"connected"|"error"

  // ── Socket initialization (once, on mount) ────────────────────────────
  useEffect(() => {
    // Derive WS server URL from current hostname so cross-device works.
    // WebSocket server runs as a separate Railway service.
    // Replace the URL below with your Railway WS service domain after deploying.
    const wsUrl = window.__WS_URL__ || "https://determined-vibrancy.up.railway.app";
    console.log("[IronWallet WS] Connecting to:", wsUrl);

    const socket = io(wsUrl, {
      // ✅ FIX 1: Always start with polling so the initial HTTP handshake
      //    succeeds, then upgrade to WebSocket. "websocket"-only silently
      //    fails when the server is not yet ready or a proxy is in the way.
      transports: ["polling", "websocket"],
      reconnectionDelay:    1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 10000,
    });

    socketRef.current = socket;
    window._ptSocket  = socket;   // global handle for SendMoneyPage

    // ── CONNECT ──────────────────────────────────────────────────────────
    socket.on("connect", () => {
      console.log("[IronWallet WS] ✅ Connected  socket.id:", socket.id,
                  "| transport:", socket.io.engine.transport.name);
      setWsStatus("connected");

      // Re-register on every (re)connect — covers page reload + reconnection
      if (userRef.current) {
        socket.emit("user_register", userRef.current.number, (ack) => {
          console.log("[IronWallet WS] Re-registered:", userRef.current?.number, ack);
        });
      }
    });

    // ── CONNECT ERROR ─────────────────────────────────────────────────────
    // ✅ FIX 2: Catch and surface connection failures
    socket.on("connect_error", (err) => {
      console.error("[IronWallet WS] ❌ connect_error:", err.message);
      setWsStatus("error");
    });

    // ── DISCONNECT ───────────────────────────────────────────────────────
    socket.on("disconnect", (reason) => {
      console.warn("[IronWallet WS] Disconnected:", reason);
      setWsStatus("connecting");
    });

    // ── RECEIVE PAYMENT (credit the receiver's account) ──────────────────
    socket.on("receive_payment", (data) => {
      console.log("[IronWallet WS] 💰 receive_payment:", data);
      const { fromNumber, amount, txId, timestamp, note } = data;
      const now = new Date(timestamp || Date.now());
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const dateStr = `${String(now.getDate()).padStart(2,"0")} ${months[now.getMonth()]} ${String(now.getFullYear()).slice(2)}`;
      const timeStr = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

      const sender      = USERS[fromNumber];
      const senderName  = sender ? sender.name : fromNumber;

      const tx = {
        id:      txId || Date.now(),
        from:    senderName,
        fromNum: fromNumber,
        amt:     Number(amount),
        date:    dateStr,
        time:    timeStr,
        risk:    0,
        status:  "success",
        type:    "credit",
        note:    note || "Payment received",
        isNew:   true,
      };

      // Stable refs — never stale even though socket handler is created once
      if (addTxRef.current)  addTxRef.current(tx);
      if (updBalRef.current) updBalRef.current(b => b + Number(amount));

      setWsToast(`💰 Received ₹${Number(amount).toLocaleString("en-IN")} from ${senderName}`);
      setTimeout(() => setWsToast(""), 4500);
    });

    // ── FRAUD WARNING ────────────────────────────────────────────────────
    socket.on("fraud_warning", (data) => {
      console.warn("[IronWallet WS] 🚨 fraud_warning:", data);
      setWsToast(`🚨 Fraud Alert: ${data.reason || "Suspicious activity detected"}`);
      setTimeout(() => setWsToast(""), 5500);
    });

    // ── CLEANUP ──────────────────────────────────────────────────────────
    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("disconnect");
      socket.off("receive_payment");
      socket.off("fraud_warning");
      socket.disconnect();
      socketRef.current = null;
      window._ptSocket  = null;
    };
  }, []); // eslint-disable-line — intentionally run once

  function handleLogin(u){
    setUser(u);
    setBalance(u.balance);
    setTxs(SEED_TXS);
    setRequests(SEED_REQS);
    userRef.current = u;
    // Register with WS server as soon as the user is known
    if (socketRef.current?.connected) {
      socketRef.current.emit("user_register", u.number, (ack) => {
        if (ack?.success) console.log("[IronWallet WS] Registered:", u.number, `(${ack.connections} conn)`);
      });
    }
  }

  function handleLogout(){
    if (socketRef.current && userRef.current) {
      socketRef.current.emit("user_leave", userRef.current.number);
      console.log("[IronWallet WS] user_leave:", userRef.current.number);
    }
    userRef.current = null;
    setUser(null);
    setPage("dashboard");
  }

  function addTx(tx){
    setTxs(prev => [tx, ...prev]);
  }
  addTxRef.current = addTx; // keep ref current

  function updateBalance(fn){
    setBalance(prev => Math.max(0, fn(prev)));
  }
  updBalRef.current = updateBalance; // keep ref current

  function resolveRequest(id, status){
    setRequests(prev => prev.map(r => r.id === id ? {...r, status} : r));
  }

  function updateUser(updates){
    setUser(prev => ({...prev, ...updates}));
  }

  function createTicket(tx, reason, note, currentUser, ticketId){
    const id = ticketId || ("PT-" + Math.floor(Math.random()*100000));
    const now = Date.now();
    const recipient = tx.toNum || tx.fromNum || "";
    const amount = tx.amt;
    const sev = getFraudSeverity(reason);
    const ticket = {
      id,
      transaction_id: tx.id,
      user: currentUser.number,
      recipient,
      recipientName: tx.to || tx.from || recipient,
      amount,
      reason,
      note,
      status: "Under Review",
      refund_status: "Pending",
      created_at: now,
      severity: sev,
      timeline: [{ status: "Submitted", time: now }, { status: "Sent to Bank", time: now + 5000 }, { status: "Sent to Cyber Cell", time: now + 10000 }]
    };
    // Integrate with existing recipient risk system
    reportRecipient(currentUser.number, recipient, amount, reason);
    setTickets(prev => [ticket, ...prev]);
    return id;
  }

  function updateTicketStatus(id, status, refund_status){
    setTickets(prev => prev.map(t => t.id === id ? {
      ...t, status, refund_status,
      timeline: [...t.timeline, { status, time: Date.now() }]
    } : t));
  }

  const pendingCount = requests.filter(r => r.status === "pending").length;

  if(!user) return <LoginPage onLogin={handleLogin}/>;

  const pp = {user, txs, balance, setPage, addTx, updateBalance, requests, resolveRequest, updateUser, tickets, createTicket, updateTicketStatus};

  return (
    <div style={{display:"flex",minHeight:"100vh",fontFamily:"'Inter',sans-serif",
      background:"#f1f5f9",position:"relative"}}>
      <main id="main-content" style={{flex:1,overflowY:"auto",maxHeight:"100vh",position:"relative",paddingBottom:120}}>
          <div key={page}>
            {page === "dashboard"     && <Dashboard {...pp}/>}
            {page === "send"          && <SendMoneyPage {...pp}/>}
            {page === "request-money" && <RequestMoneyPage {...pp}/>}
            {page === "requests"      && <RequestsPage {...pp}/>}
            {page === "history"       && <HistoryPage txs={txs} user={user} tickets={tickets} createTicket={createTicket}/>}
            {page === "finance"       && <FinanceAnalyticsPage txs={txs} user={user}/>}
            {page === "insights"      && <InsightsPage {...pp}/>}
            {page === "profile"       && <ProfilePage {...pp}/>}
            {page === "smartguard"   && <SmartGuardPage {...pp}/>}
            {page === "redeem"        && <RedeemPage {...pp}/>}
            {page === "rbi"           && <RBIGuidelinesPage {...pp}/>}
          </div>

          <button
            onClick={() => setShowAssistant(true)}
            style={{position:"fixed",bottom:28,right:28,zIndex:100,
              width:60,height:60,borderRadius:"50%",background:"#1A56DB",
              border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:"0 4px 16px rgba(26,86,219,.35)"}}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
        </main>
        <Dock page={page} setPage={setPage} onLogout={handleLogout} pendingCount={pendingCount}/>
      </div>

      {showAssistant && <SafePayAssistant user={user} txs={txs} onClose={() => setShowAssistant(false)}/>}

      {/* ── Real-time WebSocket toast (credit / fraud warning) ── */}
      {wsToast && (
        <div className="pt-toast" style={{
          background: wsToast.startsWith("💰") ? "#0f3d20" : "#3d0f0f",
          borderTop: `3px solid ${wsToast.startsWith("💰") ? "#22c55e" : "#ef4444"}`,
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          padding: "12px 26px",
          borderRadius: 28,
          bottom: 100,
          letterSpacing: "-.1px",
          boxShadow: "0 8px 32px rgba(0,0,0,.32)",
        }}>
          {wsToast}
        </div>
      )}

      {/* ── WebSocket connection status pill (bottom-left corner) ── */}
      {(()=>{
        const cfg = {
          connected:  { dot:"#22c55e", bg:"#dcfce7", text:"#166534", label:"Live" },
          connecting: { dot:"#f59e0b", bg:"#fef3c7", text:"#92400e", label:"Connecting…" },
          error:      { dot:"#ef4444", bg:"#fef2f2", text:"#991b1b", label:"WS Offline" },
        }[wsStatus] || {};
        return (
          <div style={{
            position:"fixed", bottom:16, left:16, zIndex:9990,
            display:"flex", alignItems:"center", gap:6,
            padding:"5px 12px", borderRadius:20,
            background: cfg.bg,
            border:`1px solid ${cfg.dot}44`,
            boxShadow:"0 2px 10px rgba(0,0,0,.10)",
            fontSize:11, fontWeight:700, color: cfg.text,
            userSelect:"none",
          }}>
            <span style={{
              width:7, height:7, borderRadius:"50%",
              background: cfg.dot,
              display:"inline-block",
              boxShadow: wsStatus==="connected" ? `0 0 0 3px ${cfg.dot}44` : "none",
              animation: wsStatus==="connecting" ? "pulse 1.2s infinite" : "none",
            }}/>
            WS {cfg.label}
            {wsStatus==="error" && (
              <button onClick={()=>{
                if(socketRef.current){ socketRef.current.connect(); setWsStatus("connecting"); }
              }} style={{
                marginLeft:4, background:"none", border:"none",
                color:"#ef4444", fontWeight:800, fontSize:11, cursor:"pointer",
                padding:0, fontFamily:"'DM Sans',sans-serif",
              }}>↺</button>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ═══ PRELOAD: Demo network reports for 9111111111 ═══
reportRecipient("user1", "9111111111", 15000, "Scam");
reportRecipient("user2", "9111111111", 12000, "Fraud");
reportRecipient("user3", "9111111111", 18000, "Fake refund");

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
