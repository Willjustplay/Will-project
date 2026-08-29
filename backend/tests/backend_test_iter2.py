"""Personal Vault backend tests — iteration 2 new features.

Covers:
- /api/wallets: auto-seed 3 defaults for new device, create/update/soft-delete, device isolation
- /api/transactions: wallet_id persisted and returned
- /api/upload: folder form field; /api/files returns folder; raw download still works
- /api/backup/export: shape (app='personal-vault', data with 7 collections)
- /api/backup/import: idempotent upsert, cross-device restore
"""
import io
import os
import uuid

import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE, "EXPO_PUBLIC_BACKEND_URL not set"
API = f"{BASE}/api"

DEV_W = f"TEST_wlt_{uuid.uuid4().hex[:8]}"
DEV_W2 = f"TEST_wlt2_{uuid.uuid4().hex[:8]}"
DEV_BKP_SRC = f"TEST_bkp_src_{uuid.uuid4().hex[:8]}"
DEV_BKP_DST = f"TEST_bkp_dst_{uuid.uuid4().hex[:8]}"


def h(dev):
    return {"X-Device-Id": dev, "Content-Type": "application/json"}


# ---------- wallets ----------
class TestWallets:
    created_ids = []

    def test_auto_seed_defaults_new_device(self):
        r = requests.get(f"{API}/wallets", headers=h(DEV_W), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) == 3
        names = {w["name"] for w in data}
        types = {w["type"] for w in data}
        assert names == {"Tunai", "Bank", "Dompet Digital"}, names
        assert types == {"cash", "bank", "ewallet"}, types
        # idempotent — second call must not re-seed
        r2 = requests.get(f"{API}/wallets", headers=h(DEV_W), timeout=20).json()
        assert len(r2) == 3
        assert {w["id"] for w in r2} == {w["id"] for w in data}

    def test_create_custom_wallet(self):
        r = requests.post(f"{API}/wallets", headers=h(DEV_W),
                          json={"name": "DANA", "type": "ewallet"}, timeout=15)
        assert r.status_code == 200, r.text
        w = r.json()
        assert w["name"] == "DANA" and w["type"] == "ewallet" and "id" in w
        TestWallets.created_ids.append(w["id"])
        # verify persisted via GET
        lst = requests.get(f"{API}/wallets", headers=h(DEV_W), timeout=15).json()
        assert any(x["id"] == w["id"] and x["name"] == "DANA" for x in lst)
        assert len(lst) == 4

    def test_update_wallet(self):
        wid = TestWallets.created_ids[0]
        r = requests.put(f"{API}/wallets/{wid}", headers=h(DEV_W),
                         json={"name": "DANA Pro", "type": "ewallet"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "DANA Pro"
        lst = requests.get(f"{API}/wallets", headers=h(DEV_W), timeout=15).json()
        assert any(x["id"] == wid and x["name"] == "DANA Pro" for x in lst)

    def test_delete_wallet_soft(self):
        wid = TestWallets.created_ids[0]
        r = requests.delete(f"{API}/wallets/{wid}", headers=h(DEV_W), timeout=15)
        assert r.status_code == 200
        lst = requests.get(f"{API}/wallets", headers=h(DEV_W), timeout=15).json()
        assert all(x["id"] != wid for x in lst)
        assert len(lst) == 3

    def test_device_isolation(self):
        # DEV_W2 must get its own fresh 3 defaults, not see DEV_W wallets
        w1 = requests.get(f"{API}/wallets", headers=h(DEV_W), timeout=15).json()
        w2 = requests.get(f"{API}/wallets", headers=h(DEV_W2), timeout=15).json()
        assert len(w2) == 3
        assert set(x["id"] for x in w1).isdisjoint(set(x["id"] for x in w2))
        # cross-device update returns 404
        wid = w1[0]["id"]
        r = requests.put(f"{API}/wallets/{wid}", headers=h(DEV_W2),
                         json={"name": "Hack", "type": "cash"}, timeout=15)
        assert r.status_code == 404


# ---------- transactions with wallet_id ----------
class TestTransactionWallet:
    def test_create_transaction_with_wallet_id(self):
        wallets = requests.get(f"{API}/wallets", headers=h(DEV_W), timeout=15).json()
        wid = wallets[0]["id"]
        payload = {"type": "expense", "amount": 25000, "category": "Makanan",
                   "note": "TEST_wallet_tx", "date": "2026-01-10", "wallet_id": wid}
        r = requests.post(f"{API}/transactions", headers=h(DEV_W), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["wallet_id"] == wid
        # verify persisted
        lst = requests.get(f"{API}/transactions", headers=h(DEV_W), timeout=15).json()
        got = next((t for t in lst if t["id"] == tx["id"]), None)
        assert got is not None
        assert got["wallet_id"] == wid
        # cleanup
        requests.delete(f"{API}/transactions/{tx['id']}", headers=h(DEV_W), timeout=15)


# ---------- files w/ folder ----------
class TestFilesFolder:
    def test_upload_with_folder_and_list(self):
        files = {"file": ("TEST_kartu.png", io.BytesIO(b"\x89PNG\r\n\x1a\nfake"), "image/png")}
        data = {"folder": "Kartu"}
        r = requests.post(f"{API}/upload", headers={"X-Device-Id": DEV_W},
                          files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        f = r.json()
        assert f["folder"] == "Kartu"
        assert f["kind"] == "image"
        fid = f["id"]
        # list returns folder
        lst = requests.get(f"{API}/files", headers=h(DEV_W), timeout=15).json()
        got = next((x for x in lst if x["id"] == fid), None)
        assert got and got["folder"] == "Kartu"
        # raw download still works (via token)
        raw = requests.get(f"{API}/files/{fid}/raw?token={DEV_W}", timeout=30)
        assert raw.status_code == 200
        assert raw.headers.get("content-type", "").startswith("image/")
        # cleanup
        requests.delete(f"{API}/files/{fid}", headers=h(DEV_W), timeout=15)

    def test_upload_default_folder_is_lainnya(self):
        files = {"file": ("TEST_default.txt", io.BytesIO(b"hello"), "text/plain")}
        r = requests.post(f"{API}/upload", headers={"X-Device-Id": DEV_W},
                          files=files, timeout=30)
        assert r.status_code == 200, r.text
        f = r.json()
        assert f["folder"] == "Lainnya"
        requests.delete(f"{API}/files/{f['id']}", headers=h(DEV_W), timeout=15)


# ---------- backup export / import ----------
class TestBackup:
    def test_export_shape(self):
        # seed something on DEV_BKP_SRC
        requests.get(f"{API}/wallets", headers=h(DEV_BKP_SRC), timeout=15)  # seed wallets
        t = requests.post(f"{API}/transactions", headers=h(DEV_BKP_SRC), json={
            "type": "income", "amount": 100000, "category": "TEST_backup",
            "note": "seed", "date": "2026-01-05"
        }, timeout=15).json()
        requests.post(f"{API}/vault", headers=h(DEV_BKP_SRC), json={
            "service": "TEST_svc", "username": "u", "password": "p", "note": ""
        }, timeout=15)
        r = requests.get(f"{API}/backup/export", headers=h(DEV_BKP_SRC), timeout=30)
        assert r.status_code == 200, r.text
        payload = r.json()
        assert payload.get("app") == "personal-vault"
        assert "data" in payload
        for k in ["transactions", "events", "tasks", "reminders", "vault", "wallets", "files"]:
            assert k in payload["data"], f"missing key {k}"
        assert len(payload["data"]["wallets"]) == 3
        assert any(x["id"] == t["id"] for x in payload["data"]["transactions"])
        TestBackup._payload = payload

    def test_import_cross_device_and_idempotent(self):
        payload = TestBackup._payload
        # DEV_BKP_DST is empty
        # Import onto DST
        r = requests.post(f"{API}/backup/import", headers=h(DEV_BKP_DST),
                          json=payload, timeout=30)
        assert r.status_code == 200, r.text
        counts = r.json().get("imported", {})
        assert counts.get("wallets") == 3
        assert counts.get("transactions") >= 1

        # Verify DST now sees the same transactions/wallets by id
        tx_dst = requests.get(f"{API}/transactions", headers=h(DEV_BKP_DST), timeout=15).json()
        wal_dst = requests.get(f"{API}/wallets", headers=h(DEV_BKP_DST), timeout=15).json()
        src_tx_ids = {t["id"] for t in payload["data"]["transactions"]}
        src_wal_ids = {w["id"] for w in payload["data"]["wallets"]}
        assert src_tx_ids.issubset({t["id"] for t in tx_dst})
        assert src_wal_ids.issubset({w["id"] for w in wal_dst})

        # Idempotent — reimport, counts identical, no dup rows
        r2 = requests.post(f"{API}/backup/import", headers=h(DEV_BKP_DST),
                           json=payload, timeout=30)
        assert r2.status_code == 200
        tx_dst2 = requests.get(f"{API}/transactions", headers=h(DEV_BKP_DST), timeout=15).json()
        assert len(tx_dst2) == len(tx_dst)
