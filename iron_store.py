"""
iron_store.py — IRON Wallet persistence layer (Phase 3A)
Simple SQLite abstraction, no scattered SQL in otp_server.py.
All callers use functions like get_user(), get_balance(), create_transaction(), etc.
DB file: data/iron.db (outside static allowlist, not served)
"""
import sqlite3
import json
import time
import uuid
import os
from pathlib import Path
from typing import Dict, Any, List, Optional

DB_PATH = Path(__file__).parent / "data" / "iron.db"

# ── connection helper ─────────────────────────────────────────────────────────

def _conn():
    conn = sqlite3.connect(str(DB_PATH), timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # WAL for concurrent read/write, foreign keys on
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
    except:
        pass
    return conn

def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = _conn()
    cur = conn.cursor()
    # Users — persisted balance, profile refs, device baseline
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        phone TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        balance REAL NOT NULL DEFAULT 0,
        display_name TEXT,
        age INTEGER,
        verified INTEGER DEFAULT 0,
        upi TEXT,
        contacts_json TEXT,
        risk_score REAL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_seen TEXT,
        device_baseline_json TEXT,
        location_baseline_json TEXT
    );""")
    # Transactions — authoritative, server timestamps, no BLOCK
    cur.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        transaction_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        phone TEXT NOT NULL,
        recipient TEXT NOT NULL,
        recipient_name TEXT,
        amount REAL NOT NULL,
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL, -- PENDING | SUCCESS | FAILED | HIGH_RISK | VERIFIED
        risk_score INTEGER,
        risk_tier TEXT, -- SAFE | CAUTION | HIGH_RISK
        verification_method TEXT,
        verification_status TEXT, -- NONE | OTP_REQUESTED | OTP_SUCCESS | OTP_FAILED
        outcome TEXT, -- PREPARED | PROCEEDED | PROCEEDED_AFTER_OTP | FAILED_VALIDATION etc
        note TEXT,
        expires_at TEXT,
        confirmed_at TEXT,
        raw_json TEXT,
        FOREIGN KEY(phone) REFERENCES users(phone)
    );""")
    # Risk events — separate from transactions
    cur.execute("""
    CREATE TABLE IF NOT EXISTS risk_events (
        event_id TEXT PRIMARY KEY,
        transaction_id TEXT,
        user_id TEXT NOT NULL,
        phone TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        risk_score INTEGER,
        tier TEXT,
        confidence REAL,
        signals_json TEXT,
        verification_required TEXT,
        verification_result TEXT,
        outcome TEXT,
        raw_json TEXT
    );""")
    # Verification events — OTP etc, never plaintext OTP
    cur.execute("""
    CREATE TABLE IF NOT EXISTS verification_events (
        event_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        phone TEXT NOT NULL,
        transaction_id TEXT,
        timestamp TEXT NOT NULL,
        method TEXT NOT NULL, -- OTP_REQUESTED | OTP_SUCCESS | OTP_FAILED | OTP_EXPIRED
        result TEXT NOT NULL,
        meta_json TEXT
    );""")
    # Device/location baseline (simple key-value per user)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS baselines (
        phone TEXT PRIMARY KEY,
        last_device_json TEXT,
        last_location_json TEXT,
        last_seen TEXT,
        created_at TEXT NOT NULL
    );""")
    # Sessions/tokens (for auth, Phase 2B)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_used TEXT
    );""")
    # Phase 12/13: Transaction reports (reporting a transaction as suspicious)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS transaction_reports (
        report_id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        phone TEXT NOT NULL,
        reporter TEXT NOT NULL,
        reason TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        raw_json TEXT
    );""")
    # Phase 13: Security events (LOGIN, OTP_VERIFIED, RISK_ESCALATED etc)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS security_events (
        event_id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        transaction_id TEXT,
        meta_json TEXT
    );""")
    conn.commit()
    conn.close()

# ── users ────────────────────────────────────────────────────────────────────

def get_user(phone: str) -> Optional[Dict[str, Any]]:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE phone=?", (phone,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    # Parse JSON fields
    try:
        d["contacts"] = json.loads(d["contacts_json"]) if d["contacts_json"] else {}
    except: d["contacts"] = {}
    try:
        d["device_baseline"] = json.loads(d["device_baseline_json"]) if d["device_baseline_json"] else None
    except: d["device_baseline"] = None
    try:
        d["location_baseline"] = json.loads(d["location_baseline_json"]) if d["location_baseline_json"] else None
    except: d["location_baseline"] = None
    return d

