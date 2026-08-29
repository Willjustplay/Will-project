"""Personal Vault backend tests — iteration 3 AI Assistant (Gemini 3 Flash).

Covers:
- POST /api/ai/chat -> {reply}
- POST /api/ai/parse-transaction -> parsed tx object with wallet resolution
- GET/DELETE /api/ai/history persistence + clearing
- Device isolation
- 400 without X-Device-Id
"""
import os
import time
import uuid

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE, "EXPO_PUBLIC_BACKEND_URL not set"
API = f"{BASE}/api"

DEV = f"TEST_ai_{uuid.uuid4().hex[:8]}"
DEV2 = f"TEST_ai2_{uuid.uuid4().hex[:8]}"


def h(dev):
    return {"X-Device-Id": dev, "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def _seed_and_cleanup():
    # seed wallets + a transaction so /ai/chat has context
    requests.get(f"{API}/wallets", headers=h(DEV), timeout=20)
    requests.post(f"{API}/transactions", headers=h(DEV), json={
        "type": "income", "amount": 500000, "category": "Gaji",
        "note": "TEST_ai_seed", "date": "2026-01-05"
    }, timeout=20)
    yield
    # cleanup ai history
    requests.delete(f"{API}/ai/history", headers=h(DEV), timeout=15)
    requests.delete(f"{API}/ai/history", headers=h(DEV2), timeout=15)


# ---------- 400 without device id ----------
class TestAuthGuard:
    def test_chat_requires_device_id(self):
        r = requests.post(f"{API}/ai/chat", json={"message": "hi"}, timeout=20)
        assert r.status_code == 400

    def test_parse_requires_device_id(self):
        r = requests.post(f"{API}/ai/parse-transaction", json={"text": "beli kopi 20rb"}, timeout=20)
        assert r.status_code == 400

    def test_history_requires_device_id(self):
        r = requests.get(f"{API}/ai/history", timeout=15)
        assert r.status_code == 400
        r2 = requests.delete(f"{API}/ai/history", timeout=15)
        assert r2.status_code == 400


# ---------- Chat ----------
class TestAIChat:
    def test_chat_returns_reply(self):
        r = requests.post(f"{API}/ai/chat", headers=h(DEV),
                          json={"message": "Halo, siapa kamu?"}, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "reply" in data and isinstance(data["reply"], str) and len(data["reply"]) > 0

    def test_chat_history_persists(self):
        # Ensure the previous message is stored
        r = requests.get(f"{API}/ai/history", headers=h(DEV), timeout=15)
        assert r.status_code == 200
        hist = r.json()
        assert isinstance(hist, list) and len(hist) >= 2
        roles = [m["role"] for m in hist]
        assert "user" in roles and "assistant" in roles
        assert hist[0]["role"] == "user"
        # order chronological
        for m in hist:
            assert "content" in m and "created_at" in m

    def test_chat_context_awareness(self):
        # Chat should be able to reference the seeded transaction amount
        r = requests.post(f"{API}/ai/chat", headers=h(DEV),
                          json={"message": "Berapa total saldo saya sekarang? Jawab singkat."}, timeout=90)
        assert r.status_code == 200, r.text
        reply = r.json().get("reply", "").lower()
        # Just check reply mentions Rp or a number — LLM output is soft
        assert "rp" in reply or "500" in reply or "saldo" in reply

    def test_clear_history(self):
        r = requests.delete(f"{API}/ai/history", headers=h(DEV), timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True
        h2 = requests.get(f"{API}/ai/history", headers=h(DEV), timeout=15).json()
        assert h2 == []


# ---------- Parse transaction ----------
class TestAIParse:
    def test_parse_expense_with_wallet(self):
        # ensure wallets exist on DEV2
        wallets = requests.get(f"{API}/wallets", headers=h(DEV2), timeout=20).json()
        wnames = {w["name"] for w in wallets}
        assert "Dompet Digital" in wnames

        r = requests.post(f"{API}/ai/parse-transaction", headers=h(DEV2),
                          json={"text": "beli makan siang 25rb pakai dompet digital"}, timeout=90)
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["type"] == "expense"
        assert float(tx["amount"]) == 25000
        assert tx["category"] in ["Makanan", "Lainnya"]  # accept Lainnya as fallback
        assert tx["category"] == "Makanan"  # strong expectation from prompt
        # wallet_id must be resolved to Dompet Digital's id
        dd = next(w for w in wallets if w["name"] == "Dompet Digital")
        assert tx["wallet_id"] == dd["id"], f"expected {dd['id']}, got {tx['wallet_id']}"
        assert tx["date"] and len(tx["date"]) == 10  # YYYY-MM-DD

    def test_parse_income_5jt(self):
        r = requests.post(f"{API}/ai/parse-transaction", headers=h(DEV2),
                          json={"text": "gaji masuk 5jt ke bank"}, timeout=90)
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["type"] == "income"
        assert float(tx["amount"]) == 5_000_000
        # Category should be Gaji
        assert tx["category"] in ["Gaji", "Lainnya"]
        # wallet resolved to Bank
        wallets = requests.get(f"{API}/wallets", headers=h(DEV2), timeout=15).json()
        bank = next((w for w in wallets if w["name"].lower() == "bank"), None)
        assert bank is not None
        assert tx["wallet_id"] == bank["id"]

    def test_parse_cash_expense(self):
        r = requests.post(f"{API}/ai/parse-transaction", headers=h(DEV2),
                          json={"text": "bayar listrik 150rb tunai"}, timeout=90)
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["type"] == "expense"
        assert float(tx["amount"]) == 150000
        wallets = requests.get(f"{API}/wallets", headers=h(DEV2), timeout=15).json()
        tunai = next(w for w in wallets if w["name"] == "Tunai")
        assert tx["wallet_id"] == tunai["id"]


# ---------- Device isolation ----------
class TestDeviceIsolation:
    def test_history_isolated(self):
        DEV_A = f"TEST_iso_a_{uuid.uuid4().hex[:6]}"
        DEV_B = f"TEST_iso_b_{uuid.uuid4().hex[:6]}"
        requests.post(f"{API}/ai/chat", headers=h(DEV_A),
                      json={"message": "halo dari A"}, timeout=90)
        hb = requests.get(f"{API}/ai/history", headers=h(DEV_B), timeout=15).json()
        assert hb == []
        ha = requests.get(f"{API}/ai/history", headers=h(DEV_A), timeout=15).json()
        assert len(ha) >= 2
        # cleanup
        requests.delete(f"{API}/ai/history", headers=h(DEV_A), timeout=15)
