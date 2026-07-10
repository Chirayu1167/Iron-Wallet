// ═══ GEO + DEVICE + IMPOSSIBLE TRAVEL ═══

/* ═══ GEOLOCATION & DEVICE FINGERPRINTING ═══ */

// Stores baseline location and device captured at login
const GeoDeviceBaseline = {
  location: null,   // { lat, lng, city, region }
  location_enabled: false, // true if user granted location permission at login
  deviceId: null,   // fingerprint string
  deviceInfo: null, // { browser, os, screen, timezone }
  sessionStart: null,
};

/* ═══ MOCK LOCATION OVERRIDE (for demo/testing) ═══
   When set, getFreshLocation() and recordTxLocation() use these
   coordinates instead of the real GPS. Set via the Dev Tools panel
   in Profile → Security. Cleared on logout.                        */
const MockLocation = {
  active: false,
  lat: null,
  lng: null,
  label: "",
};

// Preset cities for the mock location picker
const MOCK_CITIES = [
  { label: "Pune, Maharashtra",       lat: 18.5204, lng: 73.8567  },
  { label: "Alandi, Maharashtra",     lat: 18.6744, lng: 73.9072  },
  { label: "Nashik, Maharashtra",     lat: 20.0059, lng: 73.7797  },
  { label: "Mumbai, Maharashtra",     lat: 19.0760, lng: 72.8777  },
  { label: "Delhi",                   lat: 28.6139, lng: 77.2090  },
  { label: "Bangalore, Karnataka",    lat: 12.9716, lng: 77.5946  },
  { label: "Hyderabad, Telangana",    lat: 17.3850, lng: 78.4867  },
  { label: "Chennai, Tamil Nadu",     lat: 13.0827, lng: 80.2707  },
  { label: "Kolkata, West Bengal",    lat: 22.5726, lng: 88.3639  },
  { label: "Jaipur, Rajasthan",       lat: 26.9124, lng: 75.7873  },
];

function setMockLocation(city) {
  if (!city) {
    MockLocation.active = false;
    MockLocation.lat = null;
    MockLocation.lng = null;
    MockLocation.label = "";
  } else {
    MockLocation.active = true;
    MockLocation.lat = city.lat;
    MockLocation.lng = city.lng;
    MockLocation.label = city.label;
  }
}

// Generate a deterministic device fingerprint from browser signals
function getDeviceFingerprint() {
  const nav = window.navigator;
  const scr = window.screen;
  const signals = [
    nav.userAgent,
    nav.language,
    scr.width + "x" + scr.height,
    scr.colorDepth,
    new Date().getTimezoneOffset(),
    nav.hardwareConcurrency || 0,
    nav.platform || "",
  ].join("|");
  // Simple hash
  let hash = 0;
  for (let i = 0; i < signals.length; i++) {
    hash = ((hash << 5) - hash) + signals.charCodeAt(i);
    hash |= 0;
  }
  return "DEV-" + Math.abs(hash).toString(36).toUpperCase();
}

function getDeviceInfo() {
  const ua = navigator.userAgent;
  let browser = "Unknown", os = "Unknown";
  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("OPR") || ua.includes("Opera")) browser = "Opera";

  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";

  return {
    browser,
    os,
    screen: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    fingerprint: getDeviceFingerprint(),
  };
}

