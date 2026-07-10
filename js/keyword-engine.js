// ═══ UPI KEYWORD & PATTERN ANALYSIS ENGINE ═══

/* ═══ KEYWORD RISK ANALYSIS ENGINE ═══ */

/* ═══ UPI KEYWORD & PATTERN ANALYSIS ENGINE ═══ */

// ── Trusted VPA handles (real company official UPI IDs) ──
// These domains/handles are issued by actual companies via NPCI.
// A match here REDUCES suspicion significantly.
const TRUSTED_HANDLES = new Set([
  "paytm","phonepe","gpay","googlepay","amazonpay","bhim","ybl","oksbi","okaxis",
  "okhdfcbank","okicici","upi","razorpay","payu","ccavenue","instamojo","juspay",
  "axisbank","hdfcbank","icicibank","sbibank","kotakbank","indusind","yesbank",
  "airtel","jio","bsnl","npci","idfcfirst","aubank","rbl","federalbank","dbs",
  "payzapp","freecharge","mobikwik","ola","flipkart","myntra","swiggy","zomato",
  "irctc","tatapay","reliancejio","barodampay","unionbank","canarabank","pnb",
]);

// ── Known scam/fake VPA domain suffixes ──
// These handles are commonly spoofed or have no legitimate NPCI registration.
const SCAM_HANDLES = new Set([
  "lucky","prize","winner","claim","refund","support","helpdesk","kyc","verify",
  "alert","update","secure","customer","care","fraud","block","freeze","pin",
  "aadhar","aadhaar","incometax","taxrefund","gov","govt","income","pension",
]);

// ── Scam UPI structural patterns ──
// Returns a score 0-50 based on how suspicious the full UPI structure looks.
function scoreUPIStructure(localPart, handle) {
  let structScore = 0;
  const signals = [];

  // 1. Suspicious handle (domain after @)
  if (SCAM_HANDLES.has(handle)) {
    structScore += 30;
    signals.push(`⚠️ VPA handle "@${handle}" is a known scam-associated domain`);
  }

  // 2. Trusted handle = strong negative signal (reduces risk)
  if (TRUSTED_HANDLES.has(handle)) {
    structScore -= 20; // legitimate company UPI
  }

  // 3. Impersonation patterns — brand names in local part but non-brand handle
  const BRAND_NAMES = ["amazon","flipkart","paytm","phonepe","google","microsoft","apple",
    "sbi","hdfc","icici","kotak","airtel","jio","irdai","sebi","rbi","npci",
    "uidai","irctc","nsdl","epfo","trai","meesho","snapdeal","myntra","ola","uber",
    "zomato","swiggy","dunzo","blinkit","zepto","bigbasket","cred","slice","navi"];
  for (const brand of BRAND_NAMES) {
    if (localPart.includes(brand) && !TRUSTED_HANDLES.has(handle)) {
      structScore += 35;
      signals.push(`⚠️ Impersonates "${brand}" but uses unverified handle "@${handle}"`);
      break;
    }
  }

  // 4. Government impersonation
  const GOV_TERMS = ["govt","gov","government","income","tax","irdai","sebi","rbi","uidai",
    "aadhar","aadhaar","epfo","pf","pension","subsidy","pm","modi","yojana","relief"];
  for (const t of GOV_TERMS) {
    if (localPart.includes(t)) {
      structScore += 40;
      signals.push(`🚨 Impersonates government/regulatory body — extremely common scam tactic`);
      break;
    }
  }

  // 5. Numeric padding (scammers add digits to look unique: support123, refund9087)
  const numMatch = localPart.match(/\d+/);
  if (numMatch && numMatch[0].length >= 3 && structScore > 0) {
    structScore += 8;
    signals.push(`⚠️ Suspicious numeric suffix in UPI ID (common scam pattern)`);
  }

  // 6. Overly long local part with suspicious combo (>18 chars)
  if (localPart.length > 18 && structScore > 10) {
    structScore += 6;
  }

  return { structScore: Math.max(0, Math.min(50, structScore)), structSignals: signals };
}

// ── Common Indian first/last names — safe, skip these tokens ──
const COMMON_NAMES = new Set([
  // First names — male
  "rahul","amit","ravi","raj","sanjay","rohit","deepak","rakesh","mohit","sachin",
  "arjun","vijay","ajay","vinod","manoj","dinesh","sunil","mukesh","pankaj","gaurav",
  "abhishek","akash","harsh","kartik","varun","wasim","xavier","yash","yogesh",
  "aakash","chetan","ishaan","aryan","aarav","dev","manan","neeraj","omkar","parag",
  "ritesh","vivek","nitin","ankit","anil","suresh","ramesh","vikas","farhan","irfan",
  "imran","vedant","chirayu","pranav","mehul","rohan","karan","nikhil","siddharth",
  "tushar","umesh","vikrant","waseem","zeeshan","bhavesh","chirag","dhruv","eshan",
  "faisal","ganesh","hemant","ishan","jatin","krishna","lalit","mihir","narendra",
  "parth","qasim","ramakant","sameer","tarun","umang","vishal","yuvraj","zaheer",
  "aman","bhuvan","darshan","farooq","girish","hitesh","jayesh","kewal","lokesh",
  "mahesh","naresh","prabhat","ranjit","shubham","tilak","uday","vipul","waqar",
  // First names — female
  "priya","neha","anjali","pooja","sunita","kavita","meena","rekha","sita","geeta",
  "shruti","divya","nisha","lata","shweta","tanvi","usha","zeenat","babita","disha",
  "preeti","kiran","manu","sonal","ritu","seema","swati","vandana","radha","lakshmi",
  "sarita","poonam","komal","jyoti","isha","heena","garima","falguni","ekta","deepa",
  "charu","bhavna","ananya","aisha","zoya","yasmin","tara","sunaina","ruchika",
  "priyanka","pallavi","nidhi","muskan","lavanya","kajal","jhanvi","ishita","hina",
  "geetanjali","fatima","esha","devika","chanchal","bharti","arushi","amrita","alka",
  "aditi","zara","simran","mansi","nikita","reena","sonam","meghna","roshni","nalini",
  // Common last names (used as UPI prefix)
  "sharma","verma","gupta","singh","kumar","patel","mehta","joshi","rao","nair",
  "iyer","menon","reddy","naidu","pillai","tiwari","mishra","pandey","dubey","shukla",
  "srivastava","agarwal","bansal","garg","mittal","malhotra","kapoor","chopra","bose",
  "chatterjee","mukherjee","das","dey","roy","ghosh","sen","basu","chakraborty",
  "patil","desai","jain","shah","trivedi","bhatt","chaudhary","yadav","thakur","kaur",
  "gill","sidhu","grewal","bhatia","khanna","arora","sethi","sehgal","anand","bajaj",
  "chawla","dhawan","goel","hooda","juneja","kohli","lal","madan","narang","oberoi",
  // Business-safe words (common in legit UPI IDs)
  "shop","store","mart","traders","enterprises","agency","group","industries",
]);

