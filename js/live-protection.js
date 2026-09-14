// js/live-protection.js — Live Protection frontend (Phase 11)
// Maintains backendRisk, liveAlerts, verificationState — never frontendRisk as authoritative.
// Handles /ws with token, reconnect, dedup via event_id.

(function () {
  // Store for React to read
  window._ironLive = {
    backendRisk: null, // last risk from backend
    backendTransactionState: null,
    liveAlerts: [], // array of {event, message, timestamp, event_id}
    verificationState: null,
    connected: false,
    ws: null,
    _seenEventIds: new Set(),
  };

  let ws = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;

  function getToken() {
    try { return localStorage.getItem("iron_token"); } catch { return null; }
  }

  function connectLive() {
    const token = getToken();
    if (!token) {
      console.log("[Live] no token, skip WS");
      return;
    }
    // Use new backend WS at /ws?token= — secure, not phone query
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/ws?token=${encodeURIComponent(token)}`;
    console.log("[Live] connecting", url);
    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.warn("[Live] WS create failed", e);
      scheduleReconnect();
      return;
    }
    window._ironLive.ws = ws;

    ws.onopen = () => {
      console.log("[Live] connected");
      window._ironLive.connected = true;
      reconnectAttempts = 0;
      // Notify listeners
      window.dispatchEvent(new CustomEvent("iron-live-connected"));
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const eventId = data.event_id;
        if (eventId && window._ironLive._seenEventIds.has(eventId)) {
          console.log("[Live] duplicate event ignored", eventId);
          return;
        }
        if (eventId) {
          window._ironLive._seenEventIds.add(eventId);
          // Keep set bounded
          if (window._ironLive._seenEventIds.size > 200) {
            const arr = Array.from(window._ironLive._seenEventIds);
            window._ironLive._seenEventIds = new Set(arr.slice(-150));
          }
        }
        // Stale check: ignore if timestamp older than 5 minutes and not risk_escalation
        const ts = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();
        if (Date.now() - ts > 5 * 60 * 1000 && data.event !== "risk_escalation") {
          console.log("[Live] stale event ignored", data.event, data.timestamp);
          return;
        }

        console.log("[Live] event", data.event, data);
        // Update authoritative state
        if (data.event === "risk_updated" || data.event === "risk_update") {
          window._ironLive.backendRisk = data.risk || data;
          // Risk escalation detection
          const tier = data.risk?.tier || data.tier;
          if (tier === "HIGH_RISK" || tier === "CAUTION") {
            const msg = tier === "HIGH_RISK"
              ? `Risk Updated: This payment now has additional risk signals. Risk: ${tier} Score: ${data.risk?.score || ""}`
              : `Risk Updated: ${tier}`;
            addLiveAlert(data.event, msg, eventId, data);
          }
          window.dispatchEvent(new CustomEvent("iron-live-risk", { detail: data }));
        } else if (data.event === "transaction_prepared") {
          window._ironLive.backendTransactionState = data;
          window.dispatchEvent(new CustomEvent("iron-live-transaction", { detail: data }));
        } else if (data.event === "verification_required") {
          window._ironLive.verificationState = data;
          addLiveAlert("verification_required", `Verification required: ${data.risk?.tier || "HIGH_RISK"}`, eventId, data);
          window.dispatchEvent(new CustomEvent("iron-live-verification", { detail: data }));
        } else if (data.event === "verification_completed" || data.event === "transaction_confirmed" || data.event === "transaction_completed") {
          window._ironLive.backendTransactionState = data;
          window.dispatchEvent(new CustomEvent("iron-live-confirmed", { detail: data }));
        } else if (data.event === "recipient_report_updated" || data.event === "live_alert") {
          addLiveAlert(data.event, data.message || data.event, eventId, data);
          window.dispatchEvent(new CustomEvent("iron-live-alert", { detail: data }));
        } else if (data.event === "connected" || data.event === "pong") {
          // ignore
        } else {
          // Generic alert
          addLiveAlert(data.event, data.message || JSON.stringify(data).slice(0,120), eventId, data);
        }
      } catch (e) {
        console.warn("[Live] message parse error", e);
      }
    };

    ws.onclose = (ev) => {
      console.log("[Live] disconnected", ev.code, ev.reason);
      window._ironLive.connected = false;
      window._ironLive.ws = null;
      scheduleReconnect();
      // On disconnect, frontend should fetch authoritative state after reconnect — handled on reconnect
    };

    ws.onerror = (e) => {
      console.warn("[Live] error", e);
      try { ws.close(); } catch {}
    };
  }

  function addLiveAlert(event, message, eventId, data) {
    // Avoid spam: deduplicate same message within 30s
    const now = Date.now();
    const recent = window._ironLive.liveAlerts.slice(-3);
    if (recent.some(a => a.message === message && now - new Date(a.timestamp).getTime() < 30000)) {
      return;
    }
    // Keep max 10 alerts
    window._ironLive.liveAlerts.push({
      event, message, event_id: eventId, timestamp: new Date().toISOString(), data
    });
    if (window._ironLive.liveAlerts.length > 10) {
      window._ironLive.liveAlerts = window._ironLive.liveAlerts.slice(-10);
    }
    window.dispatchEvent(new CustomEvent("iron-live-alert", { detail: { event, message, event_id: eventId } }));
    // Also show in console for demo
    console.warn(`[Live Alert] ${event}: ${message}`);
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 15000);
    reconnectAttempts++;
    console.log(`[Live] reconnect in ${delay}ms (attempt ${reconnectAttempts})`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      // After reconnect, fetch authoritative state (11.8)
      connectLive();
      // Trigger fetch of authoritative state via event
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("iron-live-reconnect"));
      }, 500);
    }, delay);
  }

  // Public API for React
  window.IronLive = {
    connect: connectLive,
    disconnect: () => { if (ws) try { ws.close(); } catch {} },
    getState: () => ({ ...window._ironLive }),
    addAlert: addLiveAlert,
  };

  // Auto-connect when token appears (after login)
  // Watch for storage changes
  window.addEventListener("storage", (e) => {
    if (e.key === "iron_token" && e.newValue) {
      setTimeout(connectLive, 500);
    }
  });
  // Also try on load if token exists
  setTimeout(() => {
    if (getToken()) connectLive();
  }, 800);

  // Also expose for manual testing
  console.log("[Live] Live Protection loaded — use IronLive.connect()");
})();
