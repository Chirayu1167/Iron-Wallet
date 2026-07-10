// ═══ CONSTANTS & USER DATABASE ═══

/* ═══ RISK THRESHOLDS ═══
   0  – 39  → SILENT       straight to PIN, no warning
   40 – 74  → SOFT POPUP   top-of-page warning banner, user can still pay
   75 – 89  → RISK SCREEN  full FraudRiskCard, must confirm
   90 – 100 → COOLING      full risk screen + 30s forced wait before PIN
   85+     → RISK + OTP    OTP additionally required (overlaps with above)
═══════════════════════════════════════════════════════════════ */
const RISK_SILENT  = 39;
const RISK_POPUP   = 40;
const RISK_SCREEN  = 75;   // 75+ shows the full fraud risk card
const RISK_NORMAL  = RISK_SCREEN;
const RISK_INFO    = RISK_SCREEN;
const RISK_OTP     = 85;
const RISK_COOLING = 90;   // 90+ forces a 30-second cooling period before PIN

/* ═══ EXPANDED USER DATABASE with more UPI IDs for ML accuracy ═══ */
const USERS = {
  "9340228345": {
    name: "Chirayu Mahajan",
    number: "9340228345",
    pin: "1167",
    balance: 84250,
    upi: "chirayu@ironwallet",
    age: 21,
    contacts: {
      "9158763151": "Pranav Chopade",
      "9766876442": "Farhan Farooqui",
      "9876543210": "Mehul Patil",
      "9988776655": "Rajesh Kumar",
      "9123456789": "Amit Sharma",
      "9012345678": "Priya Patel",
      "8901234567": "Neha Gupta"
    },
    known_recipients: new Set(["9158763151", "9766876442", "9876543210", "9988776655", "9123456789"]),
    verified: true,
    risk_score: 12,
    freeze_count: 0,
    frozen_until: null,
    permanent_frozen: false,
    cooldown_until: null,
    blocked_attempts: 0,
    bypass_attempts: 0,
    recent_blocks: [],
    risk_score_history: []
  },
  "9158763151": {
    name: "Pranav Chopade",
    number: "9158763151",
    pin: "2611",
    balance: 32780,
    upi: "pranav@ironwallet",
    age: 30,
    contacts: {
      "9340228345": "Chirayu Mahajan",
      "9766876442": "Farhan Farooqui",
      "9876543210": "Mehul Patil",
      "8899776655": "Sneha Reddy",
      "7778889990": "Vikram Singh",
      "9988112233": "Anjali Desai"
    },
    known_recipients: new Set(["9340228345", "9766876442", "9876543210", "8899776655", "7778889990"]),
    verified: true,
    risk_score: 8,
    freeze_count: 0,
    frozen_until: null,
    permanent_frozen: false,
    cooldown_until: null,
    blocked_attempts: 0,
    bypass_attempts: 0,
    recent_blocks: [],
    risk_score_history: []
  },
  "9766876442": {
    name: "Farhan Farooqui",
    number: "9766876442",
    pin: "1234",
    balance: 15400,
    upi: "farhan@ironwallet",
    age: 65,
    contacts: {
      "9340228345": "Chirayu Mahajan",
      "9158763151": "Pranav Chopade",
      "9876543210": "Mehul Patil",
      "9988001122": "Irfan Khan",
      "9663355221": "Zara Sheikh",
      "9554433221": "Imran Ali"
    },
    known_recipients: new Set(["9340228345", "9158763151", "9876543210", "9988001122", "9663355221"]),
    verified: false,
    risk_score: 25,
    freeze_count: 0,
    frozen_until: null,
    permanent_frozen: false,
    cooldown_until: null,
    blocked_attempts: 0,
    bypass_attempts: 0,
    recent_blocks: [],
    risk_score_history: []
  },
  "9876543210": {
    name: "Mehul Patil",
    number: "9876543210",
    pin: "9876",
    balance: 67120,
    upi: "mehul@ironwallet",
    age: 19,
    contacts: {
      "9340228345": "Chirayu Mahajan",
      "9158763151": "Pranav Chopade",
      "9766876442": "Farhan Farooqui",
      "8765432109": "Rohan Deshmukh",
      "7654321098": "Kavita Sharma"
    },
    known_recipients: new Set(["9340228345", "9158763151", "9766876442", "8765432109"]),
    verified: true,
    risk_score: 18,
    freeze_count: 0,
    frozen_until: null,
    permanent_frozen: false,
    cooldown_until: null,
    blocked_attempts: 0,
    bypass_attempts: 0,
    recent_blocks: [],
    risk_score_history: []
  },
  "9699189866": {
    name: "Vedant Deshmukh",
    number: "9699189866",
    pin: "2805",
    balance: 51900,
    upi: "vedant@ironwallet",
    age: 28,
    contacts: {
      "9340228345": "Chirayu Mahajan",
      "9158763151": "Pranav Chopade",
      "9988776655": "Rajesh Kumar",
      "9123456789": "Amit Sharma"
    },
    known_recipients: new Set(["9340228345", "9158763151", "9988776655"]),
    verified: true,
    risk_score: 5,
    freeze_count: 0,
    frozen_until: null,
    permanent_frozen: false,
    cooldown_until: null,
    blocked_attempts: 0,
    bypass_attempts: 0,
    recent_blocks: [],
    risk_score_history: []
  },
  "9988776655": {
    name: "Rajesh Kumar",
    number: "9988776655",
    pin: "5555",
    balance: 125000,
    upi: "rajesh@ironwallet",
    age: 45,
    contacts: {
      "9340228345": "Chirayu Mahajan",
      "9699189866": "Vedant Deshmukh",
      "9123456789": "Amit Sharma"
    },
    known_recipients: new Set(["9340228345", "9699189866", "9123456789"]),
    verified: true,
    risk_score: 3,
    freeze_count: 0,
    frozen_until: null,
    permanent_frozen: false,
    cooldown_until: null,
    blocked_attempts: 0,
    bypass_attempts: 0,
    recent_blocks: [],
    risk_score_history: []
  },
  "9123456789": {
    name: "Amit Sharma",
    number: "9123456789",
    pin: "1212",
    balance: 45000,
    upi: "amit@ironwallet",
    age: 35,
    contacts: {
      "9340228345": "Chirayu Mahajan",
      "9988776655": "Rajesh Kumar",
      "9699189866": "Vedant Deshmukh"
    },
    known_recipients: new Set(["9340228345", "9988776655", "9699189866"]),
    verified: true,
    risk_score: 7,
    freeze_count: 0,
    frozen_until: null,
    permanent_frozen: false,
    cooldown_until: null,
    blocked_attempts: 0,
    bypass_attempts: 0,
    recent_blocks: [],
    risk_score_history: []
  },
  "8899776655": {
    name: "Sneha Reddy",
    number: "8899776655",
    pin: "3434",
    balance: 89000,
    upi: "sneha@ironwallet",
    age: 29,
    contacts: {
      "9158763151": "Pranav Chopade",
      "7778889990": "Vikram Singh"
    },
    known_recipients: new Set(["9158763151", "7778889990"]),
    verified: false,
    risk_score: 2,
    freeze_count: 0,
    frozen_until: null,
    permanent_frozen: false,
    cooldown_until: null,
    blocked_attempts: 0,
    bypass_attempts: 0,
    recent_blocks: [],
    risk_score_history: []
  },
  "7778889990": {
    name: "Vikram Singh",
    number: "7778889990",
    pin: "5656",
    balance: 230000,
    upi: "vikram@ironwallet",
    age: 52,
    contacts: {
      "9158763151": "Pranav Chopade",
      "8899776655": "Sneha Reddy"
    },
    known_recipients: new Set(["9158763151", "8899776655"]),
    verified: true,
    risk_score: 1,
    freeze_count: 0,
    frozen_until: null,
    permanent_frozen: false,
    cooldown_until: null,
    blocked_attempts: 0,
    bypass_attempts: 0,
    recent_blocks: [],
    risk_score_history: []
  },
  "9988001122": {
    name: "Irfan Khan",
    number: "9988001122",
    pin: "7878",
    balance: 34000,
    upi: "irfan@ironwallet",
    age: 42,
    contacts: {
      "9766876442": "Farhan Farooqui",
      "9663355221": "Zara Sheikh"
    },
    known_recipients: new Set(["9766876442", "9663355221"]),
    verified: false,
    risk_score: 4,
    freeze_count: 0,
    frozen_until: null,
    permanent_frozen: false,
    cooldown_until: null,
    blocked_attempts: 0,
    bypass_attempts: 0,
    recent_blocks: [],
    risk_score_history: []
  },
  "9663355221": {
    name: "Zara Sheikh",
    number: "9663355221",
    pin: "9090",
    balance: 67800,
    upi: "zara@ironwallet",
    age: 31,
    contacts: {
      "9766876442": "Farhan Farooqui",
      "9988001122": "Irfan Khan"
    },
    known_recipients: new Set(["9766876442", "9988001122"]),
    verified: true,
    risk_score: 6,
    freeze_count: 0,
    frozen_until: null,
    permanent_frozen: false,
    cooldown_until: null,
    blocked_attempts: 0,
    bypass_attempts: 0,
    recent_blocks: [],
    risk_score_history: []
  },
  "8765432109": {
    name: "Rohan Deshmukh",
    number: "8765432109",
    pin: "4321",
    balance: 28500,
    upi: "rohan@ironwallet",
    age: 26,
    contacts: {
      "9876543210": "Mehul Patil",
      "7654321098": "Kavita Sharma"
    },
    known_recipients: new Set(["9876543210", "7654321098"]),
    verified: false,
    risk_score: 9,
    freeze_count: 0,
    frozen_until: null,
    permanent_frozen: false,
    cooldown_until: null,
    blocked_attempts: 0,
    bypass_attempts: 0,
    recent_blocks: [],
    risk_score_history: []
  },
  "7654321098": {
    name: "Kavita Sharma",
    number: "7654321098",
    pin: "1357",
    balance: 92300,
    upi: "kavita@ironwallet",
    age: 38,
    contacts: {
      "9876543210": "Mehul Patil",
      "8765432109": "Rohan Deshmukh"
    },
    known_recipients: new Set(["9876543210", "8765432109"]),
    verified: true,
    risk_score: 11,
    freeze_count: 0,
    frozen_until: null,
    permanent_frozen: false,
    cooldown_until: null,
    blocked_attempts: 0,
    bypass_attempts: 0,
    recent_blocks: [],
    risk_score_history: []
  },
  "9699624733": {
    name: "Shivshree Shinde",
    number: "9699624733",
    pin: "2002",
    balance: 90000,
    upi: "shivshree@ironwallet",
    age: 19,
    contacts: {},
    known_recipients: new Set([]),
    verified: true,
    risk_score: 0,
    freeze_count: 0,
    frozen_until: null,
    permanent_frozen: false,
    cooldown_until: null,
    blocked_attempts: 0,
    bypass_attempts: 0,
    recent_blocks: [],
    risk_score_history: []
  },
  "1234567890": {
    name: "Admin",
    number: "1234567890",
    pin: "1234",
    balance: 999999,
    upi: "admin@ironwallet",
    age: 99,
    contacts: {},
    known_recipients: new Set([]),
    verified: true,
    risk_score: 0,
    freeze_count: 0,
    frozen_until: null,
    permanent_frozen: false,
    cooldown_until: null,
    blocked_attempts: 0,
    bypass_attempts: 0,
    recent_blocks: [],
    risk_score_history: [],
    isAdmin: true
  }
};