// Capture baseline on login — call this once when user logs in
function captureBaseline(onDone) {
  const deviceInfo = getDeviceInfo();
  const deviceId = deviceInfo.fingerprint;
  GeoDeviceBaseline.deviceId = deviceId;
  GeoDeviceBaseline.deviceInfo = deviceInfo;
  GeoDeviceBaseline.sessionStart = Date.now();

  // Load known device from localStorage
  const knownDevice = localStorage.getItem("pt_device_id");
  GeoDeviceBaseline.isNewDevice = !knownDevice || knownDevice !== deviceId;
  if (!knownDevice) localStorage.setItem("pt_device_id", deviceId);

  // Capture geo via browser API
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        GeoDeviceBaseline.location_enabled = true;
        GeoDeviceBaseline.location = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          city: "Locating...",
          region: "",
        };
        // Reverse geocode using open API (no key needed)
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
          .then(r => r.json())
          .then(data => {
  const addr = data.address || {};

  // Most specific → least specific
  const area =
    addr.neighbourhood ||
    addr.quarter ||
    addr.suburb ||
    addr.residential ||
    addr.road ||
    addr.city_district ||
    null;

  const city =
    addr.city ||
    addr.town ||
    addr.municipality ||
    addr.village ||
    addr.county ||
    "Unknown";

  const state = addr.state || "";

  // Show: "Kothrud, Pune, Maharashtra" or just "Pune, Maharashtra"
  GeoDeviceBaseline.location.city = city;
  GeoDeviceBaseline.location.area = area;
  GeoDeviceBaseline.location.region = state;
  GeoDeviceBaseline.location.display = area
    ? `${area}, ${city}, ${state}`
    : `${city}, ${state}`;
})
          .catch(() => {
            GeoDeviceBaseline.location.city = "Unknown";
            GeoDeviceBaseline.location.display = "Location unavailable";
          })
          .finally(() => { if (onDone) onDone(); });
      },
      () => {
        GeoDeviceBaseline.location_enabled = false;
        GeoDeviceBaseline.location = { city: "Permission denied", display: "Location off", lat: null, lng: null };
        if (onDone) onDone();
      },
      { timeout: 8000 }
    );
  } else {
    GeoDeviceBaseline.location_enabled = false;
    GeoDeviceBaseline.location = { city: "Unsupported", display: "Not supported", lat: null, lng: null };
    if (onDone) onDone();
  }
}

// Haversine distance in km between two lat/lng points
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Check geo + device risk at transaction time
function checkGeoDeviceRisk() {
  let risk = 0;
  const signals = [];
  const meta = {};

  const baseline = GeoDeviceBaseline.location;
  const deviceInfo = GeoDeviceBaseline.deviceInfo;

  // ── Device checks ──
  if (GeoDeviceBaseline.isNewDevice) {
    risk += 30;
    signals.push(`⚠️ New/unrecognized device detected (${deviceInfo?.browser} on ${deviceInfo?.os})`);
    meta.newDevice = true;
  }

  // ── Geo checks ──
  if (baseline && baseline.lat !== null) {
    // Get current position quickly (cached from baseline for same session)
    meta.location = baseline.display || baseline.city;
    meta.city = baseline.city;
  } else if (baseline && baseline.city === "Permission denied") {
    risk += 20;
    signals.push("ℹ️ Location permission denied — cannot verify transaction origin");
    meta.location = "Location off";
  }

  // Session anomaly — transaction happening very soon after login (bot-like)
  const sessionAge = (Date.now() - GeoDeviceBaseline.sessionStart) / 1000;
  if (sessionAge < 8) {
    risk += 25;
    signals.push("⚠️ Transaction initiated within seconds of login — unusual behavior");
  }

  meta.deviceInfo = deviceInfo;
  return { risk: Math.min(risk, 35), signals, meta };
}

// Get display string for a transaction's device/location tags
function getTxGeoDeviceMeta() {
  const loc = GeoDeviceBaseline.location;
  const dev = GeoDeviceBaseline.deviceInfo;
  return {
    location: loc?.display || loc?.city || null,
    device: dev ? `${dev.browser} · ${dev.os}` : null,
    isNewDevice: GeoDeviceBaseline.isNewDevice || false,
  };
}

/* ═══ IMPOSSIBLE TRAVEL DETECTION ENGINE ═══ */

// Distance thresholds (km) — triggered regardless of speed
// These catch real-world location jumps between transactions
// even when the time gap makes the speed look "normal".
const TRAVEL_THRESHOLDS = {
  IMPOSSIBLE:  800,  // faster than commercial jet → block (speed-based)
  VERY_FAST:   500,  // fast jet speed             → block (speed-based)
  FAST:        300,  // subsonic aircraft           → OTP  (speed-based)
  SUSPICIOUS:  150,  // fast car/train              → warn (speed-based)
};

