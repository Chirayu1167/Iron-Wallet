/* ═══════════════════════════════════════════════════════════════════════════
   IRONWALLET — Security Monitor
   security-monitor.js

   Two independent detectors that run continuously and expose results via
   window._ironWalletSecurity  (read by send-money.js for risk scoring)

   ┌─────────────────────────────────────────────────────────────────────┐
   │  VPN / Proxy Detector                                               │
   │  • Calls ipapi.co on load (free, no API key needed)                 │
   │  • Checks: known VPN orgs, datacenter ASNs, wrong country           │
   │  • Result available within ~1s of page load                         │
   ├─────────────────────────────────────────────────────────────────────┤
   │  Screen Recording Detector                                           │
   │  • Hooks into getDisplayMedia to catch browser screen sharing        │
   │  • Polls for active display-capture MediaStreamTracks every 3s      │
   │  • Detects focus-blur patterns caused by capture software           │
   │  • Masks sensitive DOM nodes when recording is active               │
   └─────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════ */

// ── Shared state (read by any page component) ─────────────────────────────
window._ironWalletSecurity = {
  vpn: {
    detected:    false,
    checking:    true,
    reason:      null,      // human-readable reason
    ip:          null,
    org:         null,
    country:     null,
    riskScore:   0,         // 0-30 added to fraud score
  },
  screenRecording: {
    detected:    false,
    method:      null,      // "display-capture" | "focus-pattern" | "getDisplayMedia-hook"
    riskScore:   0,         // 0-25 added to fraud score
  },
  callbacks: [],            // registered listeners for status changes
};

function _notifyListeners() {
  window._ironWalletSecurity.callbacks.forEach(fn => {
    try { fn(window._ironWalletSecurity); } catch(_) {}
  });
}

// ── Public API ────────────────────────────────────────────────────────────
window.onSecurityStatusChange = function(fn) {
  window._ironWalletSecurity.callbacks.push(fn);
};


// ═══════════════════════════════════════════════════════════════════════════
//  VPN DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

const VPN_KEYWORDS = [
  "vpn","proxy","anonymi","tor ","mullvad","nordvpn","expressvpn",
  "surfshark","cyberghost","ipvanish","purevpn","hidemyass","tunnelbear",
  "protonvpn","windscribe","ivpn","azirevpn","perfect privacy",
];

const DATACENTER_KEYWORDS = [
  "amazon","aws","google cloud","microsoft azure","digitalocean","linode",
  "vultr","hetzner","ovh","choopa","choopa llc","godaddy","cloudflare",
  "fastly","akamai","hosting","server","vps","datacenter","data center",
];

// Countries where IronWallet users should NOT be transacting from
const EXPECTED_COUNTRY = "IN";

async function runVPNDetection() {
  const sec = window._ironWalletSecurity.vpn;
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 5000);

    const res  = await fetch("https://ipapi.co/json/", { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error("API error");
    const data = await res.json();

    const org     = (data.org     || "").toLowerCase();
    const isp     = (data.isp     || "").toLowerCase();
    const combined = org + " " + isp;

    sec.ip      = data.ip;
    sec.org     = data.org || data.isp || "Unknown";
    sec.country = data.country_code;

    const isVPNKeyword    = VPN_KEYWORDS.some(k => combined.includes(k));
    const isDatacenter    = DATACENTER_KEYWORDS.some(k => combined.includes(k));
    const isWrongCountry  = data.country_code && data.country_code !== EXPECTED_COUNTRY;

    if (isVPNKeyword) {
      sec.detected  = true;
      sec.reason    = `VPN provider detected in network operator: "${data.org}"`;
      sec.riskScore = 25;
    } else if (isDatacenter) {
      sec.detected  = true;
      sec.reason    = `Traffic routed through datacenter/hosting IP: "${data.org}"`;
      sec.riskScore = 20;
    } else if (isWrongCountry) {
      sec.detected  = true;
      sec.reason    = `IP located in ${data.country_name || data.country_code} — expected India`;
      sec.riskScore = 15;
    }

  } catch (err) {
    // API failed or timed out — don't penalise, just mark as unchecked
    sec.reason = "VPN check unavailable (network error)";
  } finally {
    sec.checking = false;
    _notifyListeners();
  }
}


