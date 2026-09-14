from fastapi.testclient import TestClient
from otp_server import app
import iron_store, json, time
client = TestClient(app)
def token_for(phone):
    return iron_store.create_session(phone)

# Setup bench user with 5 baseline
bench_phone="9000000099"
# Ensure history 5 of 500
import pathlib
# Check current history
from otp_server import _assistant_attempts
_assistant_attempts.clear()
hdr={"Authorization": f"Bearer {token_for(bench_phone)}"}
txn={"user_id":bench_phone,"amount":500,"hour_of_day":12,"day_of_week":"Monday","is_weekend":0,"is_salary_period":0,"merchant_name":"9158763151","merchant_category":"Transfer","recipient_type":"individual","payment_method":"UPI","device_familiarity":1.0,"location_familiarity":1.0,"balance_before":100000,"account_age_days":365,"recipient_frequency_score":0.0,"days_since_recipient_seen":999,"merchant_frequency_score":0.5,"recipient_report_count":0,"is_off_network":False,"urgency_score":0.0,"note":"","txn_velocity_1h":1,"txn_velocity_5m":1,"txn_velocity_24h":1,"unique_recipients_30m":1,"amount_velocity_24h":0,"recent_amounts":[],"daily_spend_today":0}
profile={"user_id":bench_phone}
r=client.post("/risk/assess", json={"transaction":txn,"user_profile":profile}, headers=hdr)
print(r.status_code)
print(json.dumps(r.json(), indent=2))