// ── Weighted suspicious keyword dictionary ──
// ===== EXPANDED: 400+ KEYWORD FRAUD DETECTION DICTIONARY =====
const KEYWORD_WEIGHTS = {
  // ── CRITICAL RISK (score 42–50) ──
  kyc:           { score: 50, tier: "critical", desc: "KYC update fraud" },
  otp:           { score: 48, tier: "critical", desc: "OTP phishing" },
  helpdesk:      { score: 46, tier: "critical", desc: "fake helpdesk" },
  aadhar:        { score: 46, tier: "critical", desc: "Aadhaar phishing" },
  aadhaar:       { score: 46, tier: "critical", desc: "Aadhaar phishing" },
  blocked:       { score: 44, tier: "critical", desc: "account freeze scam" },
  freeze:        { score: 44, tier: "critical", desc: "account freeze scam" },
  suspended:     { score: 44, tier: "critical", desc: "account threat scam" },
  deactivate:    { score: 44, tier: "critical", desc: "account threat scam" },
  loanapp:       { score: 42, tier: "critical", desc: "fake loan app" },
  loanapprove:   { score: 42, tier: "critical", desc: "fake loan approval" },
  screenShare:   { score: 48, tier: "critical", desc: "remote access scam" },
  anydesk:       { score: 50, tier: "critical", desc: "remote access tool scam" },
  teamviewer:    { score: 50, tier: "critical", desc: "remote access tool scam" },
  quicksupport:  { score: 50, tier: "critical", desc: "remote access tool scam" },
  airdrop:       { score: 42, tier: "critical", desc: "fake airdrop scam" },
  credentials:   { score: 46, tier: "critical", desc: "credential phishing" },
  phishing:      { score: 50, tier: "critical", desc: "phishing attack" },
  smishing:      { score: 48, tier: "critical", desc: "SMS phishing" },
  vishing:       { score: 48, tier: "critical", desc: "voice phishing" },
  pigbutchering: { score: 50, tier: "critical", desc: "pig butchering investment scam" },
  ponzi:         { score: 50, tier: "critical", desc: "Ponzi scheme" },
  darkweb:       { score: 50, tier: "critical", desc: "dark web fraud" },
  moneymule:     { score: 50, tier: "critical", desc: "money mule scam" },
  // ── HIGH RISK (score 32–40) ──
  refund:        { score: 48, tier: "critical", desc: "refund scam" },
  refundfee:     { score: 52, tier: "critical", desc: "refund fee fraud" },
  claim:         { score: 42, tier: "critical", desc: "fake prize claim" },
  claimprize:   { score: 55, tier: "critical", desc: "prize claim scam" },
  verify:        { score: 38, tier: "high", desc: "fake verification" },
  support:       { score: 36, tier: "high", desc: "fake support" },
  winner:        { score: 52, tier: "critical", desc: "lottery/prize scam" },
  prize:         { score: 52, tier: "critical", desc: "lottery/prize scam" },
  lottery:       { score: 50, tier: "critical", desc: "lottery fraud" },
  lucky:         { score: 48, tier: "critical", desc: "fake lottery" },
  luckydraw:     { score: 55, tier: "critical", desc: "lucky draw scam" },
  "lucky draw":  { score: 55, tier: "critical", desc: "lucky draw scam" },
  won:           { score: 48, tier: "critical", desc: "prize scam" },
  winning:       { score: 50, tier: "critical", desc: "lottery fraud" },
  cashwin:       { score: 55, tier: "critical", desc: "cash win scam" },
  freewin:       { score: 55, tier: "critical", desc: "free win scam" },
  bank:          { score: 34, tier: "high", desc: "bank impersonation" },
  secure:        { score: 32, tier: "high", desc: "fake security alert" },
  fraud:         { score: 36, tier: "high", desc: "fraud department impersonation" },
  alert:         { score: 34, tier: "high", desc: "fake security alert" },
  update:        { score: 32, tier: "high", desc: "fake account update" },
  pin:           { score: 36, tier: "high", desc: "PIN phishing" },
  password:      { score: 38, tier: "high", desc: "credential phishing" },
  loan:          { score: 32, tier: "high", desc: "fake loan offer" },
  approve:       { score: 30, tier: "high", desc: "fake approval" },
  approved:      { score: 30, tier: "high", desc: "fake approval" },
  lend:          { score: 32, tier: "high", desc: "fake lending" },
  borrow:        { score: 30, tier: "high", desc: "fake borrowing" },
  hack:          { score: 38, tier: "high", desc: "hack/breach scam" },
  hacked:        { score: 40, tier: "high", desc: "account breach scam" },
  leaked:        { score: 36, tier: "high", desc: "data leak scam" },
  compromised:   { score: 38, tier: "high", desc: "account compromise scam" },
  urgent:        { score: 40, tier: "high", desc: "urgency tactic" },
  emergency:     { score: 45, tier: "critical", desc: "fake emergency" },
  emergencies:   { score: 45, tier: "critical", desc: "fake emergency" },
  deadline:      { score: 32, tier: "high", desc: "deadline pressure" },
  expire:        { score: 32, tier: "high", desc: "expiry pressure" },
  expiry:        { score: 32, tier: "high", desc: "expiry pressure" },
  expiring:      { score: 34, tier: "high", desc: "expiry pressure" },
  processingfee: { score: 48, tier: "critical", desc: "processing fee scam" },
  processing:    { score: 40, tier: "high", desc: "fee fraud" },
  fee:           { score: 38, tier: "high", desc: "fee fraud" },
  adminfee:      { score: 50, tier: "critical", desc: "admin fee scam" },
  charge:        { score: 38, tier: "high", desc: "charge fraud" },
  penalty:       { score: 42, tier: "critical", desc: "fake penalty" },
  fine:           { score: 30, tier: "high", desc: "fake fine" },
  seized:        { score: 36, tier: "high", desc: "account seizure scam" },
  lawsuit:       { score: 36, tier: "high", desc: "fake lawsuit" },
  arrest:        { score: 38, tier: "high", desc: "fake arrest threat" },
  criminal:      { score: 36, tier: "high", desc: "fake criminal case" },
  cbi:           { score: 38, tier: "high", desc: "fake CBI officer scam" },
  police:        { score: 36, tier: "high", desc: "fake police officer" },
  cybercell:     { score: 36, tier: "high", desc: "fake cybercrime cell" },
  edi:           { score: 34, tier: "high", desc: "ED/enforcement scam" },
  // ── MEDIUM RISK (score 15–28) ──
  cashback:      { score: 28, tier: "medium", desc: "fake cashback" },
  reward:        { score: 26, tier: "medium", desc: "fake reward" },
  bonus:         { score: 24, tier: "medium", desc: "fake bonus" },
  gift:          { score: 22, tier: "medium", desc: "fake gift" },
  offer:         { score: 20, tier: "medium", desc: "fake offer" },
  free:          { score: 20, tier: "medium", desc: "too-good-to-be-true lure" },
  earn:          { score: 18, tier: "medium", desc: "fake earning scheme" },
  income:        { score: 22, tier: "medium", desc: "fake income scheme" },
  invest:        { score: 18, tier: "medium", desc: "investment scam" },
  profit:        { score: 18, tier: "medium", desc: "investment scam" },
  double:        { score: 26, tier: "medium", desc: "money doubling scam" },
  triple:        { score: 26, tier: "medium", desc: "money tripling scam" },
  instant:       { score: 18, tier: "medium", desc: "urgency lure" },
  fast:          { score: 15, tier: "medium", desc: "urgency tactic" },
  quick:         { score: 15, tier: "medium", desc: "urgency tactic" },
  payment:       { score: 16, tier: "medium", desc: "payment lure" },
  transfer:      { score: 15, tier: "medium", desc: "transfer scam" },
  crypto:        { score: 24, tier: "medium", desc: "crypto investment scam" },
  bitcoin:       { score: 26, tier: "medium", desc: "crypto scam" },
  trading:       { score: 22, tier: "medium", desc: "fake trading scheme" },
  dividend:      { score: 22, tier: "medium", desc: "fake dividend" },
  stock:         { score: 20, tier: "medium", desc: "stock tip scam" },
  forex:         { score: 24, tier: "medium", desc: "forex scam" },
  scheme:        { score: 20, tier: "medium", desc: "scheme scam" },
  job:           { score: 18, tier: "medium", desc: "fake job offer" },
  work:          { score: 15, tier: "medium", desc: "fake work scheme" },
  hiring:        { score: 18, tier: "medium", desc: "fake job offer" },
  recruit:       { score: 18, tier: "medium", desc: "recruitment scam" },
  salary:        { score: 16, tier: "medium", desc: "fake salary scam" },
  grant:         { score: 22, tier: "medium", desc: "fake government grant" },
  subsidy:       { score: 22, tier: "medium", desc: "fake subsidy" },
  covid:         { score: 20, tier: "medium", desc: "COVID relief scam" },
  relief:        { score: 20, tier: "medium", desc: "fake relief fund" },
  fund:          { score: 18, tier: "medium", desc: "fake fund" },
  nri:           { score: 20, tier: "medium", desc: "NRI inheritance scam" },
  inheritance:   { score: 26, tier: "medium", desc: "inheritance scam" },
  property:      { score: 18, tier: "medium", desc: "property scam" },
  tender:        { score: 20, tier: "medium", desc: "fake tender" },
  bid:           { score: 18, tier: "medium", desc: "bid fraud" },
  auction:       { score: 20, tier: "medium", desc: "auction fraud" },
  rate:          { score: 15, tier: "medium", desc: "rate manipulation" },
  deposit:       { score: 16, tier: "medium", desc: "fake deposit" },
  withdraw:      { score: 16, tier: "medium", desc: "withdrawal fraud" },
  limit:         { score: 15, tier: "medium", desc: "limit scam" },
  upgrade:       { score: 18, tier: "medium", desc: "fake upgrade" },
  activate:      { score: 20, tier: "medium", desc: "fake activation" },
  reactivate:    { score: 22, tier: "medium", desc: "reactivation scam" },
  migrate:       { score: 20, tier: "medium", desc: "migration scam" },
  link:          { score: 16, tier: "medium", desc: "phishing link" },
  click:         { score: 15, tier: "medium", desc: "clickbait scam" },
  // ── LOW RISK (score 5–12) ──
  official:      { score: 10, tier: "low", desc: "fake official" },
  service:       { score: 6,  tier: "low", desc: "fake service" },
  care:          { score: 5,  tier: "low", desc: "fake customer care" },
  help:          { score: 6,  tier: "low", desc: "fake help" },
  center:        { score: 5,  tier: "low", desc: "fake center" },
  portal:        { score: 8,  tier: "low", desc: "fake portal" },
  desk:          { score: 7,  tier: "low", desc: "fake desk" },
  agent:         { score: 8,  tier: "low", desc: "fake agent" },
  executive:     { score: 7,  tier: "low", desc: "fake executive" },
  department:    { score: 7,  tier: "low", desc: "fake department" },
  division:      { score: 6,  tier: "low", desc: "fake division" },
  team:          { score: 5,  tier: "low", desc: "fake team" },
  assist:        { score: 6,  tier: "low", desc: "fake assistance" },
  premium:       { score: 8,  tier: "low", desc: "fake premium" },
  platinum:      { score: 8,  tier: "low", desc: "fake platinum" },
  gold:          { score: 6,  tier: "low", desc: "fake gold tier" },
  silver:        { score: 5,  tier: "low", desc: "fake silver tier" },
  vip:           { score: 8,  tier: "low", desc: "fake VIP" },
  member:        { score: 6,  tier: "low", desc: "fake membership" },
  club:          { score: 5,  tier: "low", desc: "fake club" },
  card:          { score: 7,  tier: "low", desc: "fake card offer" },
  credit:        { score: 8,  tier: "low", desc: "fake credit offer" },
  debit:         { score: 7,  tier: "low", desc: "fake debit" },
  wallet:        { score: 6,  tier: "low", desc: "fake wallet" },
  account:       { score: 6,  tier: "low", desc: "account scam" },
  emi:           { score: 7,  tier: "low", desc: "fake EMI" },
  insurance:     { score: 7,  tier: "low", desc: "fake insurance" },
  policy:        { score: 6,  tier: "low", desc: "fake policy" },
  renewal:       { score: 7,  tier: "low", desc: "fake renewal" },
  claim:         { score: 8,  tier: "low", desc: "fake claim" },
  warranty:      { score: 7,  tier: "low", desc: "fake warranty" },
  extend:        { score: 6,  tier: "low", desc: "extension scam" },
  ticket:        { score: 6,  tier: "low", desc: "fake ticket" },
  booking:       { score: 6,  tier: "low", desc: "fake booking" },
  reserve:       { score: 5,  tier: "low", desc: "fake reservation" },
  hotel:         { score: 5,  tier: "low", desc: "hotel scam" },
  tour:          { score: 5,  tier: "low", desc: "tour package scam" },
  vacation:      { score: 5,  tier: "low", desc: "vacation scam" },
  delivery:      { score: 6,  tier: "low", desc: "fake delivery" },
  courier:       { score: 7,  tier: "low", desc: "courier scam" },
  customs:       { score: 8,  tier: "low", desc: "customs clearance scam" },
  parcel:        { score: 6,  tier: "low", desc: "parcel scam" },
  shipment:      { score: 6,  tier: "low", desc: "shipment scam" },
  track:         { score: 5,  tier: "low", desc: "fake tracking" },
  alert:         { score: 6,  tier: "low", desc: "fake alert" },
  notification:  { score: 5,  tier: "low", desc: "fake notification" },
  sms:           { score: 6,  tier: "low", desc: "SMS scam" },
  whatsapp:      { score: 7,  tier: "low", desc: "WhatsApp scam" },
  telegram:      { score: 7,  tier: "low", desc: "Telegram scam" },
  social:        { score: 5,  tier: "low", desc: "social media scam" },
  instagram:     { score: 5,  tier: "low", desc: "Instagram scam" },
  facebook:      { score: 5,  tier: "low", desc: "Facebook scam" },
  youtube:       { score: 5,  tier: "low", desc: "YouTube scam" },
  google:        { score: 6,  tier: "low", desc: "Google impersonation" },
  microsoft:     { score: 6,  tier: "low", desc: "Microsoft impersonation" },
  amazon:        { score: 6,  tier: "low", desc: "Amazon impersonation" },
  flipkart:      { score: 6,  tier: "low", desc: "Flipkart impersonation" },
  meesho:        { score: 6,  tier: "low", desc: "Meesho impersonation" },
  ebay:          { score: 5,  tier: "low", desc: "eBay scam" },
  olx:           { score: 7,  tier: "low", desc: "OLX scam" },
  quikr:         { score: 6,  tier: "low", desc: "Quikr scam" },
  cashier:       { score: 7,  tier: "low", desc: "fake cashier" },
  teller:        { score: 7,  tier: "low", desc: "fake bank teller" },
  branch:        { score: 5,  tier: "low", desc: "fake bank branch" },
  headquarter:   { score: 6,  tier: "low", desc: "fake HQ" },
  rbi:           { score: 8,  tier: "low", desc: "RBI impersonation" },
  sebi:          { score: 8,  tier: "low", desc: "SEBI impersonation" },
  irdai:         { score: 7,  tier: "low", desc: "IRDAI impersonation" },
  epfo:          { score: 7,  tier: "low", desc: "EPFO impersonation" },
  pfund:         { score: 7,  tier: "low", desc: "PF fund scam" },
  pension:       { score: 7,  tier: "low", desc: "pension scam" },
  tax:           { score: 8,  tier: "low", desc: "tax fraud" },
  itr:           { score: 8,  tier: "low", desc: "ITR refund scam" },
  gst:           { score: 7,  tier: "low", desc: "GST scam" },
  income:        { score: 7,  tier: "low", desc: "income tax scam" },
  tds:           { score: 7,  tier: "low", desc: "TDS refund scam" },
  challan:       { score: 6,  tier: "low", desc: "fake challan" },
  notice:        { score: 8,  tier: "low", desc: "fake legal notice" },
  summons:       { score: 8,  tier: "low", desc: "fake summons" },
  warrant:       { score: 9,  tier: "low", desc: "fake warrant" },
  fir:           { score: 8,  tier: "low", desc: "FIR threat" },
  chargesheet:   { score: 8,  tier: "low", desc: "fake chargesheet" },
  investigation: { score: 7,  tier: "low", desc: "fake investigation" },
  inquiry:       { score: 6,  tier: "low", desc: "fake inquiry" },
  audit:         { score: 7,  tier: "low", desc: "fake audit" },
  compliance:    { score: 6,  tier: "low", desc: "fake compliance" },
  kyc2:          { score: 9,  tier: "low", desc: "secondary KYC scam" },
  reverify:      { score: 8,  tier: "low", desc: "reverification scam" },
  rekyc:         { score: 9,  tier: "low", desc: "re-KYC scam" },
  pancard:       { score: 8,  tier: "low", desc: "PAN card phishing" },
  pan:           { score: 7,  tier: "low", desc: "PAN phishing" },
  voter:         { score: 6,  tier: "low", desc: "voter ID scam" },
  driving:       { score: 5,  tier: "low", desc: "driving licence scam" },
  licence:       { score: 5,  tier: "low", desc: "licence scam" },
  passport:      { score: 6,  tier: "low", desc: "passport scam" },
  sim:           { score: 7,  tier: "low", desc: "SIM swap fraud" },
  simswap:       { score: 9,  tier: "low", desc: "SIM swap attack" },
  mobile:        { score: 5,  tier: "low", desc: "fake mobile update" },
  number:        { score: 5,  tier: "low", desc: "number verification scam" },
  register:      { score: 6,  tier: "low", desc: "fake registration" },
  registration:  { score: 6,  tier: "low", desc: "fake registration" },
  enroll:        { score: 6,  tier: "low", desc: "fake enrollment" },
  subscribe:     { score: 5,  tier: "low", desc: "fake subscription" },
  unsubscribe:   { score: 5,  tier: "low", desc: "unsubscribe scam" },
  contest:       { score: 8,  tier: "low", desc: "contest scam" },
  competition:   { score: 7,  tier: "low", desc: "competition scam" },
  survey:        { score: 6,  tier: "low", desc: "survey scam" },
  quiz:          { score: 6,  tier: "low", desc: "quiz prize scam" },
  game:          { score: 5,  tier: "low", desc: "game prize scam" },
  play:          { score: 5,  tier: "low", desc: "game scam" },
  spin:          { score: 7,  tier: "low", desc: "spin-to-win scam" },
  scratch:       { score: 7,  tier: "low", desc: "scratch card scam" },
  jackpot:       { score: 9,  tier: "low", desc: "jackpot scam" },
  mega:          { score: 6,  tier: "low", desc: "mega offer scam" },
  bumper:        { score: 7,  tier: "low", desc: "bumper prize scam" },
  lucky7:        { score: 8,  tier: "low", desc: "lucky number scam" },
  crore:         { score: 8,  tier: "low", desc: "crore prize scam" },
  lakh:          { score: 6,  tier: "low", desc: "lakh prize scam" },
  selected:      { score: 7,  tier: "low", desc: "selection scam" },
  chosen:        { score: 7,  tier: "low", desc: "selection scam" },
  congratulations:{ score: 8, tier: "low", desc: "congrats lure" },
  congratulation: { score: 8, tier: "low", desc: "congrats lure" },
  congrats:      { score: 7,  tier: "low", desc: "congrats lure" },
  opportunity:   { score: 6,  tier: "low", desc: "opportunity scam" },
  exclusive:     { score: 7,  tier: "low", desc: "exclusive offer scam" },
  limited:       { score: 6,  tier: "low", desc: "limited offer scam" },
  special:       { score: 5,  tier: "low", desc: "special offer scam" },
  deal:          { score: 5,  tier: "low", desc: "fake deal" },
  discount:      { score: 5,  tier: "low", desc: "fake discount" },
  coupon:        { score: 5,  tier: "low", desc: "fake coupon" },
  voucher:       { score: 6,  tier: "low", desc: "fake voucher" },
  cash:          { score: 6,  tier: "low", desc: "cash scam" },
  prize2:        { score: 7,  tier: "low", desc: "prize variation" },
  loot:          { score: 6,  tier: "low", desc: "loot scam" },
  maal:          { score: 5,  tier: "low", desc: "suspicious offer" },
  saste:         { score: 5,  tier: "low", desc: "fake cheap offer" },
  bogo:          { score: 5,  tier: "low", desc: "buy-one-get-one scam" },
  processing:    { score: 6,  tier: "low", desc: "processing fee scam" },
  fee:           { score: 6,  tier: "low", desc: "advance fee fraud" },
  charge:        { score: 5,  tier: "low", desc: "fake charge" },
  advance:       { score: 7,  tier: "low", desc: "advance fee fraud" },
  token:         { score: 7,  tier: "low", desc: "token money scam" },
  booking2:      { score: 6,  tier: "low", desc: "booking advance scam" },
  registration2: { score: 6,  tier: "low", desc: "registration fee scam" },
  admin:         { score: 5,  tier: "low", desc: "admin fee scam" },
  maintenance:   { score: 5,  tier: "low", desc: "maintenance scam" },
  technical:     { score: 5,  tier: "low", desc: "technical support scam" },
  error:         { score: 6,  tier: "low", desc: "fake error" },
  fix:           { score: 5,  tier: "low", desc: "fake fix" },
  install:       { score: 6,  tier: "low", desc: "fake app install" },
  download:      { score: 6,  tier: "low", desc: "malicious download" },
  app:           { score: 5,  tier: "low", desc: "fake app" },
  software:      { score: 5,  tier: "low", desc: "fake software" },
  virus:         { score: 7,  tier: "low", desc: "virus scam" },
  malware:       { score: 7,  tier: "low", desc: "malware alert scam" },
  hack2:         { score: 7,  tier: "low", desc: "hacking scare" },
  reset:         { score: 6,  tier: "low", desc: "account reset scam" },
  unlock:        { score: 6,  tier: "low", desc: "unlock scam" },
  restore:       { score: 6,  tier: "low", desc: "restore scam" },
  recover:       { score: 7,  tier: "low", desc: "recovery scam" },
  backup:        { score: 5,  tier: "low", desc: "backup scam" },
  cloud:         { score: 5,  tier: "low", desc: "cloud storage scam" },
  storage:       { score: 5,  tier: "low", desc: "storage scam" },
  space:         { score: 5,  tier: "low", desc: "storage space scam" },
  data:          { score: 5,  tier: "low", desc: "data theft" },
  secure2:       { score: 5,  tier: "low", desc: "fake security" },
  protect:       { score: 5,  tier: "low", desc: "fake protection" },
  shield:        { score: 5,  tier: "low", desc: "fake shield" },
  guard:         { score: 5,  tier: "low", desc: "fake guard" },
  safe:          { score: 5,  tier: "low", desc: "fake safe" },
  trust:         { score: 5,  tier: "low", desc: "trust scam" },
  real:          { score: 5,  tier: "low", desc: "fake authenticity claim" },
  genuine:       { score: 5,  tier: "low", desc: "fake genuineness claim" },
  authentic:     { score: 5,  tier: "low", desc: "fake authenticity" },
  certified:     { score: 6,  tier: "low", desc: "fake certification" },
  approved2:     { score: 6,  tier: "low", desc: "fake approval" },
  guaranteed:    { score: 6,  tier: "low", desc: "fake guarantee" },
  insured:       { score: 6,  tier: "low", desc: "fake insurance claim" },
  verify2:       { score: 6,  tier: "low", desc: "verification scam" },
  confirm:       { score: 5,  tier: "low", desc: "confirmation scam" },
  validated:     { score: 6,  tier: "low", desc: "fake validation" },
};
// ===== FEATURE 1: TRANSACTION CATEGORIZATION ENGINE =====
const TX_CATEGORIES = {
  food:      {label:"Food & Dining",    color:"#f97316",bg:"#fff7ed",icon:"🍔",
    kw:["coffee","tea","lunch","dinner","breakfast","food","restaurant","cafe","pizza","biryani","zomato","swiggy","blinkit","zepto","grocer","snack","chai","canteen","mess","tiffin","eat","meal","dhaba","bakery","juice","milk","hotel","eat"]},
  shopping:  {label:"Shopping",         color:"#8b5cf6",bg:"#f5f3ff",icon:"🛍️",
    kw:["shopping","amazon","flipkart","myntra","meesho","clothes","shoes","dress","shirt","saree","bag","watch","gift","purchase","buy","order","market","bazaar","mall","store","shop","book","stationery","amazon"]},
  bills:     {label:"Bills & Utilities", color:"#0078FF",bg:"#e8f1ff",icon:"🧾",
    kw:["electricity","bill","gas","water","broadband","internet","wifi","recharge","mobile","dth","cable","phone","data","utility","plan","connection","maintenance","society","rent","emi","loan","insurance","premium","light","current"]},
  travel:    {label:"Travel",            color:"#22c55e",bg:"#dcfce7",icon:"✈️",
    kw:["travel","irctc","train","bus","auto","cab","ola","uber","rapido","metro","flight","hotel","booking","trip","tour","petrol","diesel","fuel","parking","toll","rickshaw","bike","ride"]},
  health:    {label:"Health & Medical",  color:"#dc2626",bg:"#fef2f2",icon:"🏥",
    kw:["medicine","doctor","hospital","clinic","pharmacy","medical","health","chemist","diagnostic","lab","test","dental","eye","gym","yoga","fitness","wellness","apollo","max"]},
  education: {label:"Education",         color:"#f59e0b",bg:"#fef3c7",icon:"📚",
    kw:["school","college","university","fees","tuition","course","class","library","exam","coaching","academy","education","training","certificate","degree","byju","udemy"]},
  entertainment:{label:"Entertainment",  color:"#ec4899",bg:"#fdf2f8",icon:"🎬",
    kw:["movie","cinema","pvr","inox","netflix","prime","hotstar","spotify","game","play","concert","event","show","ticket","theatre","ott","music","gaming","steam"]},
  transfer:  {label:"Transfers",         color:"#64748b",bg:"#f8faff",icon:"💸",
    kw:["split","share","contribution","advance","deposit","rent","payment","settle","lend","borrow","return","refund","reimbursement","collect","salary","stipend"]},
  other:     {label:"Other",             color:"#94a3b8",bg:"#f8faff",icon:"📦",kw:[]},
  smartguard:{label:"Learn & Play",        color:"#8b5cf6",bg:"#f5f3ff",icon:"🛡️",
    kw:["guard","shield","security","protect","smart"]},
};