def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE user_id=?", (user_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return get_user(row["phone"])

def create_user(phone: str, name: str, balance: float = 0, age: int = 30, verified: bool = False, upi: str = "", contacts: Dict = None) -> Dict[str, Any]:
    conn = _conn()
    cur = conn.cursor()
    user_id = phone  # use phone as user_id for simplicity (matches frontend)
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    # Idempotent: if exists, return existing
    cur.execute("SELECT phone FROM users WHERE phone=?", (phone,))
    if cur.fetchone():
        conn.close()
        return get_user(phone)
    contacts_json = json.dumps(contacts or {})
    cur.execute("INSERT INTO users (phone, user_id, name, balance, display_name, age, verified, upi, contacts_json, risk_score, created_at, last_seen) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (phone, user_id, name, float(balance), name, int(age), 1 if verified else 0, upi, contacts_json, 0, now, now))
    conn.commit()
    conn.close()
    return get_user(phone)

def update_balance(phone: str, new_balance: float):
    conn = _conn()
    cur = conn.cursor()
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    cur.execute("UPDATE users SET balance=?, last_seen=? WHERE phone=?", (float(new_balance), now, phone))
    conn.commit()
    conn.close()

def get_balance(phone: str) -> Optional[float]:
    u = get_user(phone)
    return float(u["balance"]) if u else None

def list_users() -> List[Dict[str, Any]]:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT phone FROM users")
    rows = cur.fetchall()
    conn.close()
    return [get_user(r["phone"]) for r in rows]

# ── transactions ──────────────────────────────────────────────────────────────

def create_transaction(phone: str, recipient: str, amount: float, risk_score: int, risk_tier: str, status: str = "PENDING", verification_method: str = "NONE", note: str = "", expires_at: str = None, recipient_name: str = "") -> Dict[str, Any]:
    conn = _conn()
    cur = conn.cursor()
    tx_id = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if not expires_at:
        # 10 min expiry for prepare
        expires_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 600))
    user = get_user(phone)
    user_id = user["user_id"] if user else phone
    raw = json.dumps({"recipient": recipient, "amount": amount, "note": note})
    cur.execute("INSERT INTO transactions (transaction_id, user_id, phone, recipient, recipient_name, amount, timestamp, status, risk_score, risk_tier, verification_method, verification_status, outcome, note, expires_at, raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (tx_id, user_id, phone, recipient, recipient_name, float(amount), now, status, int(risk_score), risk_tier, verification_method, "NONE", "PREPARED", note, expires_at, raw))
    conn.commit()
    conn.close()
    return get_transaction(tx_id)

def get_transaction(tx_id: str) -> Optional[Dict[str, Any]]:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM transactions WHERE transaction_id=?", (tx_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return dict(row)

def get_transactions_for_user(phone: str, limit: int = 100) -> List[Dict[str, Any]]:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM transactions WHERE phone=? ORDER BY timestamp DESC LIMIT ?", (phone, limit))
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_transaction_confirmed(tx_id: str, new_status: str, outcome: str, verification_status: str = None):
    conn = _conn()
    cur = conn.cursor()
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if verification_status:
        cur.execute("UPDATE transactions SET status=?, outcome=?, verification_status=?, confirmed_at=? WHERE transaction_id=?", (new_status, outcome, verification_status, now, tx_id))
    else:
        cur.execute("UPDATE transactions SET status=?, outcome=?, confirmed_at=? WHERE transaction_id=?", (new_status, outcome, now, tx_id))
    conn.commit()
    conn.close()

def is_duplicate_confirm(tx_id: str) -> bool:
    tx = get_transaction(tx_id)
    if not tx:
        return False
    return tx["outcome"] in ("PROCEEDED", "PROCEEDED_AFTER_OTP", "SUCCESS") or tx["status"] in ("SUCCESS", "HIGH_RISK", "VERIFIED")

# Atomic balance deduction + transaction confirm
def confirm_transaction_atomic(phone: str, tx_id: str, expected_amount: float) -> Dict[str, Any]:
    """
    Atomically: check tx belongs to phone, not expired, not already confirmed, sufficient balance, deduct, update tx.
    Returns dict with success flag and updated transaction or error.
    """
    conn = _conn()
    cur = conn.cursor()
    try:
        # Use transaction
        cur.execute("BEGIN IMMEDIATE")
        cur.execute("SELECT * FROM transactions WHERE transaction_id=?", (tx_id,))
        row = cur.fetchone()
        if not row:
            conn.rollback()
            return {"ok": False, "error": "invalid transaction"}
        tx = dict(row)
        if tx["phone"] != phone:
            conn.rollback()
            return {"ok": False, "error": "wrong user transaction"}
        if tx["outcome"] in ("PROCEEDED", "PROCEEDED_AFTER_OTP") or tx["status"] in ("SUCCESS", "HIGH_RISK", "VERIFIED"):
            # Idempotent: already done, return existing
            conn.rollback()
            return {"ok": True, "duplicate": True, "transaction": tx}
        # Check expiry — use UTC (calendar.timegm) not local mktime
        try:
            import calendar
            exp = calendar.timegm(time.strptime(tx["expires_at"], "%Y-%m-%dT%H:%M:%SZ"))
            if time.time() > exp:
                cur.execute("UPDATE transactions SET status=?, outcome=? WHERE transaction_id=?", ("FAILED", "FAILED_VALIDATION", tx_id))
                conn.commit()
                return {"ok": False, "error": "expired preparation"}
        except: pass
        # Check balance
        cur.execute("SELECT balance FROM users WHERE phone=?", (phone,))
        urow = cur.fetchone()
        if not urow:
            conn.rollback()
            return {"ok": False, "error": "user not found"}
        balance = float(urow["balance"])
        amt = float(tx["amount"])
        if abs(amt - float(expected_amount)) > 0.01:
            # amount mismatch, but use tx amount
            pass
        if balance < amt - 1e-9:
            conn.rollback()
            return {"ok": False, "error": "insufficient balance"}
        new_balance = balance - amt
        if new_balance < -1e-9:
            conn.rollback()
            return {"ok": False, "error": "negative balance"}
        # Deduct
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        cur.execute("UPDATE users SET balance=?, last_seen=? WHERE phone=?", (new_balance, now, phone))
        # Update transaction
        # Keep original risk tier but mark as success/high_risk
        new_status = "SUCCESS"
        if tx["risk_tier"] == "HIGH_RISK":
            new_status = "HIGH_RISK"
        # Determine verification status from tx
        vstat = tx["verification_status"]
        outcome = "PROCEEDED_AFTER_OTP" if vstat == "OTP_SUCCESS" else "PROCEEDED"
        cur.execute("UPDATE transactions SET status=?, outcome=?, verification_status=?, confirmed_at=? WHERE transaction_id=?", (new_status, outcome, vstat, now, tx_id))
        conn.commit()
        # Fetch updated
        cur.execute("SELECT * FROM transactions WHERE transaction_id=?", (tx_id,))
        updated = dict(cur.fetchone())
        # Get new balance
        cur.execute("SELECT balance FROM users WHERE phone=?", (phone,))
        bal = float(cur.fetchone()["balance"])
        conn.close()
        return {"ok": True, "duplicate": False, "transaction": updated, "balance": bal}
    except Exception as e:
        try: conn.rollback()
        except: pass
        try: conn.close()
        except: pass
        return {"ok": False, "error": str(e)}

# ── risk events ───────────────────────────────────────────────────────────────

def create_risk_event(phone: str, transaction_id: str, risk_score: int, tier: str, confidence: float, signals: List[str], verification_required: str, verification_result: str, outcome: str) -> Dict[str, Any]:
    conn = _conn()
    cur = conn.cursor()
    event_id = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    user = get_user(phone)
    user_id = user["user_id"] if user else phone
    cur.execute("INSERT INTO risk_events (event_id, transaction_id, user_id, phone, timestamp, risk_score, tier, confidence, signals_json, verification_required, verification_result, outcome, raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (event_id, transaction_id, user_id, phone, now, int(risk_score), tier, float(confidence), json.dumps(signals), verification_required, verification_result, outcome, json.dumps({"signals": signals})))
    conn.commit()
    conn.close()
    return {"event_id": event_id, "transaction_id": transaction_id, "phone": phone, "risk_score": risk_score, "tier": tier}

def get_risk_events(phone: str, limit: int = 50) -> List[Dict[str, Any]]:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM risk_events WHERE phone=? ORDER BY timestamp DESC LIMIT ?", (phone, limit))
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ── verification events ──────────────────────────────────────────────────────

def create_verification_event(phone: str, transaction_id: str, method: str, result: str, meta: Dict = None):
    conn = _conn()
    cur = conn.cursor()
    event_id = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    user = get_user(phone)
    user_id = user["user_id"] if user else phone
    cur.execute("INSERT INTO verification_events (event_id, user_id, phone, transaction_id, timestamp, method, result, meta_json) VALUES (?,?,?,?,?,?,?,?)",
                (event_id, user_id, phone, transaction_id, now, method, result, json.dumps(meta or {})))
    conn.commit()
    conn.close()
    return event_id

def get_verification_events(phone: str, limit: int = 50) -> List[Dict[str, Any]]:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM verification_events WHERE phone=? ORDER BY timestamp DESC LIMIT ?", (phone, limit))
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ── baselines ────────────────────────────────────────────────────────────────

def save_baseline(phone: str, device_json: Dict = None, location_json: Dict = None):
    conn = _conn()
    cur = conn.cursor()
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    cur.execute("SELECT phone FROM baselines WHERE phone=?", (phone,))
    exists = cur.fetchone()
    if exists:
        if device_json is not None:
            cur.execute("UPDATE baselines SET last_device_json=?, last_seen=? WHERE phone=?", (json.dumps(device_json), now, phone))
        if location_json is not None:
            cur.execute("UPDATE baselines SET last_location_json=?, last_seen=? WHERE phone=?", (json.dumps(location_json), now, phone))
    else:
        cur.execute("INSERT INTO baselines (phone, last_device_json, last_location_json, last_seen, created_at) VALUES (?,?,?,?,?)",
                    (phone, json.dumps(device_json) if device_json else None, json.dumps(location_json) if location_json else None, now, now))
    conn.commit()
    conn.close()

def get_baseline(phone: str) -> Optional[Dict[str, Any]]:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM baselines WHERE phone=?", (phone,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    try: d["device"] = json.loads(d["last_device_json"]) if d["last_device_json"] else None
    except: d["device"] = None
    try: d["location"] = json.loads(d["last_location_json"]) if d["last_location_json"] else None
    except: d["location"] = None
    return d

# ── sessions ──────────────────────────────────────────────────────────────────

def create_session(phone: str, ttl_seconds: int = 3600*24) -> str:
    import secrets
    token = secrets.token_urlsafe(32)
    now = time.time()
    expires = now + ttl_seconds
    now_s = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))
    exp_s = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(expires))
    conn = _conn()
    cur = conn.cursor()
    cur.execute("INSERT INTO sessions (token, phone, user_id, created_at, expires_at, last_used) VALUES (?,?,?,?,?,?)",
                (token, phone, phone, now_s, exp_s, now_s))
    conn.commit()
    conn.close()
    return token

