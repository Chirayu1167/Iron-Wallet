import unittest
import tempfile
from pathlib import Path

from risk_engine.engine import RiskEngine
import iron_store


ROOT = Path(__file__).resolve().parents[1]


class PaymentAuthorityTests(unittest.TestCase):
    def test_familiar_payment_is_safe_without_signals(self):
        result = RiskEngine().assess(
            behavior={"score": 8, "confidence": 0.9, "signals": []},
            fraud_intelligence={"score": 4, "confidence": 0.9, "signals": []},
            recipient={"score": 2, "confidence": 0.9, "signals": []},
            context={"score": 0, "confidence": 0.9, "signals": []},
        )

        self.assertEqual(result["tier"], "SAFE")
        self.assertFalse(result["requires_otp"])
        self.assertEqual(result["signals"], [])
        self.assertEqual(result["fraud_label"], "LEGITIMATE")

    def test_unusual_payment_preserves_grounded_reasons(self):
        result = RiskEngine().assess(
            behavior={
                "score": 82,
                "confidence": 0.9,
                "signals": [{
                    "feature": "amount_deviation",
                    "severity": "high",
                    "description": "Amount is far outside this user's usual spending pattern",
                }],
            },
            fraud_intelligence={
                "score": 76,
                "confidence": 0.9,
                "signals": [{
                    "id": "unfamiliar_device",
                    "category": "NETWORK",
                    "severity": "HIGH",
                    "score": 18,
                    "description": "Transaction from an unfamiliar device",
                    "source": "device_engine",
                }],
            },
            recipient={
                "score": 10,
                "confidence": 0.9,
                "signals": [{
                    "id": "recipient_new",
                    "category": "RECIPIENT",
                    "severity": "MEDIUM",
                    "score": 12,
                    "description": "You have not previously paid this recipient",
                    "source": "recipient_intelligence",
                }],
            },
            context={"score": 60, "confidence": 0.8, "signals": []},
        )

        self.assertIn(result["tier"], {"CAUTION", "HIGH_RISK"})
        descriptions = {signal["description"] for signal in result["signals"]}
        self.assertIn("Amount is far outside this user's usual spending pattern", descriptions)
        self.assertIn("Transaction from an unfamiliar device", descriptions)

    def test_real_payment_flow_requires_backend_confirm(self):
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        start = source.index("async function completePayment()")
        end = source.index("\n  if (showCooldown", start)
        payment_fn = source[start:end]

        self.assertIn("/transactions/confirm", payment_fn)
        self.assertNotRegex(
            payment_fn.split("/transactions/confirm", 1)[0],
            r"\b(addTx|updateBalance)\s*\(",
        )

    def test_frontend_has_no_local_payment_fallback(self):
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        start = source.index("async function completePayment()")
        end = source.index("\n  if (showCooldown", start)
        payment_fn = source[start:end]

        self.assertNotIn("fallback legacy", payment_fn.lower())
        self.assertIn("Payment preparation has expired", payment_fn)
        self.assertIn("Do not locally deduct", payment_fn)

    def test_source_payment_handler_is_not_local_only(self):
        source = (ROOT / "js" / "pages" / "send-money.js").read_text(encoding="utf-8")
        start = source.index("async function completePayment()")
        end = source.index("\n  if (showCooldown", start)
        payment_fn = source[start:end]

        self.assertIn("/transactions/confirm", payment_fn)
        confirm_pos = payment_fn.index("/transactions/confirm")
        self.assertNotRegex(payment_fn[:confirm_pos], r"\b(addTx|updateBalance)\s*\(")

    def test_security_ledger_hash_chain_and_sensitive_data_filtering(self):
        original_db = iron_store.DB_PATH
        with tempfile.TemporaryDirectory() as tmp:
            iron_store.DB_PATH = Path(tmp) / "iron.db"
            iron_store.init_db()
            iron_store.create_user("9000000000", "Demo User", 1000, verified=True)
            first = iron_store.append_security_ledger_event(
                "9000000000", "RISK_ASSESSMENT",
                {"tier": "SAFE", "otp": "123456", "recipient": "9000000001", "signal_count": 0},
            )
            second = iron_store.append_security_ledger_event(
                "9000000000", "PAYMENT_CONFIRMED",
                {"transaction_id": "tx-demo", "tier": "SAFE"},
            )
            self.assertEqual(second["previous_hash"], first["current_hash"])
            self.assertTrue(iron_store.verify_security_ledger("9000000000")["intact"])
            entries = iron_store.get_security_ledger("9000000000")
            self.assertNotIn("otp", entries[-1]["metadata"])
            self.assertNotIn("recipient", entries[-1]["metadata"])
            conn = iron_store._conn()
            conn.execute("UPDATE security_ledger SET metadata_json='{\"tier\":\"HIGH_RISK\"}' WHERE event_id=?", (first["event_id"],))
            conn.commit()
            conn.close()
            verification = iron_store.verify_security_ledger("9000000000")
            self.assertFalse(verification["intact"])
            self.assertEqual(verification["broken_sequence"], first["sequence"])
        iron_store.DB_PATH = original_db

    def test_frontend_cancel_is_not_confirmation(self):
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        start = source.index("async function cancelPayment()")
        end = source.index("\n  async function completePayment()", start)
        cancel_fn = source[start:end]
        self.assertIn("PAYMENT_CANCELLED", cancel_fn)
        self.assertNotIn("/transactions/confirm", cancel_fn)


if __name__ == "__main__":
    unittest.main()
