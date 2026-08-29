"""Personal Vault backend regression tests.

Covers:
- /api/transactions (POST/GET/DELETE)
- /api/events (POST/GET/DELETE)
- /api/tasks (POST/GET/PATCH/DELETE)
- /api/reminders (POST/GET/PATCH/DELETE)
- /api/vault (POST/GET/PUT/DELETE)
- /api/upload, /api/files, /api/files/{id}/raw?token=, /api/files/{id} (DELETE)
- Device isolation via X-Device-Id header
"""
import io
import os
import uuid

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE, "EXPO_PUBLIC_BACKEND_URL not set in frontend/.env"
API = f"{BASE}/api"

DEVICE_A = f"TEST_dev_a_{uuid.uuid4().hex[:8]}"
DEVICE_B = f"TEST_dev_b_{uuid.uuid4().hex[:8]}"


def h(device: str, extra=None):
    d = {"X-Device-Id": device, "Content-Type": "application/json"}
    if extra:
        d.update(extra)
    return d


# --- root ---
def test_root():
    r = requests.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert "Personal Vault" in r.json().get("message", "")


def test_missing_device_id_returns_400():
    r = requests.get(f"{API}/transactions", timeout=15)
    assert r.status_code == 400


# --- transactions ---
class TestTransactions:
    ids = []

    def test_create_income(self):
        payload = {"type": "income", "amount": 500000, "category": "Gaji",
                   "note": "TEST_income", "date": "2026-01-15"}
        r = requests.post(f"{API}/transactions", headers=h(DEVICE_A), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["type"] == "income" and d["amount"] == 500000 and d["category"] == "Gaji"
        assert "id" in d
        TestTransactions.ids.append(d["id"])

    def test_create_expense(self):
        payload = {"type": "expense", "amount": 25000, "category": "Makan",
                   "note": "TEST_lunch", "date": "2026-01-15"}
        r = requests.post(f"{API}/transactions", headers=h(DEVICE_A), json=payload, timeout=15)
        assert r.status_code == 200
        TestTransactions.ids.append(r.json()["id"])

    def test_list_returns_created(self):
        r = requests.get(f"{API}/transactions", headers=h(DEVICE_A), timeout=15)
        assert r.status_code == 200
        got_ids = {t["id"] for t in r.json()}
        for tid in TestTransactions.ids:
            assert tid in got_ids

    def test_delete_soft(self):
        tid = TestTransactions.ids[0]
        r = requests.delete(f"{API}/transactions/{tid}", headers=h(DEVICE_A), timeout=15)
        assert r.status_code == 200
        # verify gone from list
        r2 = requests.get(f"{API}/transactions", headers=h(DEVICE_A), timeout=15)
        assert tid not in {t["id"] for t in r2.json()}


# --- events ---
class TestEvents:
    eid = None

    def test_create_event(self):
        r = requests.post(f"{API}/events", headers=h(DEVICE_A),
                          json={"title": "TEST_meet", "date": "2026-01-20", "time": "10:00", "note": "n"},
                          timeout=15)
        assert r.status_code == 200
        TestEvents.eid = r.json()["id"]
        assert r.json()["title"] == "TEST_meet"

    def test_list_events(self):
        r = requests.get(f"{API}/events", headers=h(DEVICE_A), timeout=15)
        assert r.status_code == 200
        assert TestEvents.eid in {e["id"] for e in r.json()}

    def test_delete_event(self):
        r = requests.delete(f"{API}/events/{TestEvents.eid}", headers=h(DEVICE_A), timeout=15)
        assert r.status_code == 200


# --- tasks ---
class TestTasks:
    tid = None

    def test_create_task(self):
        r = requests.post(f"{API}/tasks", headers=h(DEVICE_A),
                          json={"title": "TEST_task", "due_date": "2026-01-25"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["done"] is False
        TestTasks.tid = d["id"]

    def test_patch_done_true(self):
        r = requests.patch(f"{API}/tasks/{TestTasks.tid}", headers=h(DEVICE_A),
                           json={"done": True}, timeout=15)
        assert r.status_code == 200
        assert r.json()["done"] is True

    def test_patch_task_not_found(self):
        r = requests.patch(f"{API}/tasks/nonexistent-id", headers=h(DEVICE_A),
                           json={"done": True}, timeout=15)
        assert r.status_code == 404

    def test_delete_task(self):
        r = requests.delete(f"{API}/tasks/{TestTasks.tid}", headers=h(DEVICE_A), timeout=15)
        assert r.status_code == 200


# --- reminders ---
class TestReminders:
    rid = None

    def test_create_reminder(self):
        r = requests.post(f"{API}/reminders", headers=h(DEVICE_A),
                          json={"label": "TEST_wake", "time": "06:30", "days": ["Sen", "Sel"]},
                          timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["enabled"] is True and d["days"] == ["Sen", "Sel"]
        TestReminders.rid = d["id"]

    def test_patch_enabled_false(self):
        r = requests.patch(f"{API}/reminders/{TestReminders.rid}", headers=h(DEVICE_A),
                           json={"enabled": False}, timeout=15)
        assert r.status_code == 200
        assert r.json()["enabled"] is False

    def test_delete_reminder(self):
        r = requests.delete(f"{API}/reminders/{TestReminders.rid}",
                            headers=h(DEVICE_A), timeout=15)
        assert r.status_code == 200


# --- vault ---
class TestVault:
    vid = None

    def test_create_vault(self):
        r = requests.post(f"{API}/vault", headers=h(DEVICE_A),
                          json={"service": "TEST_Instagram", "username": "u1",
                                "password": "p@ss1", "note": "n"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["password"] == "p@ss1"
        TestVault.vid = d["id"]

    def test_list_vault(self):
        r = requests.get(f"{API}/vault", headers=h(DEVICE_A), timeout=15)
        assert r.status_code == 200
        assert TestVault.vid in {a["id"] for a in r.json()}

    def test_update_vault(self):
        r = requests.put(f"{API}/vault/{TestVault.vid}", headers=h(DEVICE_A),
                         json={"service": "TEST_Instagram2", "username": "u1",
                               "password": "newpass", "note": "n2"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["password"] == "newpass"
        assert r.json()["service"] == "TEST_Instagram2"

    def test_delete_vault(self):
        r = requests.delete(f"{API}/vault/{TestVault.vid}", headers=h(DEVICE_A), timeout=15)
        assert r.status_code == 200


# --- files (object storage) ---
class TestFiles:
    fid = None

    def test_upload_file(self):
        content = b"TEST_file_content_" + uuid.uuid4().bytes
        files = {"file": ("TEST_file.txt", io.BytesIO(content), "text/plain")}
        r = requests.post(f"{API}/upload", headers={"X-Device-Id": DEVICE_A},
                          files=files, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["filename"] == "TEST_file.txt"
        assert d["content_type"] == "text/plain"
        assert d["size"] == len(content)
        TestFiles.fid = d["id"]
        TestFiles.expected = content

    def test_list_files(self):
        r = requests.get(f"{API}/files", headers={"X-Device-Id": DEVICE_A}, timeout=30)
        assert r.status_code == 200
        assert TestFiles.fid in {f["id"] for f in r.json()}

    def test_get_raw_via_token(self):
        # token=<device_id> for web preview
        r = requests.get(f"{API}/files/{TestFiles.fid}/raw",
                         params={"token": DEVICE_A}, timeout=30)
        assert r.status_code == 200
        assert r.content == TestFiles.expected

    def test_get_raw_via_header(self):
        r = requests.get(f"{API}/files/{TestFiles.fid}/raw",
                         headers={"X-Device-Id": DEVICE_A}, timeout=30)
        assert r.status_code == 200
        assert r.content == TestFiles.expected

    def test_get_raw_other_device_denied(self):
        r = requests.get(f"{API}/files/{TestFiles.fid}/raw",
                         params={"token": DEVICE_B}, timeout=30)
        assert r.status_code == 404

    def test_delete_file(self):
        r = requests.delete(f"{API}/files/{TestFiles.fid}",
                            headers={"X-Device-Id": DEVICE_A}, timeout=15)
        assert r.status_code == 200
        # verify absent
        r2 = requests.get(f"{API}/files", headers={"X-Device-Id": DEVICE_A}, timeout=15)
        assert TestFiles.fid not in {f["id"] for f in r2.json()}


# --- device isolation ---
class TestDeviceIsolation:
    def test_transactions_isolated(self):
        # create for A
        r = requests.post(f"{API}/transactions", headers=h(DEVICE_A),
                          json={"type": "income", "amount": 1, "category": "TEST_iso",
                                "note": "", "date": "2026-01-01"}, timeout=15)
        assert r.status_code == 200
        tid = r.json()["id"]
        # list as B should not see it
        rb = requests.get(f"{API}/transactions", headers=h(DEVICE_B), timeout=15)
        assert rb.status_code == 200
        assert tid not in {t["id"] for t in rb.json()}
        # cleanup
        requests.delete(f"{API}/transactions/{tid}", headers=h(DEVICE_A), timeout=15)

    def test_vault_isolated(self):
        r = requests.post(f"{API}/vault", headers=h(DEVICE_A),
                          json={"service": "TEST_iso", "username": "u", "password": "p"},
                          timeout=15)
        assert r.status_code == 200
        vid = r.json()["id"]
        rb = requests.get(f"{API}/vault", headers=h(DEVICE_B), timeout=15)
        assert vid not in {a["id"] for a in rb.json()}
        # cross-device update should not affect other device's list
        ru = requests.put(f"{API}/vault/{vid}", headers=h(DEVICE_B),
                          json={"service": "hack", "username": "x", "password": "y"},
                          timeout=15)
        assert ru.status_code == 404
        requests.delete(f"{API}/vault/{vid}", headers=h(DEVICE_A), timeout=15)