// ═══════════════════════════════════════════════════════════════════════════
//  SCREEN RECORDING DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

let _activeDisplayTracks = [];   // tracks captured by getDisplayMedia hooks
let _blurEventCount      = 0;
let _lastBlurTime        = 0;
let _focusPatternSuspect = false;

// 1. Hook into getDisplayMedia BEFORE any page code runs
//    If the user (or malicious code) starts screen sharing, we know immediately
(function hookGetDisplayMedia() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return;

  const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);

  navigator.mediaDevices.getDisplayMedia = async function(opts) {
    const stream = await original(opts);

    // Tag all video tracks from this stream
    stream.getVideoTracks().forEach(track => {
      _activeDisplayTracks.push(track);
      track.addEventListener("ended", () => {
        _activeDisplayTracks = _activeDisplayTracks.filter(t => t !== track);
        _updateScreenRecordingStatus();
        _notifyListeners();
      });
    });

    _setScreenRecording(true, "getDisplayMedia-hook",
      "Screen sharing started in this browser tab.");
    return stream;
  };
})();

// 2. Poll for active display-capture tracks every 3 seconds
async function pollDisplayCaptureTracks() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

  try {
    // getDisplayMedia tracks are visible in active streams — check via RTCPeerConnection
    // and active MediaStreamTrack references
    const active = _activeDisplayTracks.filter(t => t.readyState === "live");
    if (active.length > 0) {
      _setScreenRecording(true, "display-capture",
        "Active screen capture track detected.");
    } else if (window._ironWalletSecurity.screenRecording.method === "display-capture"
               || window._ironWalletSecurity.screenRecording.method === "getDisplayMedia-hook") {
      // All tracks ended — clear the warning
      _updateScreenRecordingStatus();
    }
  } catch (_) {}
}

// 3. Focus/blur pattern detector
//    Screen recorders on Windows/macOS briefly steal focus.
//    3+ rapid blur events in under 2 seconds = suspicious.
window.addEventListener("blur", () => {
  const now = Date.now();
  if (now - _lastBlurTime < 2000) {
    _blurEventCount++;
    if (_blurEventCount >= 3 && !_focusPatternSuspect) {
      _focusPatternSuspect = true;
      _setScreenRecording(true, "focus-pattern",
        "Rapid focus changes detected — possible screen capture software active.");
    }
  } else {
    _blurEventCount = 1;
  }
  _lastBlurTime = now;
}, true);

// Reset blur counter on sustained focus
window.addEventListener("focus", () => {
  setTimeout(() => { _blurEventCount = 0; }, 3000);
}, true);

function _setScreenRecording(detected, method, reason) {
  const sr = window._ironWalletSecurity.screenRecording;
  if (sr.detected === detected && sr.method === method) return; // no change
  sr.detected   = detected;
  sr.method     = detected ? method : null;
  sr.reason     = detected ? reason : null;
  sr.riskScore  = detected ? (method === "getDisplayMedia-hook" ? 25 :
                              method === "display-capture"      ? 25 : 12) : 0;
  _notifyListeners();
}

function _updateScreenRecordingStatus() {
  const activeTracks = _activeDisplayTracks.filter(t => t.readyState === "live");
  if (activeTracks.length === 0 && !_focusPatternSuspect) {
    _setScreenRecording(false, null, null);
  }
}

// 4. Sensitive field masking
//    When recording is detected, blur text inside elements marked
//    data-sensitive="true" so they appear black in recordings.
function applySensitiveMasking(active) {
  document.querySelectorAll("[data-sensitive]").forEach(el => {
    el.style.filter    = active ? "blur(6px) brightness(0)" : "";
    el.style.userSelect= active ? "none" : "";
    el.style.transition= "filter .2s ease";
  });
}

window.onSecurityStatusChange(status => {
  applySensitiveMasking(status.screenRecording.detected);
});


// ═══════════════════════════════════════════════════════════════════════════
//  STARTUP
// ═══════════════════════════════════════════════════════════════════════════

(function start() {
  // VPN check — runs once on load
  runVPNDetection();

  // Screen recording poll — every 3 seconds
  setInterval(pollDisplayCaptureTracks, 3000);
})();