def get_session(token: str) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM sessions WHERE token=?", (token,))
    row = cur.fetchone()
    if not row:
        conn.close()
        return None
    d = dict(row)
    # Check expiry — UTC
    try:
        import calendar
        exp = calendar.timegm(time.strptime(d["expires_at"], "%Y-%m-%dT%H:%M:%SZ"))
        if time.time() > exp:
            cur.execute("DELETE FROM sessions WHERE token=?", (token,))
            conn.commit()
            conn.close()
            return None
        # Update last_used
        now_s = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        cur.execute("UPDATE sessions SET last_used=? WHERE token=?", (now_s, token))
        conn.commit()
    except:
        pass
    conn.close()
    return d

def delete_session(token: str):
    conn = _conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM sessions WHERE token=?", (token,))
    conn.commit()
    conn.close()

def get_sessions_for_user(phone: str, limit: int = 50) -> List[Dict[str, Any]]:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM sessions WHERE phone=? ORDER BY last_used DESC LIMIT ?", (phone, limit))
    rows = cur.fetchall()
    conn.close()
    # filter expired
    out = []
    import calendar
    now = time.time()
    for r in rows:
        d = dict(r)
        try:
            exp = calendar.timegm(time.strptime(d["expires_at"], "%Y-%m-%dT%H:%M:%SZ"))
            if now > exp:
                continue
        except: pass
        # mask token for privacy — only last 6
        td = dict(d)
        td["token_masked"] = td["token"][-6:] if len(td["token"])>6 else "***"
        td["is_current_hint"] = False
        out.append(td)
    return out