// Distance-only thresholds — fire even if the time gap is large
const DISTANCE_THRESHOLDS = {
  CITY_HOP:    10,   // different suburb/city      → info signal (+20)
  REGION_HOP:  50,   // different district/region  → warning     (+40)
  STATE_HOP:   300,  // different state            → strong warn (+65)
};

// Stores last successful transaction location per user
const LastTxLocation = new Map();

// Stores last successful transaction network info per user
const LastTxNetwork = new Map();

// Save location after every successful transaction
function recordTxLocation(userNum, lat, lng, timestamp) {
  if (lat == null || lng == null) return;
  LastTxLocation.set(userNum, { lat, lng, timestamp: timestamp || Date.now() });
}

// Save network info after every successful transaction
function recordTxNetwork(userNum, networkData) {
  LastTxNetwork.set(userNum, { ...networkData, timestamp: Date.now() });
}

/**
 * Fetch fresh GPS coordinates at transaction time.
 * Returns a Promise<{lat, lng}> — resolves quickly (cached by browser),
 * falls back to GeoDeviceBaseline if permission denied or timeout.
 */
function getFreshLocation() {
  // If a mock location is active (demo/testing), return it immediately.
  if (MockLocation.active && MockLocation.lat != null) {
    return Promise.resolve({ lat: MockLocation.lat, lng: MockLocation.lng });
  }
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({
        lat: GeoDeviceBaseline.location?.lat ?? null,
        lng: GeoDeviceBaseline.location?.lng ?? null,
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({
        lat: GeoDeviceBaseline.location?.lat ?? null,
        lng: GeoDeviceBaseline.location?.lng ?? null,
      }),
      { timeout: 5000, maximumAge: 0 } // always fetch fresh — no cache, so location changes are detected
    );
  });
}

/**
 * Fetch current network information including IP address details.
 * Uses WebRTC to get public IP address (best-effort, falls back to null).
 */
function getNetworkInfo() {
  return new Promise((resolve) => {
    // Basic network info available from navigator
    const basicInfo = {
      effectiveType: navigator.connection?.effectiveType || null,
      downlink: navigator.connection?.downlink || null,
      rtt: navigator.connection?.rtt || null,
      saveData: navigator.connection?.saveData || false,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      userAgent: navigator.userAgent,
    };

    // Use WebRTC to try to get public IP address
    // This is the most reliable client-side way to detect VPN IPs
    let resolved = false;
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });

      pc.createDataChannel("networkCheck");
      pc.createOffer().then(offer => pc.setLocalDescription(offer));

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          pc.close();
          resolve({ ...basicInfo, ipAddress: null, publicIPDetected: false });
        }
      }, 3000);

      pc.onicecandidate = (event) => {
        if (resolved) return;
        if (!event.candidate) return;

        const candidate = event.candidate.candidate;
        // Look for public IP in ICE candidate (contains ip: field)
        const ipMatch = candidate.match(/ip:(\d+\.\d+\.\d+\.\d+)/);
        const ipv6Match = candidate.match(/ipv6:([0-9a-fA-F:]+)/);

        if (ipMatch || ipv6Match) {
          resolved = true;
          clearTimeout(timeout);
          const ip = ipMatch ? ipMatch[1] : ipv6Match[1];
          pc.close();
          resolve({
            ...basicInfo,
            ipAddress: ip,
            publicIPDetected: true,
            isIPv6: !!ipv6Match,
          });
        }
      };

      // Also listen for ICE gathering state change
      pc.onicegatheringstatechange = () => {
        if (resolved) return;
        if (pc.iceGatheringState === 'complete') {
          resolved = true;
          clearTimeout(timeout);
          pc.close();
          resolve({ ...basicInfo, ipAddress: null, publicIPDetected: false });
        }
      };
    } catch (e) {
      resolve({ ...basicInfo, ipAddress: null, publicIPDetected: false });
    }
  });
}

