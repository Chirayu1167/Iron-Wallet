// js/simulator.js — What-If Fraud Simulator frontend (Phase 10.6)
// Simulation only, never mutates real transaction/balance. Reuses real Risk Engine via POST /risk/simulate.

function WhatIfSimulator({ onClose }) {
  const [amount, setAmount] = useState("5000");
  const [recipient, setRecipient] = useState("");
  const [deviceChanged, setDeviceChanged] = useState(false);
  const [locationChanged, setLocationChanged] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function runSimulation() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const hdr = getAuthHeader();
      const body = {};
      if (amount) body.amount = parseFloat(amount);
      if (recipient) body.recipient = recipient;
      body.device_changed = !!deviceChanged;
      body.location_changed = !!locationChanged;
      if (note) body.note = note;
      const res = await fetch(`${API}/risk/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdr },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Simulation failed (${res.status})`);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError("Simulation unavailable: " + (e.message || "network error"));
    } finally {
      setLoading(false);
    }
  }

  function tierColor(t) {
    if (t === "HIGH_RISK") return "#dc2626";
    if (t === "CAUTION") return "#d97706";
    return "#16a34a";
  }
  function tierBg(t) {
    if (t === "HIGH_RISK") return "#fef2f2";
    if (t === "CAUTION") return "#fffbeb";
    return "#f0fdf4";
  }

  return (
    <div style={{ marginTop: 16, border: "1px solid #E0E1DD", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      <div style={{ padding: "14px 16px", background: "linear-gradient(135deg,#1B263B,#0F1E2E)", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(197,160,89,0.18)", border: "1px solid rgba(197,160,89,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>🧪</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>What-If Simulator</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>Simulation only — no real transaction</div>
          </div>
        </div>
        {onClose && <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", width: 28, height: 28, borderRadius: 6, cursor: "pointer" }}>×</button>}
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 }}>Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="5000" style={{ width: "100%", padding: "8px 10px", border: "1px solid #E0E1DD", borderRadius: 6, fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 }}>Recipient (phone/UPI)</label>
            <input type="text" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="9876543210 or name@upi" style={{ width: "100%", padding: "8px 10px", border: "1px solid #E0E1DD", borderRadius: 6, fontSize: 13 }} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 }}>Note (optional)</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="urgent prize claim" style={{ width: "100%", padding: "8px 10px", border: "1px solid #E0E1DD", borderRadius: 6, fontSize: 13 }} />
        </div>
        <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#334155" }}>
            <input type="checkbox" checked={deviceChanged} onChange={e => setDeviceChanged(e.target.checked)} /> Device changed
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#334155" }}>
            <input type="checkbox" checked={locationChanged} onChange={e => setLocationChanged(e.target.checked)} /> Location changed
          </label>
        </div>
        <button onClick={runSimulation} disabled={loading} style={{ width: "100%", padding: "10px", background: loading ? "#94a3b8" : "#1B263B", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Simulating…" : "Run Simulation"}
        </button>

        {error && <div style={{ marginTop: 12, padding: "10px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, color: "#991b1b", fontSize: 12 }}>{error}</div>}

        {result && (
          <div style={{ marginTop: 16, borderTop: "1px solid #E0E1DD", paddingTop: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={{ padding: 12, background: tierBg(result.current?.risk?.tier || "SAFE"), border: "1px solid #E0E1DD", borderRadius: 6, textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>Current</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: tierColor(result.current?.risk?.tier) }}>{result.current?.risk?.score ?? result.current?.risk?.score}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: tierColor(result.current?.risk?.tier) }}>{result.current?.risk?.tier}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>₹{result.current?.amount} → {result.current?.recipient || "default"}</div>
              </div>
              <div style={{ padding: 12, background: tierBg(result.simulated?.risk?.tier || result.risk?.tier), border: "1px solid #E0E1DD", borderRadius: 6, textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>What-if</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: tierColor(result.simulated?.risk?.tier || result.risk?.tier) }}>{result.simulated?.risk?.score ?? result.risk?.score}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: tierColor(result.simulated?.risk?.tier || result.risk?.tier) }}>{result.simulated?.risk?.tier || result.risk?.tier}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>₹{result.simulated?.amount ?? result.risk?.score} → {result.simulated?.recipient || "sim"}</div>
              </div>
            </div>
            <div style={{ padding: 10, background: "#f8fafc", border: "1px solid #E0E1DD", borderRadius: 6, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1B263B", marginBottom: 6 }}>Score difference: <span style={{ color: (result.simulated?.risk?.score - result.current?.risk?.score) > 0 ? "#dc2626" : "#16a34a" }}>{(result.simulated?.risk?.score - result.current?.risk?.score) > 0 ? "+" : ""}{(result.simulated?.risk?.score - result.current?.risk?.score) || (result.risk?.score - (result.current?.risk?.score || 0))}</span> • Tier: {result.current?.risk?.tier} → {result.simulated?.risk?.tier || result.risk?.tier}</div>
              <div style={{ fontSize: 12, color: "#475569" }}>Main change: {result.changes?.map(c => `${c.field}: ${c.before} → ${c.after} (${c.impact})`).join(", ") || "No change"}</div>
            </div>
            {result.explanation && result.explanation.reasons && result.explanation.reasons.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1B263B", marginBottom: 6 }}>Changed signals</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {result.explanation.reasons.slice(0, 3).map((r, i) => (
                    <li key={i} style={{ fontSize: 12, color: "#475569" }}>{r.title}: {r.description}</li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ fontSize: 11, color: "#64748b", fontStyle: "italic", textAlign: "center", padding: "8px", background: "#f1f5f9", borderRadius: 6 }}>
              {result.note || "Simulation only — not a real transaction decision"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