// ═══ SEED DATA ═══

/* ═══ SEED TRANSACTIONS with more variety ═══ */
const SEED_TXS = [
  {id:101, to:"Farhan Farooqui", toNum:"9766876442", upi:"farhan@ironwallet", amt:9500, date:"14 Mar 25", time:"23:41", risk:78, status:"verified", type:"debit", note:"Rent payment", risk_tag:"otp", otp_used:true},
  {id:102, to:"Mehul Patil", toNum:"9876543210", upi:"mehul@ironwallet", amt:500, date:"13 Mar 25", time:"14:22", risk:12, status:"success", type:"debit", note:"Coffee", risk_tag:"normal", otp_used:false},
  {id:103, to:"Vedant Deshmukh", toNum:"9699189866", upi:"vedant@ironwallet", amt:15000, date:"12 Mar 25", time:"09:05", risk:91, status:"blocked", type:"debit", note:"Investment", risk_tag:"block", otp_used:false},
  {id:104, from:"Pranav Chopade", fromNum:"9158763151", upi:"pranav@ironwallet", amt:3000, date:"11 Mar 25", time:"18:30", risk:5, status:"success", type:"credit", note:"Split bill", risk_tag:"normal", otp_used:false},
  {id:105, to:"Unknown Merchant", toNum:"9999999999", upi:"merchant@upi", amt:2200, date:"10 Mar 25", time:"02:15", risk:85, status:"verified", type:"debit", note:"Online purchase", risk_tag:"otp", otp_used:true},
  {id:106, from:"Mehul Patil", fromNum:"9876543210", upi:"mehul@ironwallet", amt:800, date:"09 Mar 25", time:"11:00", risk:8, status:"success", type:"credit", note:"Lunch share", risk_tag:"normal", otp_used:false},
  {id:107, to:"Chirayu Mahajan", toNum:"9340228345", upi:"chirayu@ironwallet", amt:1200, date:"08 Mar 25", time:"16:45", risk:22, status:"success", type:"debit", note:"Movie tickets", risk_tag:"normal", otp_used:false},
  {id:108, to:"Rajesh Kumar", toNum:"9988776655", upi:"rajesh@ironwallet", amt:2500, date:"07 Mar 25", time:"10:30", risk:18, status:"success", type:"debit", note:"Dinner", risk_tag:"normal", otp_used:false},
  {id:109, from:"Amit Sharma", fromNum:"9123456789", upi:"amit@ironwallet", amt:1500, date:"06 Mar 25", time:"19:45", risk:7, status:"success", type:"credit", note:"Gift", risk_tag:"normal", otp_used:false},
  {id:110, to:"Sneha Reddy", toNum:"8899776655", upi:"sneha@ironwallet", amt:3500, date:"05 Mar 25", time:"13:20", risk:45, status:"verified", type:"debit", note:"Shopping", risk_tag:"info", otp_used:true},
  {id:111, from:"Vikram Singh", fromNum:"7778889990", upi:"vikram@ironwallet", amt:5000, date:"04 Mar 25", time:"15:10", risk:15, status:"success", type:"credit", note:"Reimbursement", risk_tag:"normal", otp_used:false},
  {id:112, to:"Irfan Khan", toNum:"9988001122", upi:"irfan@ironwallet", amt:750, date:"03 Mar 25", time:"12:00", risk:28, status:"success", type:"debit", note:"Tea", risk_tag:"normal", otp_used:false},
  {id:113, from:"Zara Sheikh", fromNum:"9663355221", upi:"zara@ironwallet", amt:1200, date:"02 Mar 25", time:"17:30", risk:9, status:"success", type:"credit", note:"Gift", risk_tag:"normal", otp_used:false},
  {id:114, to:"Rohan Deshmukh", toNum:"8765432109", upi:"rohan@ironwallet", amt:850, date:"01 Mar 25", time:"11:15", risk:32, status:"success", type:"debit", note:"Lunch", risk_tag:"normal", otp_used:false},
  {id:115, from:"Kavita Sharma", fromNum:"7654321098", upi:"kavita@ironwallet", amt:2300, date:"28 Feb 25", time:"20:45", risk:11, status:"success", type:"credit", note:"Payment", risk_tag:"normal", otp_used:false},
  {id:116, to:"Chirayu Mahajan", toNum:"9340228345", upi:"chirayu@ironwallet", amt:4500, date:"27 Feb 25", time:"09:30", risk:68, status:"verified", type:"debit", note:"Bill split", risk_tag:"info", otp_used:true},
  {id:117, to:"Pranav Chopade", toNum:"9158763151", upi:"pranav@ironwallet", amt:1800, date:"26 Feb 25", time:"16:00", risk:24, status:"success", type:"debit", note:"Snacks", risk_tag:"normal", otp_used:false},
];

