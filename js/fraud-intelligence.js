/* ═══════════════════════════════════════════════════════════════════════════
   IRONWALLET  —  FRAUD INTELLIGENCE LAYER  (Stage 2 Frontend)
   fraud-intelligence.js  v3.0

   Pipeline
   ────────
   1. callBehaviorScore()     → POST /behavior-score  (Stage 1 – Isolation Forest)
   2. callFraudIntelligence() → POST /fraud-intelligence (Stage 2 – Pattern Engine)
   3. callAnalyze()           → POST /analyze          (both stages, one call)
   4. mergeFinalRisk()        → blends Stage1 + Stage2 → final score

   UI Components
   ─────────────
   FraudIntelPanel   – renders Stage 2 results below FraudRiskCard
   FinalRiskBadge    – shows blended Stage1 + Stage2 score with delta
   ════════════════════════════════════════════════════════════════════════ */

const API_BASE = (typeof API !== "undefined" && API) ? API : "";

// ── Severity display metadata ─────────────────────────────────────────────────
const SEVERITY_META = {
  CRITICAL: { color:"#7c3aed", bg:"#f5f3ff", border:"#c4b5fd", emoji:"🚨", label:"Critical" },
  HIGH:     { color:"#dc2626", bg:"#fef2f2", border:"#fca5a5", emoji:"🔴", label:"High"     },
  MEDIUM:   { color:"#f97316", bg:"#fff7ed", border:"#fdba74", emoji:"🟠", label:"Medium"   },
  LOW:      { color:"#ca8a04", bg:"#fefce8", border:"#fde047", emoji:"🟡", label:"Low"      },
};

const CATEGORY_ICON = {
  AMOUNT:"💰", RECIPIENT:"👤", TIMING:"🕐", VELOCITY:"⚡",
  BALANCE:"🏦", DEVICE:"📱", LOCATION:"📍", BEHAVIOURAL:"🧠",
};

const RISK_META = {
  LOW:      { color:"#16a34a", bg:"#f0fdf4", bar:"#22c55e", label:"LOW RISK"      },
  MEDIUM:   { color:"#ca8a04", bg:"#fefce8", bar:"#facc15", label:"MEDIUM RISK"   },
  HIGH:     { color:"#ea580c", bg:"#fff7ed", bar:"#f97316", label:"HIGH RISK"     },
  CRITICAL: { color:"#7c3aed", bg:"#f5f3ff", bar:"#a855f7", label:"CRITICAL RISK" },
};


// ═══════════════════════════════════════════════════════════════════════════════
//  API CALLS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Stage 1 — Isolation Forest Behavioural Score
 * Compares this transaction against the user's 12-month history.
 * Returns { behavior_score: 0-100, risk_level, user_found }
 */
