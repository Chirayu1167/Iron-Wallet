#!/usr/bin/env python3
import pathlib, re

p = pathlib.Path("index.html")
text = p.read_text(encoding="utf-8")
orig = text

# 1. Update script tags: make JSX files type="text/babel" and add new components
old = """<script src="js/ai-investigator.js?v=1"></script>
<script src="js/simulator.js?v=1"></script>
<script src="js/live-protection.js?v=1"></script>"""
new = """<script type="text/babel" src="js/ai-investigator.js?v=1"></script>
<script type="text/babel" src="js/simulator.js?v=1"></script>
<script src="js/live-protection.js?v=1"></script>
<script type="text/babel" src="js/protection-center.js?v=1"></script>
<script type="text/babel" src="js/security-center.js?v=1"></script>
<script type="text/babel" src="js/risk-components.js?v=1"></script>"""
if old in text:
    text = text.replace(old, new)
    print("patched script tags with new components")
else:
    # fallback try without type
    if 'js/ai-investigator.js' in text and 'js/protection-center.js' not in text:
        text = text.replace('js/live-protection.js?v=1"></script>', 'js/live-protection.js?v=1"></script>\n<script type="text/babel" src="js/protection-center.js?v=1"></script>\n<script type="text/babel" src="js/security-center.js?v=1"></script>\n<script type="text/babel" src="js/risk-components.js?v=1"></script>')
        # also convert existing to babel
        text = text.replace('<script src="js/ai-investigator.js', '<script type="text/babel" src="js/ai-investigator.js')
        text = text.replace('<script src="js/simulator.js', '<script type="text/babel" src="js/simulator.js')
        print("fallback patched scripts")

# 2. Fix Dock to include Protection and Security Center
# Replace NAV array in layout
dock_old = """  const NAV = [
    { id: "dashboard",     label: "Dashboard",     icon: Ic.home,  isNav: true  },
    { id: "send",          label: "Send Money",    icon: Ic.send,  isNav: true  },
    { id: "request-money", label: "Request Money", icon: Ic.rupee, isNav: true  },
    { id: "requests",      label: "Pay Requests",  icon: Ic.bell,  isNav: true, badge: pendingCount },
    { id: "history",       label: "History",       icon: Ic.clock, isNav: true  },
    { id: "profile",       label: "Profile",       icon: Ic.user,  isNav: true  },
  ];"""
dock_new = """  const NAV = [
    { id: "dashboard",     label: "Dashboard",     icon: Ic.home,  isNav: true  },
    { id: "send",          label: "Send Money",    icon: Ic.send,  isNav: true  },
    { id: "request-money", label: "Request Money", icon: Ic.rupee, isNav: true  },
    { id: "requests",      label: "Pay Requests",  icon: Ic.bell,  isNav: true, badge: pendingCount },
    { id: "history",       label: "History",       icon: Ic.clock, isNav: true  },
    { id: "protection",    label: "Protection",    icon: Ic.shield, isNav: true  },
    { id: "security",      label: "Security",      icon: Ic.lock, isNav: true  },
    { id: "profile",       label: "Profile",       icon: Ic.user,  isNav: true  },
  ];"""
if dock_old in text:
    text = text.replace(dock_old, dock_new)
    print("patched Dock NAV")
else:
    print("Dock NAV not found - check layout")

# Also need to handle narrow label mapping for new items
# Find label mapping ternary in Dock
narrow_old = """              <span style={{ fontSize: 10, fontWeight: active ? 800 : 500 }}>
                {n.label === "Dashboard" ? "Home"
                  : n.label === "Send Money" ? "Send"
                  : n.label === "Request Money" ? "Request"
                  : n.label === "Pay Requests" ? "Pay Req"
                  : n.label === "History" ? "History"
                  : n.label === "Profile" ? "Profile"
                  : n.label}
              </span>"""