def delete_session_by_token_for_user(token: str, phone: str) -> bool:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT phone FROM sessions WHERE token=?", (token,))
    row = cur.fetchone()
    if not row:
        conn.close()
        return False
    if row["phone"] != phone:
        conn.close()
        return False
    cur.execute("DELETE FROM sessions WHERE token=?", (token,))
    conn.commit()
    conn.close()
    return True

# ── Phase 12/13: transaction reports ─────────────────────────────────────────

def create_transaction_report(phone: str, transaction_id: str, reason: str, note: str = "") -> Dict[str, Any]:
    conn = _conn()
    cur = conn.cursor()
    report_id = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    # verify transaction belongs to user or exists
    cur.execute("SELECT transaction_id FROM transactions WHERE transaction_id=? AND phone=?", (transaction_id, phone))
    if not cur.fetchone():
        conn.close()
        return {"error": "transaction not found or not owned"}
    # dedup: same phone+transaction_id only once
    cur.execute("SELECT report_id FROM transaction_reports WHERE transaction_id=? AND phone=?", (transaction_id, phone))
    if cur.fetchone():
        cur.execute("SELECT * FROM transaction_reports WHERE transaction_id=? AND phone=?", (transaction_id, phone))
        existing = dict(cur.fetchone())
        conn.close()
        return {"report_id": existing["report_id"], "deduplicated": True, "existing": existing}
    raw = json.dumps({"reason": reason, "note": note})
    cur.execute("INSERT INTO transaction_reports (report_id, transaction_id, phone, reporter, reason, note, created_at, raw_json) VALUES (?,?,?,?,?,?,?,?)",
                (report_id, transaction_id, phone, phone, reason, note or "", now, raw))
    conn.commit()
    cur.execute("SELECT * FROM transaction_reports WHERE report_id=?", (report_id,))
    row = dict(cur.fetchone())
    conn.close()
    return {"report_id": report_id, "transaction_id": transaction_id, "reason": reason, "created_at": now, "reported": True}