// Core VPN detection check — compares last payment network data with current
async function checkVPNDetection(userNum) {
  const result = {
    vpnDetected: false,
    reason: null,
    blocked: false,
  };

  try {
    const currentNetwork = await getNetworkInfo();
    const lastNetwork = LastTxNetwork.get(userNum);

    // No previous network data — skip check but record current
    if (!lastNetwork) {
      recordTxNetwork(userNum, currentNetwork);
      return result;
    }

    // === Check 1: IP address change between payments ===
    if (lastNetwork.ipAddress && currentNetwork.ipAddress) {
      if (lastNetwork.ipAddress !== currentNetwork.ipAddress) {
        // Different IP — could be VPN switch or proxy
        result.vpnDetected = true;
        result.reason = "IP address changed between payments";
        result.blocked = true;
      }
    }

    // === Check 2: VPN indicator patterns in IP ===
    // Heuristics for VPN detection:
    // - IP starts with unusual range (common VPN exit nodes)
    // - Multiple different IPs seen in short time
    // - IP timezone mismatch with device timezone
    if (currentNetwork.ipAddress) {
      const ip = currentNetwork.ipAddress;
      const ipNum = parseInt(ip.split('.').slice(0, 2).join(''), 10);

      // Check for known VPN-friendly ranges (common cloud/VPN providers)
      // These are rough heuristics - real VPN detection would use blocklists
      const vpnRanges = [
        { start: 0, end: 25, label: "Reserved/Private" },
        { start: 100, end: 130, label: "Common VPN range" },
        { start: 185, end: 200, label: "VPN provider range" },
      ];

      for (const range of vpnRanges) {
        if (ipNum >= range.start && ipNum <= range.end) {
          // Only block if we also see timezone mismatch or other indicators
          if (lastNetwork.timezone && currentNetwork.timezone &&
              lastNetwork.timezone !== currentNetwork.timezone) {
            result.vpnDetected = true;
            result.reason = `VPN usage detected: IP changed to ${ip} with timezone change`;
            result.blocked = true;
            break;
          }
        }
      }
    }

    // === Check 3: Timezone inconsistency ===
    if (lastNetwork.timezone && currentNetwork.timezone &&
        lastNetwork.timezone !== currentNetwork.timezone) {
      // Timezone changed between transactions — possible VPN
      result.vpnDetected = true;
      result.reason = `Timezone changed from ${lastNetwork.timezone} to ${currentNetwork.timezone}`;
      result.blocked = true;
    }

    // === Check 4: Network type change ===
    if (lastNetwork.effectiveType && currentNetwork.effectiveType &&
        lastNetwork.effectiveType !== currentNetwork.effectiveType) {
      // Connection type changed (e.g., wifi to cellular) — flag for review
      result.vpnDetected = true;
      result.reason = `Network type changed from ${lastNetwork.effectiveType} to ${currentNetwork.effectiveType}`;
      result.blocked = true;
    }

    // === Check 5: User agent change (device switch) ===
    if (lastNetwork.userAgent && currentNetwork.userAgent) {
      const lastUA = lastNetwork.userAgent;
      const currUA = currentNetwork.userAgent;
      // Check if OS or browser changed significantly
      const lastOSMatch = lastUA.match(/\(([^)]+)\)/);
      const currUAOSMatch = currUA.match(/\(([^)]+)\)/);
      if (lastOSMatch && currUAOSMatch && lastOSMatch[1] !== currUAOSMatch[1]) {
        result.vpnDetected = true;
        result.reason = "Device or browser changed between payments";
        result.blocked = true;
      }
    }

    // Always record current network data for next comparison
    recordTxNetwork(userNum, currentNetwork);

  } catch (e) {
    console.error("[VPN Check] Error during network check:", e);
    // On error, don't block but log and continue
  }

  return result;
}