const SEED_REQS = [
  {id:1, from:"Farhan Farooqui", fromNum:"9766876442", upi:"farhan@ironwallet", amt:4500, reason:"Project contribution", ago:"2h ago", risk:55, status:"pending"},
  {id:2, from:"Unknown Sender", fromNum:"9999999999", upi:"prize@lucky.upi", amt:999, reason:"Lucky draw processing", ago:"5h ago", risk:96, status:"pending"},
  {id:3, from:"Mehul Patil", fromNum:"9876543210", upi:"mehul@ironwallet", amt:650, reason:"Dinner split", ago:"1d ago", risk:14, status:"pending"},
  {id:4, from:"Rajesh Kumar", fromNum:"9988776655", upi:"rajesh@ironwallet", amt:12000, reason:"Emergency loan", ago:"30m ago", risk:82, status:"pending"},
  {id:5, from:"Sneha Reddy", fromNum:"8899776655", upi:"sneha@ironwallet", amt:350, reason:"Coffee", ago:"45m ago", risk:8, status:"pending"},
  {id:6, from:"Vikram Singh", fromNum:"7778889990", upi:"vikram@ironwallet", amt:5000, reason:"Business payment", ago:"3h ago", risk:38, status:"pending"},
  {id:7, from:"Unknown Sender", fromNum:"9111111111", upi:"refund@claim.upi", amt:15000, reason:"Tax refund processing", ago:"1h ago", risk:94, status:"pending"},
  {id:999, from:"Unknown Sender", fromNum:"9111111111", upi:"fraud@upi", amt:15000, reason:"Refund processing fee", ago:"10m ago", risk:95, status:"pending"},
];


// ═══ HELPERS ═══

/* ═══ HELPERS ═══ */
function nowStamp(){
  const d=new Date();
  return{
    date:d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"}).replace(/ /g," "),
    time:d.toTimeString().slice(0,5)
  };
}

function riskMeta(s){
  if(s<=60) return{color:"#166534",bg:"#dcfce7",border:"#86efac",label:"🟢 Safe", dot:"#22c55e", tier:"normal"};
  if(s<=80) return{color:"#92400e",bg:"#fef3c7",border:"#fcd34d",label:"🟡 Caution", dot:"#f59e0b", tier:"info"};
  if(s<=94) return{color:"#9a3412",bg:"#fff7ed",border:"#fdba74",label:"🟠 Suspicious", dot:"#f97316", tier:"otp"};
  return {color:"#991b1b",bg:"#fef2f2",border:"#fca5a5",label:"🔴 High Risk", dot:"#ef4444", tier:"block"};
}

/* ═══ SHARED UI ═══ */