narrow_new = """              <span style={{ fontSize: 10, fontWeight: active ? 800 : 500 }}>
                {n.label === "Dashboard" ? "Home"
                  : n.label === "Send Money" ? "Send"
                  : n.label === "Request Money" ? "Request"
                  : n.label === "Pay Requests" ? "Pay Req"
                  : n.label === "History" ? "History"
                  : n.label === "Protection" ? "Protect"
                  : n.label === "Security" ? "Security"
                  : n.label === "Profile" ? "Profile"
                  : n.label}
              </span>"""
if narrow_old in text:
    text = text.replace(narrow_old, narrow_new)
    print("patched Dock narrow labels")

# 3. Add routes for protection/security in App pp rendering
# Find: {page === "profile"       && <ProfilePage {...pp}/>}
profile_line = '{page === "profile"       && <ProfilePage {...pp}/>}'
protection_routes = '{page === "profile"       && <ProfilePage {...pp}/>}\n            {page === "protection"    && <ProtectionCenter user={user} txs={txs} setPage={setPage}/>}\n            {page === "security"      && <SecurityCenter user={user} setPage={setPage}/>}'
if profile_line in text:
    text = text.replace(profile_line, protection_routes)
    print("patched App routes")
else:
    print("App routes not found")

# 4. Remove blocking manual freeze from Dashboard and SendMoneyPage
# Replace Dashboard manual freeze Quick Action button - change to Protection Center shortcut instead of freeze
# Find the Quick Actions array in Dashboard
# Replace the freeze entry
dashboard_freeze_old = """          {label: manualFrozen ? "Unfreeze" : "Freeze",
           ico: manualFrozen
              ? (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>)
              : (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>),
           fn: () => manualFrozen ? setShowUnfreezePin(true) : setShowFreezeConfirm(true),
           danger: !manualFrozen},"""
dashboard_freeze_new = """          {label:"Protection", ico:Ic.shield("#1A56DB"), fn:()=>setPage("protection")},
          {label:"Security", ico:Ic.lock("#1A56DB"), fn:()=>setPage("security")},"""
if dashboard_freeze_old in text:
    text = text.replace(dashboard_freeze_old, dashboard_freeze_new)
    print("patched Dashboard quick actions - removed freeze")
else:
    print("Dashboard freeze action not found")

# Also remove ManualFreezeBanner and Manual freeze modals logic - replace with non-blocking notice
# Keep the state but make it non-blocking: replace handleFreezeConfirm to just show toast not freeze
# Find ManualFreezeBanner usage
# Replace {manualFrozen && ( <ManualFreezeBanner ... ) } with comment
if "{manualFrozen && (" in text:
    text = text.replace("{manualFrozen && (\n        <ManualFreezeBanner onUnfreeze={() => setShowUnfreezePin(true)} />\n      )}", "{/* IRON never blocks — manual freeze removed; protection via warnings only */}")
    print("removed ManualFreezeBanner usage")

# Remove SendMoneyPage manual freeze guard that blocks payment
# Pattern: if (localStorage.getItem("iw_manual_freeze_" + user.number) === "1") { setStage("frozen"); return; }
freeze_guard = '    if (localStorage.getItem("iw_manual_freeze_" + user.number) === "1") {\n      setStage("frozen");\n      return;\n    }'
freeze_guard2 = '  const _freezeKey = "iw_manual_freeze_" + user.number;\n    if (localStorage.getItem(_freezeKey) === "1") {\n      setStage("frozen");\n      return;\n    }'
# Remove both guards - replace with non-blocking warning (just log)
if freeze_guard in text:
    text = text.replace(freeze_guard, '    // IRON never blocks — freeze is evidence only; proceed with warning\n    if (localStorage.getItem("iw_manual_freeze_" + user.number) === "1") {\n      console.warn("Manual freeze flag present — treated as HIGH_RISK signal, not a block.");\n    }')
    print("patched first freeze guard")
if freeze_guard2 in text:
    text = text.replace(freeze_guard2, '    // IRON never blocks — freeze is warning only\n    const _freezeKey = "iw_manual_freeze_" + user.number;\n    if (localStorage.getItem(_freezeKey) === "1") {\n      console.warn("Manual freeze flag present — warning only, not blocking.");\n    }')
    print("patched second freeze guard")