def get_transaction_reports(phone: str, limit: int = 50) -> List[Dict[str, Any]]:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM transaction_reports WHERE phone=? ORDER BY created_at DESC LIMIT ?", (phone, limit))
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def is_transaction_reported(phone: str, transaction_id: str) -> bool:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM transaction_reports WHERE phone=? AND transaction_id=?", (phone, transaction_id))
    row = cur.fetchone()
    conn.close()
    return bool(row)

# ── Phase 13: security events ────────────────────────────────────────────────

_ALLOWED_SECURITY_EVENT_TYPES = {"LOGIN","LOGOUT","OTP_VERIFIED","PIN_CHANGED","RISK_ESCALATED","HIGH_RISK_PAYMENT_VERIFIED","RECIPIENT_REPORTED","UNUSUAL_ACTIVITY","SESSION_REVOKED","NEW_RECIPIENT","VERIFICATION_COMPLETED"}
_ALLOWED_SEVERITIES = {"INFO","LOW","MEDIUM","HIGH"}

def create_security_event(phone: str, event_type: str, severity: str, title: str, description: str, transaction_id: Optional[str] = None, meta: Dict[str,Any]=None) -> Dict[str,Any]:
    # sanitize severity/type
    if event_type not in _ALLOWED_SECURITY_EVENT_TYPES:
        event_type = "UNUSUAL_ACTIVITY"
    if severity not in _ALLOWED_SEVERITIES:
        severity = "INFO"
    conn = _conn()
    cur = conn.cursor()
    event_id = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    user = get_user(phone)
    user_id = user["user_id"] if user else phone
    # NEVER store raw OTP/PIN/secrets — sanitize meta
    safe_meta = {}
    if meta:
        for k,v in meta.items():
            if k.lower() in ("otp","pin","password","secret","token","api_key"):
                continue
            safe_meta[k]=v
    cur.execute("INSERT INTO security_events (event_id, phone, user_id, type, severity, title, description, timestamp, transaction_id, meta_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (event_id, phone, user_id, event_type, severity, title, description, now, transaction_id, json.dumps(safe_meta)))
    conn.commit()
    conn.close()
    return {"event_id": event_id, "type": event_type, "severity": severity, "title": title, "description": description, "timestamp": now, "transaction_id": transaction_id}

def get_security_events(phone: str, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM security_events WHERE phone=? ORDER BY timestamp DESC LIMIT ? OFFSET ?", (phone, limit, offset))
    rows = cur.fetchall()
    conn.close()
    out=[]
    for r in rows:
        d=dict(r)
        try:
            d["meta"]= json.loads(d["meta_json"]) if d["meta_json"] else {}
        except: d["meta"]={}
        # remove raw
        d.pop("meta_json",None)
        out.append(d)
    return out

def get_security_events_count(phone: str) -> int:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) as cnt FROM security_events WHERE phone=?", (phone,))
    row = cur.fetchone()
    conn.close()
    return int(row["cnt"]) if row else 0

def get_recent_security_events_summary(phone: str, limit: int = 5) -> List[Dict[str,Any]]:
    return get_security_events(phone, limit=limit, offset=0)

# ── seeding ───────────────────────────────────────────────────────────────────

def seed_users_if_needed():
    # Idempotent seeding from js/constants.js known users
    # Only creates if not exists, does not overwrite existing balances
    seed = [
        ("9340228345","Chirayu Mahajan",84250,21,True,"chirayu@ironwallet"),
        ("9158763151","Pranav Chopade",32780,30,True,"pranav@ironwallet"),
        ("9766876442","Farhan Farooqui",15400,65,False,"farhan@ironwallet"),
        ("9876543210","Mehul Patil",67120,19,True,"mehul@ironwallet"),
        ("9699189866","Vedant Deshmukh",51900,28,True,"vedant@ironwallet"),
        ("9988776655","Rajesh Kumar",125000,45,True,"rajesh@ironwallet"),
        ("9123456789","Amit Sharma",45000,35,True,"amit@ironwallet"),
        ("8899776655","Sneha Reddy",89000,29,False,"sneha@ironwallet"),
        ("7778889990","Vikram Singh",230000,52,True,"vikram@ironwallet"),
        ("9988001122","Irfan Khan",34000,42,False,"irfan@ironwallet"),
        ("9663355221","Zara Sheikh",67800,31,True,"zara@ironwallet"),
        ("8765432109","Rohan Deshmukh",28500,26,False,"rohan@ironwallet"),
        ("7654321098","Kavita Sharma",92300,38,True,"kavita@ironwallet"),
        ("9699624733","Shivshree Shinde",90000,19,True,"shivshree@ironwallet"),
        ("1234567890","Admin",9999999,99,True,"admin@ironwallet"),
    ]
    for phone,name,bal,age,ver,upi in seed:
        if not get_user(phone):
            create_user(phone, name, bal, age, ver, upi, contacts={})
    # Ensure at least one known contact per user for demo (contacts already in JS, not needed in DB)
    return True

def seed_transactions_if_needed():
    # Seed some demo transactions if none exist for a user
    # Idempotent: only if user has 0 transactions
    for phone in ["9340228345","9158763151"]:
        txs = get_transactions_for_user(phone, limit=1)
        if not txs:
            # Create a demo seeded tx as successful
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time()-86400))
            conn = _conn()
            cur = conn.cursor()
            tx_id = str(uuid.uuid4())
            cur.execute("INSERT INTO transactions (transaction_id, user_id, phone, recipient, recipient_name, amount, timestamp, status, risk_score, risk_tier, verification_method, verification_status, outcome, note, expires_at, confirmed_at, raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (tx_id, phone, phone, "9158763151" if phone=="9340228345" else "9340228345", "Seed", 500, now, "SUCCESS", 12, "SAFE", "NONE", "NONE", "PROCEEDED", "Seed", now, now, "{}"))
            conn.commit()
            conn.close()
    return True

# Initialize on import
try:
    init_db()
    seed_users_if_needed()
    seed_transactions_if_needed()
except Exception as e:
    # Don't crash on import if DB fails (e.g., permissions)
    print(f"[iron_store] init failed: {e}")
