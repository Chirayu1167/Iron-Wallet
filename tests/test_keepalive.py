import tempfile
import unittest
from pathlib import Path

import iron_store


class KeepaliveRepairTests(unittest.TestCase):
    def test_maintenance_expires_stale_preparations(self):
        original_db = iron_store.DB_PATH
        with tempfile.TemporaryDirectory() as tmp:
            iron_store.DB_PATH = Path(tmp) / "iron.db"
            iron_store.init_db()
            iron_store.create_user("9000000000", "Demo User", 100000, verified=True)
            # Fresh preparation: expires in 10 min, must be left alone.
            fresh = iron_store.create_transaction("9000000000", "9000000001", 100, 10, "SAFE")
            # Stale preparation: backdate expires_at past now.
            stale = iron_store.create_transaction("9000000000", "9000000001", 100, 10, "SAFE")
            conn = iron_store._conn()
            conn.execute(
                "UPDATE transactions SET expires_at='2000-01-01T00:00:00Z' WHERE transaction_id=?",
                (stale["transaction_id"],),
            )
            conn.commit()
            conn.close()
            summary = iron_store.run_maintenance()
            self.assertEqual(summary["expired_transactions"], 1)
            self.assertEqual(iron_store.get_transaction(fresh["transaction_id"])["status"], "PENDING")
            stale_row = iron_store.get_transaction(stale["transaction_id"])
            self.assertEqual(stale_row["status"], "FAILED")
            self.assertEqual(stale_row["outcome"], "EXPIRED")
            # Confirm-time logic still rejects it as expired, never pays out.
            res = iron_store.confirm_transaction_atomic("9000000000", stale["transaction_id"], 100)
            self.assertFalse(res["ok"])
            self.assertIn("expir", res["error"])
        iron_store.DB_PATH = original_db

    def test_maintenance_sweeps_expired_sessions_only(self):
        original_db = iron_store.DB_PATH
        with tempfile.TemporaryDirectory() as tmp:
            iron_store.DB_PATH = Path(tmp) / "iron.db"
            iron_store.init_db()
            iron_store.create_user("9000000000", "Demo User", 100000, verified=True)
            live = iron_store.create_session("9000000000")
            dead = iron_store.create_session("9000000000")
            conn = iron_store._conn()
            conn.execute(
                "UPDATE sessions SET expires_at='2000-01-01T00:00:00Z' WHERE token=?",
                (dead,),
            )
            conn.commit()
            conn.close()
            summary = iron_store.run_maintenance()
            self.assertEqual(summary["expired_sessions"], 1)
            self.assertIsNotNone(iron_store.get_session(live))
            self.assertIsNone(iron_store.get_session(dead))
        iron_store.DB_PATH = original_db

    def test_maintenance_never_touches_confirmed(self):
        original_db = iron_store.DB_PATH
        with tempfile.TemporaryDirectory() as tmp:
            iron_store.DB_PATH = Path(tmp) / "iron.db"
            iron_store.init_db()
            iron_store.create_user("9000000000", "Demo User", 100000, verified=True)
            tx = iron_store.create_transaction("9000000000", "9000000001", 100, 10, "SAFE")
            res = iron_store.confirm_transaction_atomic("9000000000", tx["transaction_id"], 100)
            self.assertTrue(res["ok"])
            summary = iron_store.run_maintenance()
            self.assertEqual(summary["expired_transactions"], 0)
            row = iron_store.get_transaction(tx["transaction_id"])
            self.assertEqual(row["status"], "SUCCESS")
        iron_store.DB_PATH = original_db

    def test_health_reports_self_check(self):
        import os

        import otp_server

        resp = otp_server.health()
        self.assertEqual(resp["status"], "ok")
        self.assertIn("self_check", resp)
        self.assertIn("last_ping_at", resp["self_check"])
        # Keepalive target honours explicit override, else Render URL, else local.
        os.environ["KEEPALIVE_URL"] = "https://example.onrender.com/"
        try:
            self.assertEqual(
                otp_server._keepalive_target(), "https://example.onrender.com/health"
            )
        finally:
            del os.environ["KEEPALIVE_URL"]


if __name__ == "__main__":
    unittest.main()