async function callBehaviorScore(txnPayload) {
  try {
    const res = await fetch(`${API_BASE}/behavior-score`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(txnPayload),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn("[IronWallet IF] /behavior-score failed:", e);
    return null;
  }
}

/**
 * Stage 2 — Fraud Intelligence Layer
 * Evaluates 20 known fraud patterns against transaction signals.
 * Returns { fraud_score, matched_patterns, confidence, recommended_action, … }
 */
async function callFraudIntelligence(behaviorScore, txnPayload, profilePayload) {
  try {
    const res = await fetch(`${API_BASE}/fraud-intelligence`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        behavior_score: Math.round(behaviorScore),
        transaction:    txnPayload,
        user_profile:   profilePayload,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn("[IronWallet FIL] /fraud-intelligence failed:", e);
    return null;
  }
}

/**
 * Combined — runs both stages server-side in one round-trip.
 * Returns { stage1, stage2, final }
 */
async function callAnalyze(txnPayload, profilePayload) {
  try {
    const res = await fetch(`${API_BASE}/analyze`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ transaction: txnPayload, user_profile: profilePayload }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn("[IronWallet] /analyze failed:", e);
    return null;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  SCORE MERGER  (client-side fallback when using two separate calls)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Weighted blend: Stage1 × 0.45 + Stage2 × 0.55.
 * If Stage2 matched CRITICAL patterns, final score gets a floor of 70.
 */
function mergeFinalRisk(behaviorScore, intelResult) {
  if (!intelResult) {
    return { finalScore: behaviorScore, stage1: behaviorScore,
             stage2: null, delta: 0, riskLevel: _riskLevel(behaviorScore) };
  }
  const s1       = Math.round(behaviorScore);
  const s2       = Math.round(intelResult.fraud_score);
  const critical = (intelResult.signal_summary?.critical_count || 0) > 0;
  let blended    = s1 * 0.45 + s2 * 0.55;
  if (critical) blended = Math.max(blended, 70);
  const finalScore = Math.round(Math.min(100, Math.max(0, blended)));
  return { finalScore, stage1:s1, stage2:s2,
           delta: finalScore - s1, riskLevel: _riskLevel(finalScore) };
}

function _riskLevel(score) {
  if (score <= 30) return "LOW";
  if (score <= 60) return "MEDIUM";
  if (score <= 80) return "HIGH";
  return "CRITICAL";
}


// ═══════════════════════════════════════════════════════════════════════════════
//  REACT COMPONENT — FraudIntelPanel
// ═══════════════════════════════════════════════════════════════════════════════

function FraudIntelPanel({ intelResult, mergedRisk, loading, stage1Score }) {
  const [expanded, setExpanded] = React.useState(false);

  /* Loading skeleton */
  if (loading) {
    return React.createElement("div", {
      style:{
        marginTop:12, padding:"14px 16px",
        background:"#f8faff", borderRadius:12,
        border:"1.5px solid #e2e8f0",
      }
    },
      React.createElement("div", { style:{display:"flex",alignItems:"center",gap:10} },
        React.createElement("div", {
          style:{
            width:28,height:28,borderRadius:"50%",flexShrink:0,
            background:"linear-gradient(135deg,#0078FF,#7c3aed)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
          }
        }, "🔍"),
        React.createElement("div", null,
          React.createElement("div", {
            style:{fontSize:11,fontWeight:800,color:"#0078FF",letterSpacing:.5}
          }, "FRAUD INTELLIGENCE LAYER  ·  STAGE 2"),
          React.createElement("div", {
            style:{fontSize:11,color:"#94a3b8",marginTop:2}
          }, "Matching against 20 known fraud patterns…"),
        ),
      ),
      /* shimmer bars */
      ...[80,55,70].map((w,i) =>
        React.createElement("div", { key:i, style:{
          marginTop:10,height:7,borderRadius:4,
          background:`linear-gradient(90deg,#e2e8f0 ${w}%,#f1f5f9 100%)`,
          opacity: 1 - i*0.15,
        }})
      ),
    );
  }

  if (!intelResult) return null;

  const rl          = RISK_META[intelResult.risk_level] || RISK_META.LOW;
  const hasPatterns = (intelResult.matched_patterns || []).length > 0;
  const patterns    = intelResult.pattern_details || [];
  const behaviorSignals = (intelResult.behavior_signals || [])
    .map(s => typeof s === "string" ? s : s.description)
    .filter(Boolean);

  return React.createElement("div", {
    style:{
      marginTop:12, borderRadius:12, overflow:"hidden",
      border:`1.5px solid ${hasPatterns ? rl.bar : "#d1fae5"}`,
      animation:"slideDown .3s ease",
    }
  },

    /* ── Header ── */
    React.createElement("div", {
      style:{
        padding:"12px 14px",
        background: hasPatterns
          ? `linear-gradient(135deg,${rl.bg},#fff)`
          : "linear-gradient(135deg,#f0fdf4,#fff)",
        display:"flex",alignItems:"center",gap:10,
        borderBottom: expanded ? `1px solid ${rl.border||"#e2e8f0"}` : "none",
      }
    },
      /* icon */
      React.createElement("div", {
        style:{
          width:32,height:32,borderRadius:"50%",flexShrink:0,
          background:"linear-gradient(135deg,#0078FF,#7c3aed)",
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:15, boxShadow:"0 2px 6px rgba(0,120,255,.25)",
        }
      }, "🔍"),

      /* title */
      React.createElement("div", { style:{flex:1,minWidth:0} },
        React.createElement("div", {
          style:{fontSize:10,fontWeight:800,color:"#0078FF",
                 textTransform:"uppercase",letterSpacing:.8,marginBottom:2}
        }, "Adaptive behavioral analysis"),
        React.createElement("div", {
          style:{fontSize:12,fontWeight:700,
                 color: hasPatterns ? rl.color : "#16a34a"}
        }, hasPatterns
          ? `${patterns.length} fraud pattern${patterns.length>1?"s":""} matched`
          : "✓ No known fraud patterns detected"
        ),
      ),

      /* expand toggle */
      hasPatterns && React.createElement("button", {
        onClick: () => setExpanded(e => !e),
        style:{
          background:"rgba(0,120,255,.08)",border:"none",cursor:"pointer",
          fontSize:10,color:"#0078FF",fontWeight:700,
          fontFamily:"'DM Sans',sans-serif",padding:"4px 8px",borderRadius:6,
          flexShrink:0,
        }
      }, expanded ? "Hide ▲" : "Details ▼"),
    ),

    React.createElement("div", { style:{padding:"8px 14px",background:"#fff",fontSize:10,color:"#94a3b8"} },
      `Adaptive review evaluated ${intelResult.signal_summary?.patterns_fired||0} supporting security signals against your recent activity.`,
    ),

    behaviorSignals.length > 0 && React.createElement("div", {
      style:{padding:"10px 14px 4px",background:"#fff"}
    },
      React.createElement("div", {
        style:{fontSize:10,fontWeight:800,color:"#94a3b8",
               textTransform:"uppercase",letterSpacing:.7,marginBottom:7}
      }, "Behavioral context"),
      ...behaviorSignals.slice(0, 5).map((signal, i) =>
        React.createElement("div", {
          key:i,
          style:{fontSize:11,color:"#475569",lineHeight:1.4,padding:"6px 8px",
                 marginBottom:5,background:"#f8faff",border:"1px solid #e2e8f0",
                 borderRadius:6}
        }, signal)
      ),
    ),

    /* ── Expanded detail panel ── */
    expanded && hasPatterns && React.createElement("div", {
      style:{background:"#f8faff",borderTop:"1px solid #e2e8f0"}
    },
      /* Pattern cards */
      React.createElement("div", {style:{padding:"10px 14px 4px"}},
        React.createElement("div", {
          style:{fontSize:10,fontWeight:800,color:"#94a3b8",
                 textTransform:"uppercase",letterSpacing:.7,marginBottom:8}
        }, "Matched Fraud Patterns"),

        ...patterns.map((p, i) => {
          const sm = SEVERITY_META[p.severity] || SEVERITY_META.LOW;
          const ci = CATEGORY_ICON[p.category] || "⚠";
          return React.createElement("div", {
            key:i,
            style:{
              display:"flex",alignItems:"flex-start",gap:10,
              padding:"8px 10px",marginBottom:6,
              background:"#fff",borderRadius:8,border:`1px solid ${sm.border}`,
            }
          },
            /* category icon */
            React.createElement("div", {
              style:{
                width:28,height:28,borderRadius:8,background:sm.bg,
                flexShrink:0,display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:14,
              }
            }, ci),
            /* text */
            React.createElement("div", {style:{flex:1,minWidth:0}},
              React.createElement("div", {
                style:{display:"flex",alignItems:"center",gap:6,marginBottom:2}
              },
                React.createElement("span", {
                  style:{fontSize:12,fontWeight:700,color:"#0f172a"}
                }, p.name),
                React.createElement("span", {
                  style:{
                    fontSize:9,fontWeight:800,color:sm.color,
                    background:sm.bg,padding:"1px 6px",borderRadius:6,
                    border:`1px solid ${sm.border}`,textTransform:"uppercase",
                  }
                }, p.severity),
              ),
              React.createElement("div", {
                style:{fontSize:11,color:"#64748b",lineHeight:1.4}
              }, p.user_message),
            ),
          );
        }),

        /* +N more */
        patterns.length > 5 && React.createElement("div", {
          style:{fontSize:11,color:"#94a3b8",textAlign:"center",
                 padding:"4px 0 6px",fontStyle:"italic"}
        }, `+ ${patterns.length - 5} more pattern${patterns.length-5!==1?"s":""} detected`),
      ),

      /* Recommendation box */
      intelResult.recommended_action !== "ALLOW" &&
        React.createElement("div", {
          style:{
            margin:"4px 14px 12px",padding:"10px 12px",
            background:rl.bg,border:`1px solid ${rl.bar}`,
            borderRadius:8,fontSize:11,color:rl.color,
            fontWeight:600,lineHeight:1.45,
          }
        },
          React.createElement("span", {style:{fontWeight:800}}, intelResult.action_label),
          React.createElement("br"),
          intelResult.action_description,
        ),

      /* OTP chip */
      intelResult.requires_otp && React.createElement("div", {
        style:{
          margin:"-4px 14px 10px",padding:"6px 12px",
          background:"#fff7ed",border:"1px solid #fdba74",
          borderRadius:8,fontSize:11,color:"#c2410c",fontWeight:700,
          display:"flex",alignItems:"center",gap:6,
        }
      }, "🔐 OTP verification required before payment"),

      /* Category tags */
      (intelResult.signal_summary?.categories_hit||[]).length > 0 &&
        React.createElement("div", {
          style:{padding:"0 14px 12px",display:"flex",flexWrap:"wrap",gap:5}
        },
          ...(intelResult.signal_summary.categories_hit).map((cat,i) =>
            React.createElement("span", {
              key:i,
              style:{
                fontSize:10,fontWeight:700,color:"#64748b",
                background:"#f1f5f9",padding:"2px 8px",
                borderRadius:8,border:"1px solid #e2e8f0",
              }
            }, `${CATEGORY_ICON[cat]||"⚠"} ${cat}`)
          ),
        ),
    ),
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  REACT COMPONENT — FinalRiskBadge
// ═══════════════════════════════════════════════════════════════════════════════

function FinalRiskBadge({ mergedRisk }) {
  // Risk values remain available to the decision pipeline but are not exposed
  // in the customer-facing payment flow.
  return null;

  const rl       = RISK_META[mergedRisk.riskLevel] || RISK_META.LOW;
  const delta    = mergedRisk.delta;
  const dStr     = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "±0";
  const dColor   = delta > 5 ? "#dc2626" : delta < -5 ? "#16a34a" : "#64748b";
  const dBg      = delta > 5 ? "#fef2f2" : delta < -5 ? "#f0fdf4" : "#f8faff";
  const dBorder  = delta > 5 ? "#fca5a5" : delta < -5 ? "#86efac" : "#e2e8f0";

  return React.createElement("div", {
    style:{
      padding:"10px 14px",
      background:`linear-gradient(135deg,${rl.bg},#fff)`,
      border:`1.5px solid ${rl.bar}`,
      borderRadius:10, marginBottom:12,
      display:"flex",alignItems:"center",gap:10,
      animation:"slideDown .25s ease",
    }
  },
    React.createElement("div", { style:{flex:1} },
      React.createElement("div", {
        style:{fontSize:10,fontWeight:800,color:"#94a3b8",
               textTransform:"uppercase",letterSpacing:.7,marginBottom:3}
      }, "Security analysis updated"),
      React.createElement("div", {
        style:{display:"flex",alignItems:"baseline",gap:8}
      },
        React.createElement("span", {
          style:{fontSize:26,fontWeight:900,color:rl.color,lineHeight:1}
        }, "Review complete"),
        React.createElement("span", {style:{fontSize:12,color:"#94a3b8"}}, "/100"),
        React.createElement("span", {
          style:{
            fontSize:11,fontWeight:700,color:dColor,
            background:dBg,padding:"1px 7px",borderRadius:8,
            border:`1px solid ${dBorder}`,
          }
        }, `${dStr} from Stage 1`),
      ),
    ),
    React.createElement("div", { style:{textAlign:"right",flexShrink:0} },
      React.createElement("div", {style:{fontSize:10,color:"#94a3b8",marginBottom:3}},
        "🤖 Behaviour: ",
        React.createElement("b", {style:{color:"#0f172a"}}, mergedRisk.stage1),
      ),
      React.createElement("div", {style:{fontSize:10,color:"#94a3b8"}},
        "🔍 Fraud Intel: ",
        React.createElement("b", {style:{color:rl.color}}, mergedRisk.stage2),
      ),
    ),
  );
}