// Core impossible travel check — only runs if location_enabled = true
function checkImpossibleTravel(userNum, currentLat, currentLng, currentTimestamp) {
  const result = {
    distance_km:        null,
    time_diff_minutes:  null,
    speed_kmh:          null,
    anomaly_score:      0,
    risk_level:         "normal",
    reason:             null,
    triggered:          false,
  };

  // Skip if user denied location permission
  if (!GeoDeviceBaseline.location_enabled) return result;

  // No current location → skip
  if (currentLat == null || currentLng == null) return result;

  const last = LastTxLocation.get(userNum);

  // No previous transaction on record → no penalty, just record
  if (!last || last.lat == null) return result;

  // ── Calculate distance ──
  const dist = haversineKm(last.lat, last.lng, currentLat, currentLng);

  // ── Calculate time difference in minutes ──
  const now = currentTimestamp || Date.now();
  const timeDiffMs = now - last.timestamp;
  const timeDiffMin = timeDiffMs / 60000;

  result.distance_km       = Math.round(dist * 10) / 10;
  result.time_diff_minutes = Math.round(timeDiffMin * 10) / 10;

  // Avoid divide-by-zero — if < 1 minute, treat as 1 min
  const safeTime = Math.max(timeDiffMin, 1);
  const speedKmh = (dist / safeTime) * 60;
  result.speed_kmh = Math.round(speedKmh);

  // ── Speed-based fraud logic ──
  let reason = null;
  let level  = "normal";

  if (speedKmh > TRAVEL_THRESHOLDS.IMPOSSIBLE) {
    level  = "popup";
    reason = `Unusual location change detected. Please confirm this activity. (${result.distance_km}km in ${result.time_diff_minutes}min, ${result.speed_kmh} km/h)`;
  } else if (speedKmh > TRAVEL_THRESHOLDS.VERY_FAST) {
    level  = "popup";
    reason = `Unusual location change detected. Please confirm this activity. (${result.distance_km}km in ${result.time_diff_minutes}min, ${result.speed_kmh} km/h)`;
  } else if (speedKmh > TRAVEL_THRESHOLDS.FAST) {
    level  = "popup";
    reason = `Unusual location change detected. Please confirm this activity. (${result.distance_km}km in ${result.time_diff_minutes}min, ${result.speed_kmh} km/h)`;
  } else if (speedKmh > TRAVEL_THRESHOLDS.SUSPICIOUS) {
    level  = "popup";
    reason = `Unusual location change detected. Please confirm this activity. (${result.distance_km}km in ${result.time_diff_minutes}min, ${result.speed_kmh} km/h)`;
  }

  // ── Distance-based logic (fires even when speed looks normal) ──
  // Only applies when speed check didn't already fire a signal.
  // Location jump triggers a popup ONLY — does NOT change risk score.
  if (level === "normal") {
    if (dist >= DISTANCE_THRESHOLDS.STATE_HOP) {
      level  = "popup";
      reason = `Unusual location change detected. Please confirm this activity. (${result.distance_km}km from previous transaction)`;
    } else if (dist >= DISTANCE_THRESHOLDS.REGION_HOP) {
      level  = "popup";
      reason = `Unusual location change detected. Please confirm this activity. (${result.distance_km}km from previous transaction)`;
    } else if (dist >= DISTANCE_THRESHOLDS.CITY_HOP) {
      level  = "popup";
      reason = `Unusual location change detected. Please confirm this activity. (${result.distance_km}km from previous transaction)`;
    }
  }

  result.anomaly_score = 0; // Location jump NEVER contributes to risk score
  result.risk_level    = level;
  result.reason        = level !== "normal" ? reason : null;
  result.triggered     = level === "popup";

  return result;
}

// Final score combiner — merges ML score + travel anomaly
function combineWithTravelScore(mlScore, userNum, currentLat, currentLng) {
  const travel = checkImpossibleTravel(
    userNum,
    currentLat,
    currentLng,
    Date.now()
  );

  const finalScore = Math.min(100, mlScore + travel.anomaly_score);

  return {
    ...travel,
    ml_score:    mlScore,
    final_score: finalScore,
  };
}