# 5. Fix misleading language in various places
# Replace "Blocked" filter in HistoryPage and elsewhere with "High Risk"
# HistoryPage filter buttons: change "blocked" to "high_risk" label but keep func
# In index.html inline history, change filter logic
# Search for if (filter === "blocked")
text = text.replace('if (filter === "blocked") return t.status === "blocked";', 'if (filter === "blocked") return t.status === "high_risk" || t.status === "blocked";')
text = text.replace('if (filter === "blocked") return t.status === "high_risk" || t.status === "blocked";', 'if (filter === "high_risk") return t.status === "high_risk" || t.status === "blocked";')
# But keep backward compat: support both
# Add both checks
if 'if (filter === "high_risk")' not in text:
    text = text.replace('if (filter === "blocked")', 'if (filter === "high_risk" || filter === "blocked")')

# Change button labels from Blocked to High Risk
text = text.replace('"flagged","blocked","otp"', '"flagged","high_risk","otp"')
text = text.replace('["all","debit","credit","flagged","blocked","otp"]', '["all","debit","credit","flagged","high_risk","otp"]')
text = text.replace('{f.charAt(0).toUpperCase() + f.slice(1)}', '{f==="high_risk"?"High Risk": f.charAt(0).toUpperCase() + f.slice(1)}')

# Replace status display "Blocked" with "High Risk"
text = text.replace('{tx.status==="success"?"Success":tx.status==="blocked"?"Blocked":"Verified"}', '{tx.status==="success"?"Success":(tx.status==="high_risk"||tx.status==="blocked")?"High Risk":"Verified"}')
text = text.replace('{tx.status==="success"?Ic.check("#166534"):tx.status==="blocked"?Ic.x("#dc2626"):Ic.lock("#92400e")}', '{tx.status==="success"?Ic.check("#166534"):(tx.status==="high_risk"||tx.status==="blocked")?Ic.warn("#92400e"):Ic.lock("#92400e")}')
# Also cover t.status variant
text = text.replace('t.status==="blocked"?"Blocked"', 't.status==="high_risk"||t.status==="blocked"?"High Risk"')

# Change table header "Blocked" etc? Already done

# Replace "Account Frozen" modal text if appears - make it warning not block
text = text.replace('Account Frozen', 'High-Risk Flag')
text = text.replace('Outgoing Payments Blocked', 'Review Recommended — Not Blocked')
text = text.replace('This will immediately block all outgoing transfers', 'This will mark outgoing transfers for extra verification. IRON never blocks — you can still proceed after verification.')
text = text.replace('What gets blocked:', 'What gets flagged:')

# Fix PINModal frozen branch: keep but ensure it doesn't actually block
# The PINModal already has non-blocking logic; ensure UI shows warning not freeze seconds
# Remove 5-min freeze text if present outside modal?
# Replace "Account Frozen" inside PINModal with warning
# The PINModal frozen UI is dead code but we patch its title
text = text.replace('<h3 style={{fontWeight:800,fontSize:17,color:"#fff",marginBottom:3}}>Account Frozen</h3>', '<h3 style={{fontWeight:800,fontSize:17,color:"#fff",marginBottom:3}}>High-Risk Flag</h3>')
text = text.replace('Your account is paused for <strong>5 minutes</strong> to protect against unauthorised access.', 'This payment is flagged HIGH_RISK — please verify via OTP. You can still proceed.')

# Fix Cooldown/ Freeze modal titles
text = text.replace('Cooldown active. Please wait', 'Review recommended. You can still proceed — verification helps protect you. Wait')

# 6. Improve SendMoneyPage risk handling to use backend explanation consistently
# Ensure RiskScoreCard is used for SAFE/CAUTION/HIGH_RISK rendering
# We will inject RiskScoreCard into the risk stage if not already present
# For now, add import-like comment

# Ensure index.html has proper API contract comments

# 7. Add loading/error states for protection/security

# Write back
p.write_text(text, encoding="utf-8")
print("patch complete, new length", len(text))
# check diff size
print("original len", len(orig))

