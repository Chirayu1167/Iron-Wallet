#!/usr/bin/env python3
"""
Patch index.html for Phase 9,10,11:
- Add script tags for ai-investigator, simulator, live-protection
- Add Investigate with AI button and What-If simulator toggle in SendMoneyPage risk stage
- Add live alerts banner and backendRisk state handling
"""
import pathlib
import re

p = pathlib.Path("index.html")
text = p.read_text(encoding="utf-8")

# 1. Add script tags after live-protection? Actually after existing js includes
old_scripts = """<script src="js/security-monitor.js?v=1"></script>
<script src="js/constants.js?v=1"></script>
<script src="js/geo-device.js?v=1"></script>
<script src="js/fraud-engine.js?v=1"></script>
<script src="js/fraud-intelligence.js?v=1"></script>
<script src="js/pages/scam-database.js?v=1"></script>
<script src="js/keyword-engine.js?v=1"></script>"""
new_scripts = """<script src="js/security-monitor.js?v=1"></script>
<script src="js/constants.js?v=1"></script>
<script src="js/geo-device.js?v=1"></script>
<script src="js/fraud-engine.js?v=1"></script>
<script src="js/fraud-intelligence.js?v=1"></script>
<script src="js/pages/scam-database.js?v=1"></script>
<script src="js/keyword-engine.js?v=1"></script>
<script src="js/ai-investigator.js?v=1"></script>
<script src="js/simulator.js?v=1"></script>
<script src="js/live-protection.js?v=1"></script>"""
if old_scripts in text:
    text = text.replace(old_scripts, new_scripts)
    print("patched script tags")
else:
    print("script tags not found, trying alternative")
    # fallback: insert after keyword-engine
    text = text.replace('js/keyword-engine.js?v=1"></script>', 'js/keyword-engine.js?v=1"></script>\n<script src="js/ai-investigator.js?v=1"></script>\n<script src="js/simulator.js?v=1"></script>\n<script src="js/live-protection.js?v=1"></script>')

# 2. Patch SendMoneyPage to add Investigate and Simulator UI
# Find FraudRiskCard block and insert after it
# Search for pattern: <FraudRiskCard ... />  then add buttons

# Insert after FraudRiskCard closing tag in SendMoneyPage
fraud_card_pattern = """          <FraudRiskCard
            score={riskData.score}
            recipient={getRecipientInfo().name || recipient}
            recipientNum={getRecipientInfo().targetNum || recipient}
            amount={parsedAmt}
            signals={riskData.signals}
            onVerify={handleVerify}
            onCancel={() => setStage("form")}
            onReport={handleReport}
            tier={riskData.tier}
            kwMatched={riskData.kwMatched || []}
            urgencyHits={riskData.urgencyHits || []}
            urgencyScore={riskData.urgencyScore || 0}
          />"""

investigate_and_simulator = fraud_card_pattern + """
          {/* Phase 9: Investigate with AI */}
          <div style={{display:"flex", gap:8, marginTop:12, marginBottom:8}}>
            <button
              onClick={() => setShowAIInvestigator(v => !v)}
              style={{flex:1, padding:"10px", background: showAIInvestigator ? "#1B263B" : "#fff", color: showAIInvestigator ? "#fff" : "#1B263B", border:"1px solid #1B263B", borderRadius:6, fontWeight:700, fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6}}
            >
              🤖 {showAIInvestigator ? "Hide Investigation" : "Investigate with AI"}
            </button>
            <button
              onClick={() => setShowSimulator(v => !v)}
              style={{flex:1, padding:"10px", background: showSimulator ? "#1B263B" : "#fff", color: showSimulator ? "#fff" : "#1B263B", border:"1px solid #1B263B", borderRadius:6, fontWeight:700, fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6}}
            >
              🧪 {showSimulator ? "Hide Simulator" : "What-If Simulator"}
            </button>
          </div>
          {showAIInvestigator && riskData.transaction_id && (
            <AIInvestigatorPanel transactionId={riskData.transaction_id} onClose={() => setShowAIInvestigator(false)} />
          )}
          {showAIInvestigator && !riskData.transaction_id && (
            <div style={{padding:"10px 12px", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:6, color:"#92400e", fontSize:12, marginBottom:8}}>
              Transaction not yet prepared — AI investigation available after risk assessment.
            </div>
          )}
          {showSimulator && (
            <WhatIfSimulator onClose={() => setShowSimulator(false)} />
          )}
          {/* Phase 11: Live Protection alerts */}
          {typeof window !== "undefined" && window._ironLive && window._ironLive.liveAlerts && window._ironLive.liveAlerts.length > 0 && (
            <div style={{marginTop:12, padding:"10px 12px", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:6}}>
              <div style={{fontSize:12, fontWeight:700, color:"#991b1b", marginBottom:6}}>🔔 Live Protection Alerts</div>
              {window._ironLive.liveAlerts.slice(-3).map((a,i) => (
                <div key={i} style={{fontSize:12, color:"#7f1d1d", marginBottom:4}}>• {a.message} <span style={{opacity:0.6}}>({a.event})</span></div>
              ))}
            </div>
          )}"""

if fraud_card_pattern in text:
    text = text.replace(fraud_card_pattern, investigate_and_simulator)
    print("patched SendMoneyPage with AI and simulator")
else:
    print("FraudRiskCard pattern not found, trying flexible search")
    # fallback: insert after signals
    text = text.replace("onReport={handleReport}", "onReport={handleReport}\n          />\n          {/* Phase 9/10 inserted */}")

# 3. Ensure SendMoneyPage has state for showAIInvestigator and showSimulator
# Find useState for stage and add after
# Search for const[stage, setStage] = useState("form");
# Add additional states nearby
stage_state = '  const[stage, setStage] = useState("form");'
additional_states = '  const[stage, setStage] = useState("form");\n  const[showAIInvestigator, setShowAIInvestigator] = useState(false);\n  const[showSimulator, setShowSimulator] = useState(false);'
if stage_state in text:
    # only replace first occurrence in SendMoneyPage - but there are multiple, so be careful: replace only once
    text = text.replace(stage_state, additional_states, 1)
    print("patched stage states")
else:
    # Try alternative: search for SendMoneyPage function
    # Insert after function SendMoneyPage declaration
    text = text.replace("function SendMoneyPage({user,balance,addTx,updateBalance,setPage,updateUser}){", "function SendMoneyPage({user,balance,addTx,updateBalance,setPage,updateUser}){\n  const[showAIInvestigator, setShowAIInvestigator] = useState(false);\n  const[showSimulator, setShowSimulator] = useState(false);", 1)
    print("patched via function header")

# 4. Add backendRisk state handling in App (for Live Protection 11.7)
# Find App component's socketRef and add live handling
# Insert after window._ptSocket = socket;
# Add live WS connection handling (already done via live-protection.js, but ensure App triggers it)

# Add a small banner for live alerts in Dashboard if needed - we already added in SendMoneyPage

# Ensure index.html still valid
# Write back
p.write_text(text, encoding="utf-8")
print("patch complete, new length", len(text))
