// Copy this file to js/config.js and fill in your own key.
// js/config.js is gitignored and will NOT be committed.
//
// SECURITY NOTE: this key is used directly from the browser, which means
// anyone using the app can see it in devtools/network requests. For a real
// deployment, proxy Gemini calls through the FastAPI backend (otp_server.py)
// instead of calling generativelanguage.googleapis.com from the client.
window.APP_CONFIG = {
  GEMINI_API_KEY: "YOUR_GEMINI_API_KEY_HERE"
};
