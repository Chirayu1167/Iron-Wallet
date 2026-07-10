const{useState,useRef,useEffect,useMemo,useCallback}=React;
const{createPortal}=ReactDOM;

// Modal
/* Portal wrapper */
function Modal({children}){
  const el=useRef(document.getElementById("modal-root"));
  useEffect(()=>{
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow="";};
  },[]);
  return createPortal(
    <div style={{
      position:'fixed',top:0,left:0,right:0,bottom:0,
      background:'rgba(15,23,42,0.65)',
      backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)',
      display:'flex',alignItems:'center',justifyContent:'center',
      zIndex:10000,padding:'16px'
    }}>
      {children}
    </div>,
    el.current
  );
}

const API=""; // FastAPI serves index.html — use relative paths
const B="#1A56DB",B2="#1447b0",B3="#0e3688";
const BL="#dbeafe",BLL="#eff6ff";
const ERR="#dc2626";


// Shared UI
/* ═══ SHARED UI ═══ */
function Avatar({name,size=40}){
  const ini=(name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const g=["#1A56DB","#3b82f6","#6366f1","#0ea5e9","#0891b2"];
  return(
    <div style={{width:size,height:size,borderRadius:"50%",background:g[(name||"A").charCodeAt(0)%g.length],
      display:"flex",alignItems:"center",justifyContent:"center",
      fontSize:size*.36,fontWeight:700,color:"#fff",flexShrink:0}}>
      {ini}
    </div>
  );
}

function RiskPill({score}){
  const m=riskMeta(score);
  return(
    <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
      background:m.bg,color:m.color,border:`1px solid ${m.border}`,
      display:"inline-flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>
      <svg width="6" height="6"><circle cx="3" cy="3" r="3" fill={m.dot}/></svg>
      {m.label} {score}
    </span>
  );
}

function Card({children,style={},className="",hover=false}){
  return(
    <div className={`glass ${hover?"hover-lift":""} ${className}`}
      style={{borderRadius:18,...style}}>
      {children}
    </div>
  );
}
function Div(){return<div style={{height:1,background:"#f1f5f9",margin:"12px 0"}}/>;}

/* ═══ ICONS ═══ */
const Ic={
  dashboard:(c="#94a3b8")=><svg width="19"height="19"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="1.9"strokeLinecap="round"strokeLinejoin="round"><rect x="3"y="3"width="7"height="7"rx="1.5"/><rect x="14"y="3"width="7"height="7"rx="1.5"/><rect x="3"y="14"width="7"height="7"rx="1.5"/><rect x="14"y="14"width="7"height="7"rx="1.5"/></svg>,
  send:(c="#94a3b8")=><svg width="19"height="19"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="1.9"strokeLinecap="round"strokeLinejoin="round"><line x1="22"y1="2"x2="11"y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  bell:(c="#94a3b8")=><svg width="19"height="19"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="1.9"strokeLinecap="round"strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  clock:(c="#94a3b8")=><svg width="19"height="19"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="1.9"strokeLinecap="round"strokeLinejoin="round"><circle cx="12"cy="12"r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  bar:(c="#94a3b8")=><svg width="19"height="19"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="1.9"strokeLinecap="round"strokeLinejoin="round"><line x1="18"y1="20"x2="18"y2="10"/><line x1="12"y1="20"x2="12"y2="4"/><line x1="6"y1="20"x2="6"y2="14"/></svg>,
  user:(c="#94a3b8")=><svg width="19"height="19"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="1.9"strokeLinecap="round"strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12"cy="7"r="4"/></svg>,
  logout:(c="#dc2626")=><svg width="17"height="17"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21"y1="12"x2="9"y2="12"/></svg>,
  shield:(c="#0078FF")=><svg width="17"height="17"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  lock:(c="#0078FF")=><svg width="17"height="17"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><rect x="3"y="11"width="18"height="11"rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  check:(c="#22c55e")=><svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.5"strokeLinecap="round"strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x:(c="#dc2626")=><svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.5"strokeLinecap="round"strokeLinejoin="round"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>,
  warn:(c="#f97316")=><svg width="17"height="17"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12"y1="9"x2="12"y2="13"/><line x1="12"y1="17"x2="12.01"y2="17"/></svg>,
  eye:(c="#94a3b8")=><svg width="17"height="17"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12"cy="12"r="3"/></svg>,
  eyeOff:(c="#94a3b8")=><svg width="17"height="17"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1"y1="1"x2="23"y2="23"/></svg>,
  up:(c="#0078FF")=><svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.5"strokeLinecap="round"strokeLinejoin="round"><line x1="12"y1="19"x2="12"y2="5"/><polyline points="5 12 12 5 19 12"/></svg>,
  down:(c="#22c55e")=><svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.5"strokeLinecap="round"strokeLinejoin="round"><line x1="12"y1="5"x2="12"y2="19"/><polyline points="19 12 12 19 5 12"/></svg>,
  qr:(c="#0078FF")=><svg width="16"height="16"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><rect x="3"y="3"width="7"height="7"/><rect x="14"y="3"width="7"height="7"/><rect x="3"y="14"width="7"height="7"/><line x1="14"y1="14"x2="17"y2="14"/><line x1="17"y1="14"x2="17"y2="17"/><line x1="17"y1="17"x2="21"y2="17"/><line x1="21"y1="14"x2="21"y2="17"/><line x1="14"y1="17"x2="14"y2="21"/><line x1="14"y1="21"x2="21"y2="21"/></svg>,
  key:(c="#0078FF")=><svg width="17"height="17"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  flag:(c="#dc2626")=><svg width="15"height="15"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4"y1="22"x2="4"y2="15"/></svg>,
  rupee:(c="#0078FF")=><svg width="17"height="17"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><line x1="6"y1="5"x2="18"y2="5"/><line x1="6"y1="10"x2="18"y2="10"/><path d="M6 10l6 9M14 10c0 2.5-2 4-4 4"/></svg>,
  monitor:(c="#0078FF")=><svg width="17"height="17"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><rect x="2"y="3"width="20"height="14"rx="2"/><line x1="8"y1="21"x2="16"y2="21"/><line x1="12"y1="17"x2="12"y2="21"/></svg>,
  home:(c="#94a3b8")=><svg width="19"height="19"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="1.9"strokeLinecap="round"strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  phone:(c="#0078FF")=><svg width="17"height="17"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><rect x="5"y="2"width="14"height="20"rx="2"/><line x1="12"y1="18"x2="12.01"y2="18"/></svg>,
  freeze:(c="#dc2626")=><svg width="17"height="17"viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M12 2v20M2 12h20M4 4l16 16M20 4L4 20"/></svg>,
};

/* ═══ BTN ═══ */
function Btn({children,onClick,variant="primary",disabled,style={},fullWidth}){
  const vars={
    primary:{background:disabled?"#93c5fd":"#1A56DB",color:"#fff",
      boxShadow:disabled?"none":"none"},
    secondary:{background:BL,color:B,border:"none"},
    ghost:{background:"transparent",color:"#6b7280",border:"1px solid #e5e7eb"},
    danger:{background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca"},
  };
  return(
    <button onClick={disabled?undefined:onClick} disabled={disabled}
      className={variant==="primary"?"btn-primary":""}
      style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:7,
        fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:14,
        cursor:disabled?"not-allowed":"pointer",border:"none",borderRadius:12,
        padding:"11px 22px",outline:"none",width:fullWidth?"100%":"auto",
        ...vars[variant],...style}}>
      {children}
    </button>
  );
}

/* ═══ LOGIN PAGE ═══ */