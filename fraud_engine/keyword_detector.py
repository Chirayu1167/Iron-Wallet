"""
fraud_engine/keyword_detector.py — Social Engineering / Keyword Intelligence (Phase 5H)

Deterministic, explainable, covers urgency, OTP-request, impersonation,
account-threat, reward/prize, investment, loan, remote-access patterns.

Reuses the keyword weights philosophy from js/keyword-engine.js without
duplicating the full 400-entry dictionary — keeps thresholds documented.

Implements Levenshtein with early exit >3 → 99 (Phase 1 optimization preserved).

Returns structured signals: {id, category, severity, score, evidence, description, source}
"""
from __future__ import annotations
import re
from typing import Dict, Any, List

# ── Urgency / pressure keywords ──
URGENCY_TERMS = {
    "urgent", "urgency", "immediately", "asap", "emergency", "hurry", "quick", "fast",
    "instant", "right now", "do it now", "act now", "limited", "deadline", "expire", "expiring",
    "today only", "last chance", "don't wait", "running out", "time sensitive",
}

OTP_TERMS = {
    "otp", "pin", "password", "verification code", "cvv", "verify otp", "share otp", "send otp",
    "enter otp", "otp required", "one time password",
}

IMPERSONATION_TERMS = {
    "rbi", "sebi", "irdai", "income tax", "itra", "cbic", "govt", "government", "police", "cbi",
    "enforcement", "cyber cell", "bank", "sbi", "hdfc", "icici", "kotak", "refund department",
    "support", "helpdesk", "customer care", "customer support",
}

ACCOUNT_THREAT_TERMS = {
    "blocked", "freeze", "frozen", "suspend", "suspended", "deactivate", "deactivated",
    "account blocked", "account frozen", "kyc", "kyc pending", "kyc expired", "kyc update",
    "account will be blocked", "account closure", "legal action",
}

REWARD_TERMS = {
    "prize", "winner", "lottery", "lucky draw", "cashback", "reward", "gift", "bonus",
    "won", "winning", "cash win", "jackpot", "selected", "chosen", "congratulations",
}

INVESTMENT_TERMS = {
    "invest", "investment", "profit", "double", "triple", "crypto", "bitcoin", "trading",
    "forex", "stock", "dividend", "scheme", "guaranteed return", "earn daily", "passive income",
    "ponzi", "pig butchering",
}

LOAN_TERMS = {
    "loan", "instant loan", "loan app", "loan approved", "pre-approved", "credit offer",
    "emi", "interest free", "no collateral", "quick loan",
}

REMOTE_ACCESS_TERMS = {
    "anydesk", "teamviewer", "quicksupport", "screen share", "remote access",
    "download app", "install app", "apk", "remote desktop",
}

# Weight mapping for backend scoring (0-100 sub-score contribution)
# Keep thresholds documented: single weak keyword → low, multiple → high
CATEGORY_WEIGHTS = {
    "urgency": 8,
    "otp_request": 20,
    "impersonation": 18,
    "account_threat": 16,
    "reward": 14,
    "investment": 15,
    "loan": 12,
    "remote_access": 22,
}

def _levenshtein(a: str, b: str) -> int:
    """Early exit >3 → 99 optimization (Phase 1)."""
    if abs(len(a) - len(b)) > 3:
        return 99
    m, n = len(a), len(b)
    if m == 0:
        return n
    if n == 0:
        return m
    # DP with two rows
    prev = list(range(n + 1))
    for i in range(1, m + 1):
        cur = [i] + [0] * n
        for j in range(1, n + 1):
            cur[j] = prev[j-1] if a[i-1] == b[j-1] else 1 + min(prev[j], cur[j-1], prev[j-1])
        prev = cur
        # Early pruning: if min > 3 can break
        if min(prev) > 3:
            return 99
    return prev[n]

def _normalize_text(text: str) -> str:
    return (text or "").lower().strip()

def _tokenize(text: str) -> List[str]:
    # Split on non-alpha
    return re.findall(r"[a-z0-9]+", _normalize_text(text))

def _fuzzy_contains(text: str, term: str) -> bool:
    """Exact or fuzzy (lev <=2) match for term within text. Fuzzy only for len>=5 to avoid short-term false positives."""
    text_n = _normalize_text(text)
    term_n = _normalize_text(term)
    if term_n in text_n:
        return True
    # Token-level fuzzy for single-word terms — only if term length >=5
    if " " not in term_n:
        if len(term_n) < 5:
            return False  # require exact for short terms like otp, sebi, rbi
        for tok in _tokenize(text_n):
            if tok == term_n:
                return True
            if len(tok) >= 5 and _levenshtein(tok, term_n) <= 2:
                return True
    else:
        parts = term_n.split()
        # For multi-word, require each part exact or fuzzy if length>=5
        if any(len(p) < 3 for p in parts):
            return False
        tokens = _tokenize(text_n)
        for i in range(len(tokens) - len(parts) + 1):
            match = True
            for k, part in enumerate(parts):
                tok = tokens[i+k]
                if tok == part:
                    continue
                if len(part) >= 5 and len(tok) >=5 and _levenshtein(tok, part) <=2:
                    continue
                match = False
                break
            if match:
                return True
    return False

