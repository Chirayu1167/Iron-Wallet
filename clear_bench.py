import iron_store, time, uuid
phone="9000000099"
conn=iron_store._conn()
cur=conn.cursor()
cur.execute("DELETE FROM transactions WHERE phone=?", (phone,))
conn.commit()
conn.close()
# seed 5 baseline
base=time.time() - 5*3600
for i in range(5):
    ts=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(base+i*3600))
    conn=iron_store._conn()
    cur=conn.cursor()
    tx_id=str(uuid.uuid4())
    cur.execute("INSERT INTO transactions (transaction_id, user_id, phone, recipient, recipient_name, amount, timestamp, status, risk_score, risk_tier, verification_method, verification_status, outcome, note, expires_at, confirmed_at, raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (tx_id, phone, phone, "9158763151", "Pranav", 500, ts, "SUCCESS", 10, "SAFE", "NONE", "NONE", "PROCEEDED", "baseline", ts, ts, "{}"))
    conn.commit()
    conn.close()
print("reseeded 5")
