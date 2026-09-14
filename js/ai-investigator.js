// js/ai-investigator.js — AI Fraud Investigator frontend (Phase 9.8)
// Complements Risk UI, never replaces backend explanation. Strict grounding via backend evidence.

function AIInvestigatorPanel({ transactionId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchInvestigation() {
      if (!transactionId) { setError("No transaction to investigate."); setLoading(false); return; }
      try {
        const hdr = getAuthHeader();
        const res = await fetch(`${API}/risk/investigate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...hdr },
          body: JSON.stringify({ transaction_id: transactionId })
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          // Fallback to backend evidence if AI unavailable
          if (data.fallback || data.summary) {
            setResult(data);
          } else {
            setError(data.error || `Investigation failed (${res.status})`);
            if (data.fallback) setResult(data.fallback);
          }
        } else {
          setResult(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError("AI investigation unavailable. Showing backend risk evidence instead.");
          // Result remains null, will show fallback
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchInvestigation();
    return () => { cancelled = true; };
  }, [transactionId]);

  // Fallback content when AI unavailable
  const fallbackEvidence = result?.evidence || [];

  return (
    <div style={{ marginTop: 16, border: "1px solid #E0E1DD", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      <div style={{ padding: "14px 16px", background: "linear-gradient(135deg,#1B263B,#0F1E2E)", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(197,160,89,0.18)", border: "1px solid rgba(197,160,89,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>🤖</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>AI Investigation</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{result?.investigator_version || "ai-investigator-v1"}</div>
          </div>
        </div>
        {onClose && <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", width: 28, height: 28, borderRadius: 6, cursor: "pointer" }}>×</button>}
      </div>
      <div style={{ padding: 16 }}>
        {loading && <div style={{ textAlign: "center", padding: 20, color: "#64748b", fontSize: 13 }}>🔍 Investigating with AI…</div>}
        {error && !result && (
          <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, color: "#991b1b", fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}
        {error && result && (
          <div style={{ padding: "10px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, color: "#92400e", fontSize: 12, marginBottom: 12 }}>
            AI investigation unavailable. Showing backend risk evidence instead.
          </div>
        )}
        {result && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1B263B", marginBottom: 4 }}>Summary</div>
              <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.5 }}>{result.summary || "No summary."}</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1B263B", marginBottom: 4 }}>Why this payment was flagged</div>
              <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.5 }}>{result.risk_explanation || result.summary}</div>
            </div>
            {result.key_findings && result.key_findings.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1B263B", marginBottom: 6 }}>Key findings</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {result.key_findings.map((kf, i) => (
                    <li key={i} style={{ fontSize: 13, color: "#475569", marginBottom: 6 }}>
                      <span style={{ fontWeight: 600 }}>{kf.finding}</span>
                      {kf.evidence_ids && kf.evidence_ids.length > 0 && (
                        <span style={{ fontSize: 11, color: "#64748b", marginLeft: 6 }}>
                          (evidence: {kf.evidence_ids.join(", ")})
                        </span>
                      )}
                      <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: kf.severity==="CRITICAL"?"#fef2f2":kf.severity==="HIGH"?"#fff7ed":"#f0fdf4", color: kf.severity==="CRITICAL"?"#991b1b":kf.severity==="HIGH"?"#9a3412":"#166534", border: "1px solid #E0E1DD" }}>{kf.severity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.evidence && result.evidence.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1B263B", marginBottom: 6 }}>Evidence</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {result.evidence.map((ev, i) => (
                    <span key={i} style={{ padding: "4px 8px", background: "#f8fafc", border: "1px solid #E0E1DD", borderRadius: 6, fontSize: 11, color: "#334155" }}>
                      {ev.id}: {ev.description?.slice(0, 60)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ padding: "10px 12px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 4 }}>Recommended next step</div>
              <div style={{ fontSize: 13, color: "#166534", lineHeight: 1.5 }}>{result.recommended_action || "Review and proceed if you recognize the transaction."}</div>
              <div style={{ fontSize: 11, color: "#15803d", marginTop: 6, fontStyle: "italic" }}>Confidence: {(result.confidence*100).toFixed(0)}% • The system will not block the payment.</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