def detect_social_engineering(note: str, upi_id: str | None = None, recipient: str | None = None) -> List[Dict[str, Any]]:
    """
    Scan note + UPI/recipient for social engineering language.
    Returns list of structured signals (deterministic).
    """
    text = f"{note or ''} {upi_id or ''} {recipient or ''}"
    text_n = _normalize_text(text)
    if not text_n:
        return []

    signals: List[Dict[str, Any]] = []

    def add_signal(sig_id: str, category: str, severity: str, score: int, matched_terms: List[str], desc: str):
        if not matched_terms:
            return
        # Deduplicate by sig_id inside this detector
        if any(s["id"] == sig_id for s in signals):
            return
        signals.append({
            "id": sig_id,
            "category": category,
            "severity": severity,
            "score": score,
            "evidence": {"matched_terms": matched_terms[:5], "text_snippet": text[:80]},
            "description": desc,
            "source": "keyword_engine",
        })

    # ── 1. Urgency ──
    hits = [t for t in URGENCY_TERMS if _fuzzy_contains(text, t)]
    if hits:
        sev = "HIGH" if len(hits) >= 2 else "MEDIUM"
        score = 16 if len(hits) >= 2 else 8
        add_signal("urgency_language", "SOCIAL_ENGINEERING", sev, score, hits,
                   f"Message contains urgency/pressure language: {', '.join(hits[:3])}")

    # ── 2. OTP request ──
    hits = [t for t in OTP_TERMS if _fuzzy_contains(text, t)]
    if hits:
        add_signal("otp_request_language", "SOCIAL_ENGINEERING", "HIGH", 20, hits,
                   f"Message requests OTP/PIN/credentials: {', '.join(hits[:2])} — classic phishing pattern")

    # ── 3. Impersonation ──
    hits = [t for t in IMPERSONATION_TERMS if _fuzzy_contains(text, t)]
    # Check UPI handle impersonation separately via upi structure? For now generic.
    if hits:
        # If UPI contains brand but not trusted handle, that's stronger
        sev = "HIGH" if len(hits) >= 2 else "MEDIUM"
        add_signal("impersonation_language", "SOCIAL_ENGINEERING", sev, CATEGORY_WEIGHTS["impersonation"], hits,
                   f"Message impersonates authority: {', '.join(hits[:3])}")

    # ── 4. Account threat ──
    hits = [t for t in ACCOUNT_THREAT_TERMS if _fuzzy_contains(text, t)]
    if hits:
        add_signal("account_suspension_threat", "SOCIAL_ENGINEERING", "HIGH", CATEGORY_WEIGHTS["account_threat"], hits,
                   f"Threatens account blocking/closure or KYC verification: {', '.join(hits[:2])}")

    # ── 5. Reward/prize ──
    hits = [t for t in REWARD_TERMS if _fuzzy_contains(text, t)]
    if hits:
        sev = "HIGH" if len(hits) >= 2 else "MEDIUM"
        score = CATEGORY_WEIGHTS["reward"] if sev == "MEDIUM" else 20
        add_signal("reward_prize_scam", "SOCIAL_ENGINEERING", sev, score, hits,
                   f"Prize/lottery/reward lure detected: {', '.join(hits[:2])}")

    # ── 6. Investment ──
    hits = [t for t in INVESTMENT_TERMS if _fuzzy_contains(text, t)]
    if hits:
        add_signal("investment_scam", "SOCIAL_ENGINEERING", "HIGH", CATEGORY_WEIGHTS["investment"], hits,
                   f"Investment/return promise detected: {', '.join(hits[:2])}")

    # ── 7. Loan ──
    hits = [t for t in LOAN_TERMS if _fuzzy_contains(text, t)]
    if hits:
        add_signal("loan_scam", "SOCIAL_ENGINEERING", "MEDIUM", CATEGORY_WEIGHTS["loan"], hits,
                   f"Fake loan offer detected: {', '.join(hits[:2])}")

    # ── 8. Remote access ──
    hits = [t for t in REMOTE_ACCESS_TERMS if _fuzzy_contains(text, t)]
    if hits:
        add_signal("remote_access_request", "SOCIAL_ENGINEERING", "CRITICAL", CATEGORY_WEIGHTS["remote_access"], hits,
                   f"Requests remote access or app download ({', '.join(hits[:2])}) — high-risk scam tactic")

    return signals

def detect_upi_structural_risk(upi_id: str | None) -> List[Dict[str, Any]]:
    """
    Optional structural UPI analysis (mirrors js scoreUPIStructure).
    Returns signals if UPI handle is suspicious.
    """
    if not upi_id or "@" not in upi_id:
        return []
    local, handle = upi_id.split("@", 1)
    local = local.lower()
    handle = handle.lower()

    TRUSTED = {"paytm","phonepe","gpay","googlepay","amazonpay","bhim","ybl","oksbi","okaxis",
               "okhdfcbank","okicici","upi","razorpay","payu","upi","axisbank","hdfcbank","icicibank"}
    SCAM_HANDLES = {"lucky","prize","winner","claim","refund","support","helpdesk","kyc","verify","alert"}

    signals = []
    if handle in SCAM_HANDLES:
        signals.append({
            "id": "suspicious_upi_handle",
            "category": "RECIPIENT",
            "severity": "HIGH",
            "score": 18,
            "evidence": {"handle": handle},
            "description": f'UPI handle "@{handle}" is commonly associated with scam patterns',
            "source": "keyword_engine",
        })
    if handle not in TRUSTED and any(brand in local for brand in ["amazon","flipkart","paytm","phonepe","google","sbi","hdfc","rbi","gov"]):
        signals.append({
            "id": "impersonation_upi",
            "category": "SOCIAL_ENGINEERING",
            "severity": "CRITICAL",
            "score": 24,
            "evidence": {"local": local, "handle": handle},
            "description": f'UPI "{upi_id}" impersonates brand/government but uses unverified handle',
            "source": "keyword_engine",
        })
    return signals