function categorizeTx(tx){
  if(!tx||tx.type==="credit") return null;
  const text=((tx.note||"")+" "+(tx.to||"")).toLowerCase();
  for(const[cat,data] of Object.entries(TX_CATEGORIES)){
    if(cat==="other") continue;
    if(data.kw.some(k=>text.includes(k))) return cat;
  }
  return "other";
}

function getFinanceInsights(txs){
  const debits=txs.filter(t=>t.type==="debit"&&t.status!=="blocked");
  const now=new Date();
  const curM=now.getMonth(), curY=now.getFullYear();
  const prevM=curM===0?11:curM-1, prevY=curM===0?curY-1:curY;
  const MONTHS={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

  function parseTxDate(tx){
    const p=tx.date?.split(" ");
    if(!p||p.length<3) return null;
    return {m:MONTHS[p[1]],y:2000+parseInt(p[2])};
  }

  const thisMonth=debits.filter(t=>{const d=parseTxDate(t);return d&&d.m===curM&&d.y===curY;});
  const lastMonth=debits.filter(t=>{const d=parseTxDate(t);return d&&d.m===prevM&&d.y===prevY;});

  function sumByCat(txList){
    const m={};
    for(const tx of txList){const c=categorizeTx(tx)||"other";m[c]=(m[c]||0)+tx.amt;}
    return m;
  }

  const catThis=sumByCat(thisMonth);
  const catLast=sumByCat(lastMonth);
  const totalThis=Object.values(catThis).reduce((s,v)=>s+v,0);
  const totalLast=Object.values(catLast).reduce((s,v)=>s+v,0);
  const sorted=Object.entries(catThis).sort((a,b)=>b[1]-a[1]);

  const insights=[];
  if(sorted.length>0&&sorted[0][1]>0){
    const[cat,amt]=sorted[0];
    const pct=Math.round((amt/Math.max(totalThis,1))*100);
    insights.push({text:`Your highest spending category is ${TX_CATEGORIES[cat]?.label} — ₹${amt.toLocaleString("en-IN")} (${pct}% of total)`,type:"top",icon:"🏆"});
  }
  if(totalThis>0&&totalLast>0){
    const diff=Math.round(((totalThis-totalLast)/totalLast)*100);
    if(diff>0) insights.push({text:`You spent ${diff}% more this month vs last month`,type:"up",icon:"📈"});
    else if(diff<0) insights.push({text:`You spent ${Math.abs(diff)}% less this month — great discipline!`,type:"down",icon:"📉"});
  }
  for(const[cat,amt] of sorted.slice(0,3)){
    const last=catLast[cat]||0;
    if(last>0&&amt>0){
      const d=Math.round(((amt-last)/last)*100);
      if(Math.abs(d)>=20){
        insights.push({text:`You spent ${Math.abs(d)}% ${d>0?"more":"less"} on ${TX_CATEGORIES[cat]?.label} this month`,type:d>0?"up":"down",icon:d>0?"⚠️":"✅"});
      }
    }
  }
  if(thisMonth.length===0) insights.push({text:"No transactions this month yet — your slate is clean!",type:"info",icon:"ℹ️"});

  return{catThis,catLast,totalThis,totalLast,insights,thisMonth,lastMonth,sorted};
}

// ── Typo variants map for fuzzy matching ──
const TYPO_MAP = {
  // refund variants
  refnd:"refund", refudn:"refund", rfund:"refund", rrefund:"refund", refundd:"refund",
  // support variants
  suport:"support", supprt:"support", supoprt:"support", supp0rt:"support",
  // claim variants
  cliam:"claim", claime:"claim",
  // bank variants
  banck:"bank", bnak:"bank", banke:"bank",
  // secure / verify
  secur:"secure", secrure:"secure",
  verift:"verify", veryfy:"verify", verfy:"verify", veriff:"verify",
  // helpdesk variants
  helpdsk:"helpdesk", helpdes:"helpdesk", helpdesc:"helpdesk",
  // cashback variants
  cashbak:"cashback", cashbck:"cashback", cashbac:"cashback",
  // reward / offer
  reword:"reward", rewrd:"reward",
  offr:"offer", offfer:"offer", ofr:"offer",
  // otp / kyc
  ot0p:"otp",
  // loan variants
  laon:"loan", lona:"loan",
  // winner / prize
  winnerr:"winner", winnr:"winner",
  priize:"prize", prze:"prize",
  // urgent / instant
  urgnt:"urgent", urjent:"urgent",
  insant:"instant", instnat:"instant",
  // aadhar
  adhar:"aadhar", adhaar:"aadhaar", aadhar:"aadhaar",
  // misc
  quik:"quick", quck:"quick",
  servic:"service", srvice:"service",
  paymnt:"payment", paymet:"payment",
  transfr:"transfer", tranfer:"transfer",
  gifft:"gift", giift:"gift",
  fre3:"free", fr33:"free",
};

/**
 * Levenshtein distance — fallback fuzzy match.
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m + 1}, (_, i) =>
    Array.from({length: n + 1}, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

/**
 * Resolve a token to a canonical suspicious keyword.
 * Order: exact → typo map → Levenshtein ≤ 2 (length-gated for speed).
 */
function resolveToken(token) {
  if (KEYWORD_WEIGHTS[token]) return token;
  if (TYPO_MAP[token] && KEYWORD_WEIGHTS[TYPO_MAP[token]]) return TYPO_MAP[token];
  for (const kw of Object.keys(KEYWORD_WEIGHTS)) {
    if (Math.abs(token.length - kw.length) <= 2 && levenshtein(token, kw) <= 2)
      return kw;
  }
  return null;
}

/**
 * Split a UPI local-part into tokens:
 *   - camelCase split first: "amazonSupport" → ["amazon","Support"]
 *   - then split on digits, underscores, dots, hyphens
 */
function tokenizeUPI(localPart) {
  const camelSplit = localPart.replace(/([a-z])([A-Z])/g, '$1 $2');
  const raw = camelSplit.split(/[\d_.\-\s]+/).filter(Boolean);
  return raw.map(t => t.toLowerCase()).filter(t => t.length >= 2);
}

/**
 * FALSE-POSITIVE GUARD: returns true if this UPI looks like a real person/business.
 * Used to suppress low-tier keyword hits on innocent IDs.
 * e.g. "service" in "suresh.services@oksbi" should not trigger — it's a business name
 * on a trusted handle.
 */
function isBenignContext(localPart, handle, tokens, matchedKeywords) {
  // Trusted handle → only block critical/high, suppress low/medium
  if (TRUSTED_HANDLES.has(handle)) return true;
  // If the ONLY hit is low-tier and the local part looks like a real name + word, suppress
  const allLow = matchedKeywords.every(m => m.tier === "low");
  if (allLow && tokens.some(t => COMMON_NAMES.has(t))) return true;
  return false;
}

/**
 * Main UPI analysis function.
 * Combines: keyword scan + structural pattern scoring + domain analysis.
 * @param {string} upiId  full UPI ID e.g. "amazon-support9087@lucky"
 * @returns {{ keywordScore: number, signals: string[], matchedKeywords: object[] }}
 */
function analyzeUPIKeywords(upiId) {
  if (!upiId || !upiId.includes("@"))
    return { keywordScore: 0, signals: [], matchedKeywords: [] };

  const [localRaw, handle] = upiId.split("@");
  const localPart = localRaw.toLowerCase();
  const tokens = tokenizeUPI(localPart);

  // ── 1. Keyword scan ──
  const seen = new Set();
  const matched = [];
  let rawKwScore = 0;

  for (const token of tokens) {
    if (COMMON_NAMES.has(token)) continue;
    const canonical = resolveToken(token);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      const meta = KEYWORD_WEIGHTS[canonical];
      matched.push({ word: token, canonical, tier: meta.tier, score: meta.score, desc: meta.desc });
      rawKwScore += meta.score;
    }
  }

  // ── 2. False-positive guard ──
  // Suppress benign contexts (real person on trusted handle, lone low-tier hit)
  if (matched.length > 0 && isBenignContext(localPart, handle, tokens, matched)) {
    return { keywordScore: 0, signals: [], matchedKeywords: [] };
  }

  // ── 3. Structural / domain pattern score ──
  const { structScore, structSignals } = scoreUPIStructure(localPart, handle);

  // ── 4. Combine — keyword capped at 50, struct capped at 50, total capped at 80 ──
  const kwScore  = Math.min(rawKwScore, 50);
  const combined = Math.min(kwScore + structScore, 80);

  // ── 5. Build user-facing signals ──
  const signals = [...structSignals];

  if (matched.length === 0 && structSignals.length === 0)
    return { keywordScore: 0, signals: [], matchedKeywords: [] };

  const critical = matched.filter(m => m.tier === "critical");
  const high     = matched.filter(m => m.tier === "high");
  const medium   = matched.filter(m => m.tier === "medium");

  if (critical.length > 0) {
    const names = critical.map(m => `"${m.canonical}"`).join(", ");
    signals.push(`🚨 Critical scam keyword(s) in UPI ID: ${names} — this is a near-certain fraud pattern`);
  } else if (matched.length >= 3) {
    const names = matched.slice(0,3).map(m => `"${m.canonical}"`).join(", ");
    signals.push(`🚨 Multiple scam keywords detected: ${names} — highly suspicious UPI ID`);
  } else if (matched.length === 2) {
    const names = matched.map(m => `"${m.canonical}"`).join(" + ");
    signals.push(`⚠️ Two suspicious keywords in UPI ID: ${names}`);
  } else if (high.length === 1) {
    const kw = high[0];
    const display = kw.word !== kw.canonical ? `"${kw.word}" (≈${kw.canonical})` : `"${kw.canonical}"`;
    signals.push(`⚠️ High-risk keyword in UPI ID: ${display} — ${kw.desc}`);
  } else if (medium.length >= 1) {
    const kw = medium[0];
    const display = kw.word !== kw.canonical ? `"${kw.word}" (≈${kw.canonical})` : `"${kw.canonical}"`;
    signals.push(`⚠️ Suspicious term in UPI ID: ${display} — ${kw.desc}`);
  } else if (matched.length >= 1 && structScore === 0) {
    // Low-tier only, no structural red flags → very mild signal
    const kw = matched[0];
    signals.push(`ℹ️ UPI ID contains term "${kw.canonical}" — verify recipient before paying`);
  }

  return { keywordScore: combined, signals, matchedKeywords: matched };
}

/* ═══ FRAUD DETECTION ENGINE ═══ */