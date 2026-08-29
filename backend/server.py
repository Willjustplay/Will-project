from fastapi import FastAPI, APIRouter, Header, HTTPException, UploadFile, File, Form, Query, Body
from fastapi.responses import Response
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import json
import requests
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Object Storage (Emergent managed)
# ---------------------------------------------------------------------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "personalvault"
storage_key = None


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_device(x_device_id: Optional[str]) -> str:
    if not x_device_id:
        raise HTTPException(status_code=400, detail="Missing device id")
    return x_device_id


def clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class Transaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # income | expense
    amount: float
    category: str
    note: Optional[str] = ""
    date: str  # ISO date string (YYYY-MM-DD)
    wallet_id: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class TransactionCreate(BaseModel):
    type: str
    amount: float
    category: str
    note: Optional[str] = ""
    date: str
    wallet_id: Optional[str] = ""


class Event(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    date: str  # YYYY-MM-DD
    time: Optional[str] = ""
    note: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class EventCreate(BaseModel):
    title: str
    date: str
    time: Optional[str] = ""
    note: Optional[str] = ""


class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    done: bool = False
    due_date: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class TaskCreate(BaseModel):
    title: str
    due_date: Optional[str] = ""


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    done: Optional[bool] = None
    due_date: Optional[str] = None


class Reminder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str
    time: str  # HH:MM
    enabled: bool = True
    days: List[str] = Field(default_factory=list)  # e.g. ["Sen","Sel"]
    created_at: str = Field(default_factory=now_iso)


class ReminderCreate(BaseModel):
    label: str
    time: str
    days: List[str] = Field(default_factory=list)


class ReminderUpdate(BaseModel):
    label: Optional[str] = None
    time: Optional[str] = None
    enabled: Optional[bool] = None
    days: Optional[List[str]] = None


class VaultAccount(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    service: str
    username: str
    password: str
    note: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class VaultAccountCreate(BaseModel):
    service: str
    username: str
    password: str
    note: Optional[str] = ""


class Wallet(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str  # cash | bank | ewallet
    created_at: str = Field(default_factory=now_iso)


class WalletCreate(BaseModel):
    name: str
    type: str


# ---------------------------------------------------------------------------
# Routes: root
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "Personal Vault API"}


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------
@api_router.post("/transactions", response_model=Transaction)
async def create_transaction(input: TransactionCreate, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    obj = Transaction(**input.dict())
    doc = obj.dict()
    doc["device_id"] = device
    doc["deleted_at"] = None
    await db.transactions.insert_one(doc)
    return obj


@api_router.get("/transactions", response_model=List[Transaction])
async def list_transactions(x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    docs = await db.transactions.find({"device_id": device, "deleted_at": None}).sort("date", -1).to_list(2000)
    return [Transaction(**clean(d)) for d in docs]


@api_router.delete("/transactions/{item_id}")
async def delete_transaction(item_id: str, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    await db.transactions.update_one(
        {"id": item_id, "device_id": device}, {"$set": {"deleted_at": now_iso()}}
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Events (Jadwal)
# ---------------------------------------------------------------------------
@api_router.post("/events", response_model=Event)
async def create_event(input: EventCreate, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    obj = Event(**input.dict())
    doc = obj.dict()
    doc["device_id"] = device
    doc["deleted_at"] = None
    await db.events.insert_one(doc)
    return obj


@api_router.get("/events", response_model=List[Event])
async def list_events(x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    docs = await db.events.find({"device_id": device, "deleted_at": None}).sort("date", 1).to_list(2000)
    return [Event(**clean(d)) for d in docs]


@api_router.delete("/events/{item_id}")
async def delete_event(item_id: str, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    await db.events.update_one(
        {"id": item_id, "device_id": device}, {"$set": {"deleted_at": now_iso()}}
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Tasks (Tugas)
# ---------------------------------------------------------------------------
@api_router.post("/tasks", response_model=Task)
async def create_task(input: TaskCreate, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    obj = Task(**input.dict())
    doc = obj.dict()
    doc["device_id"] = device
    doc["deleted_at"] = None
    await db.tasks.insert_one(doc)
    return obj


@api_router.get("/tasks", response_model=List[Task])
async def list_tasks(x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    docs = await db.tasks.find({"device_id": device, "deleted_at": None}).sort("created_at", -1).to_list(2000)
    return [Task(**clean(d)) for d in docs]


@api_router.patch("/tasks/{item_id}", response_model=Task)
async def update_task(item_id: str, input: TaskUpdate, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    updates = {k: v for k, v in input.dict().items() if v is not None}
    if updates:
        await db.tasks.update_one({"id": item_id, "device_id": device}, {"$set": updates})
    doc = await db.tasks.find_one({"id": item_id, "device_id": device})
    if not doc:
        raise HTTPException(status_code=404, detail="Task not found")
    return Task(**clean(doc))


@api_router.delete("/tasks/{item_id}")
async def delete_task(item_id: str, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    await db.tasks.update_one(
        {"id": item_id, "device_id": device}, {"$set": {"deleted_at": now_iso()}}
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Reminders (Alarm)
# ---------------------------------------------------------------------------
@api_router.post("/reminders", response_model=Reminder)
async def create_reminder(input: ReminderCreate, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    obj = Reminder(**input.dict())
    doc = obj.dict()
    doc["device_id"] = device
    doc["deleted_at"] = None
    await db.reminders.insert_one(doc)
    return obj


@api_router.get("/reminders", response_model=List[Reminder])
async def list_reminders(x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    docs = await db.reminders.find({"device_id": device, "deleted_at": None}).sort("time", 1).to_list(2000)
    return [Reminder(**clean(d)) for d in docs]


@api_router.patch("/reminders/{item_id}", response_model=Reminder)
async def update_reminder(item_id: str, input: ReminderUpdate, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    updates = {k: v for k, v in input.dict().items() if v is not None}
    if updates:
        await db.reminders.update_one({"id": item_id, "device_id": device}, {"$set": updates})
    doc = await db.reminders.find_one({"id": item_id, "device_id": device})
    if not doc:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return Reminder(**clean(doc))


@api_router.delete("/reminders/{item_id}")
async def delete_reminder(item_id: str, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    await db.reminders.update_one(
        {"id": item_id, "device_id": device}, {"$set": {"deleted_at": now_iso()}}
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Vault accounts (Sandi)
# ---------------------------------------------------------------------------
@api_router.post("/vault", response_model=VaultAccount)
async def create_vault(input: VaultAccountCreate, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    obj = VaultAccount(**input.dict())
    doc = obj.dict()
    doc["device_id"] = device
    doc["deleted_at"] = None
    await db.vault.insert_one(doc)
    return obj


@api_router.get("/vault", response_model=List[VaultAccount])
async def list_vault(x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    docs = await db.vault.find({"device_id": device, "deleted_at": None}).sort("service", 1).to_list(2000)
    return [VaultAccount(**clean(d)) for d in docs]


@api_router.put("/vault/{item_id}", response_model=VaultAccount)
async def update_vault(item_id: str, input: VaultAccountCreate, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    await db.vault.update_one({"id": item_id, "device_id": device}, {"$set": input.dict()})
    doc = await db.vault.find_one({"id": item_id, "device_id": device})
    if not doc:
        raise HTTPException(status_code=404, detail="Account not found")
    return VaultAccount(**clean(doc))


@api_router.delete("/vault/{item_id}")
async def delete_vault(item_id: str, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    await db.vault.update_one(
        {"id": item_id, "device_id": device}, {"$set": {"deleted_at": now_iso()}}
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Wallets (Kantong)
# ---------------------------------------------------------------------------
DEFAULT_WALLETS = [
    {"name": "Tunai", "type": "cash"},
    {"name": "Bank", "type": "bank"},
    {"name": "Dompet Digital", "type": "ewallet"},
]


@api_router.get("/wallets", response_model=List[Wallet])
async def list_wallets(x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    docs = await db.wallets.find({"device_id": device, "deleted_at": None}).sort("created_at", 1).to_list(500)
    if not docs:
        seeded = []
        for w in DEFAULT_WALLETS:
            obj = Wallet(**w)
            doc = obj.dict()
            doc["device_id"] = device
            doc["deleted_at"] = None
            seeded.append(doc)
        if seeded:
            await db.wallets.insert_many([dict(d) for d in seeded])
        docs = seeded
    return [Wallet(**clean(d)) for d in docs]


@api_router.post("/wallets", response_model=Wallet)
async def create_wallet(input: WalletCreate, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    obj = Wallet(**input.dict())
    doc = obj.dict()
    doc["device_id"] = device
    doc["deleted_at"] = None
    await db.wallets.insert_one(doc)
    return obj


@api_router.put("/wallets/{item_id}", response_model=Wallet)
async def update_wallet(item_id: str, input: WalletCreate, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    await db.wallets.update_one({"id": item_id, "device_id": device}, {"$set": input.dict()})
    doc = await db.wallets.find_one({"id": item_id, "device_id": device})
    if not doc:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return Wallet(**clean(doc))


@api_router.delete("/wallets/{item_id}")
async def delete_wallet(item_id: str, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    await db.wallets.update_one(
        {"id": item_id, "device_id": device}, {"$set": {"deleted_at": now_iso()}}
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Files (Berkas)
# ---------------------------------------------------------------------------
@api_router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    folder: str = Form("Lainnya"),
    x_device_id: str = Header(None),
):
    device = get_device(x_device_id)
    data = await file.read()
    ext = ""
    if file.filename and "." in file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/uploads/{device}/{file_id}.{ext}" if ext else f"{APP_NAME}/uploads/{device}/{file_id}"
    content_type = file.content_type or "application/octet-stream"
    try:
        await run_in_threadpool(put_object, storage_path, data, content_type)
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else 500
        if status == 402:
            raise HTTPException(status_code=402, detail="Penyimpanan penuh. Silakan tambah kredit.")
        raise HTTPException(status_code=500, detail="Gagal mengunggah berkas.")
    kind = "image" if content_type.startswith("image/") else "file"
    doc = {
        "id": file_id,
        "device_id": device,
        "filename": file.filename or file_id,
        "storage_path": storage_path,
        "content_type": content_type,
        "size": len(data),
        "kind": kind,
        "folder": folder or "Lainnya",
        "created_at": now_iso(),
        "deleted_at": None,
    }
    await db.files.insert_one(doc)
    return clean(dict(doc))


@api_router.get("/files")
async def list_files(x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    docs = await db.files.find({"device_id": device, "deleted_at": None}).sort("created_at", -1).to_list(2000)
    return [clean(d) for d in docs]


@api_router.get("/files/{file_id}/raw")
async def get_file_raw(
    file_id: str,
    x_device_id: str = Header(None),
    token: Optional[str] = Query(None),
):
    device = x_device_id or token
    if not device:
        raise HTTPException(status_code=400, detail="Missing device id")
    doc = await db.files.find_one({"id": file_id, "device_id": device, "deleted_at": None})
    if not doc:
        raise HTTPException(status_code=404, detail="Berkas tidak ditemukan")
    content, content_type = await run_in_threadpool(get_object, doc["storage_path"])
    return Response(content=content, media_type=content_type)


@api_router.delete("/files/{file_id}")
async def delete_file(file_id: str, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    await db.files.update_one(
        {"id": file_id, "device_id": device}, {"$set": {"deleted_at": now_iso()}}
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Backup (export / import)
# ---------------------------------------------------------------------------
BACKUP_COLLECTIONS = ["transactions", "events", "tasks", "reminders", "vault", "wallets", "files"]


@api_router.get("/backup/export")
async def backup_export(x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    data = {}
    for coll in BACKUP_COLLECTIONS:
        docs = await db[coll].find({"device_id": device, "deleted_at": None}).to_list(5000)
        data[coll] = [clean(d) for d in docs]
    return {
        "app": "personal-vault",
        "version": 1,
        "exported_at": now_iso(),
        "data": data,
    }


@api_router.post("/backup/import")
async def backup_import(payload: dict = Body(...), x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    data = payload.get("data", {})
    counts = {}
    for coll in BACKUP_COLLECTIONS:
        items = data.get(coll, [])
        n = 0
        for item in items:
            if not isinstance(item, dict) or "id" not in item:
                continue
            doc = dict(item)
            doc.pop("_id", None)
            doc["device_id"] = device
            doc.setdefault("deleted_at", None)
            await db[coll].replace_one(
                {"id": doc["id"], "device_id": device}, doc, upsert=True
            )
            n += 1
        counts[coll] = n
    return {"ok": True, "imported": counts}


# ---------------------------------------------------------------------------
# AI Assistant (Gemini 3 Flash)
# ---------------------------------------------------------------------------
AI_MODEL = ("gemini", "gemini-3-flash-preview")
EXPENSE_CATS = ["Makanan", "Transportasi", "Belanja", "Tagihan", "Hiburan", "Kesehatan", "Lainnya"]
INCOME_CATS = ["Gaji", "Bonus", "Investasi", "Hadiah", "Lainnya"]


class ChatIn(BaseModel):
    message: str


class ParseIn(BaseModel):
    text: str


def _rupiah(n: float) -> str:
    return "Rp" + f"{int(round(n)):,}".replace(",", ".")


async def build_snapshot(device: str) -> str:
    txns = await db.transactions.find({"device_id": device, "deleted_at": None}).sort("date", -1).to_list(1000)
    wallets = await db.wallets.find({"device_id": device, "deleted_at": None}).to_list(100)
    events = await db.events.find({"device_id": device, "deleted_at": None}).to_list(500)
    tasks = await db.tasks.find({"device_id": device, "deleted_at": None, "done": False}).to_list(500)
    reminders = await db.reminders.find({"device_id": device, "deleted_at": None, "enabled": True}).to_list(500)

    income = sum(t["amount"] for t in txns if t["type"] == "income")
    expense = sum(t["amount"] for t in txns if t["type"] == "expense")
    wname = {w["id"]: w["name"] for w in wallets}

    lines = [f"Total saldo: {_rupiah(income - expense)} (pemasukan {_rupiah(income)}, pengeluaran {_rupiah(expense)})."]
    if wallets:
        wb = []
        for w in wallets:
            bal = sum((t["amount"] if t["type"] == "income" else -t["amount"]) for t in txns if t.get("wallet_id") == w["id"])
            wb.append(f"{w['name']} {_rupiah(bal)}")
        lines.append("Kantong: " + ", ".join(wb) + ".")
    recent = txns[:8]
    if recent:
        rlist = [f"{t['date']} {('masuk' if t['type']=='income' else 'keluar')} {_rupiah(t['amount'])} {t['category']}" + (f" ({wname.get(t.get('wallet_id',''),'')})" if t.get("wallet_id") else "") for t in recent]
        lines.append("Transaksi terbaru: " + "; ".join(rlist) + ".")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    te = [e for e in events if e["date"] == today]
    if te:
        lines.append("Jadwal hari ini: " + ", ".join(f"{e.get('time','')} {e['title']}" for e in te) + ".")
    if tasks:
        lines.append(f"Tugas belum selesai ({len(tasks)}): " + ", ".join(t["title"] for t in tasks[:8]) + ".")
    if reminders:
        lines.append("Alarm aktif: " + ", ".join(f"{r['time']} {r['label']}" for r in reminders[:8]) + ".")
    return "\n".join(lines)


@api_router.get("/ai/history")
async def ai_history(x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    docs = await db.ai_messages.find({"device_id": device}).sort("created_at", 1).to_list(200)
    return [{"role": d["role"], "content": d["content"], "created_at": d["created_at"]} for d in docs]


@api_router.delete("/ai/history")
async def ai_history_clear(x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    await db.ai_messages.delete_many({"device_id": device})
    return {"ok": True}


@api_router.post("/ai/chat")
async def ai_chat(input: ChatIn, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    snapshot = await build_snapshot(device)
    history = await db.ai_messages.find({"device_id": device}).sort("created_at", -1).to_list(8)
    history = list(reversed(history))
    convo = "\n".join(f"{'Pengguna' if h['role']=='user' else 'Asisten'}: {h['content']}" for h in history)

    system_message = (
        "Kamu adalah asisten pribadi ramah di aplikasi 'Personal Vault' berbahasa Indonesia. "
        "Kamu membantu pengguna mengelola keuangan, jadwal, tugas, dan pengingat. "
        "Jawab singkat, jelas, dan membantu dalam Bahasa Indonesia. Gunakan format Rupiah (Rp) untuk uang. "
        "Berikan saran praktis berdasarkan data pengguna bila relevan. Jangan mengarang data yang tidak ada.\n\n"
        f"=== DATA PENGGUNA SAAT INI ===\n{snapshot}\n"
        + (f"\n=== PERCAKAPAN SEBELUMNYA ===\n{convo}\n" if convo else "")
    )
    try:
        chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"chat-{device}", system_message=system_message).with_model(*AI_MODEL)
        reply = await chat.send_message(UserMessage(text=input.message))
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        raise HTTPException(status_code=502, detail="Asisten AI sedang sibuk, coba lagi.")

    ts = now_iso()
    await db.ai_messages.insert_one({"device_id": device, "role": "user", "content": input.message, "created_at": ts})
    await db.ai_messages.insert_one({"device_id": device, "role": "assistant", "content": reply, "created_at": now_iso()})
    return {"reply": reply}


@api_router.post("/ai/parse-transaction")
async def ai_parse_transaction(input: ParseIn, x_device_id: str = Header(None)):
    device = get_device(x_device_id)
    wallets = await db.wallets.find({"device_id": device, "deleted_at": None}).to_list(100)
    wallet_names = [w["name"] for w in wallets]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    system_message = (
        "Kamu adalah pengurai transaksi keuangan. Ubah kalimat pengguna (Bahasa Indonesia) menjadi SATU objek JSON. "
        "Balas HANYA JSON tanpa penjelasan, tanpa markdown. Skema: "
        '{"type":"income|expense","amount":number,"category":string,"wallet_name":string|null,"note":string,"date":"YYYY-MM-DD"}. '
        f"amount dalam Rupiah tanpa titik/koma (contoh '25rb'->25000, '1.5jt'->1500000). "
        f"Untuk pengeluaran gunakan kategori dari: {EXPENSE_CATS}. Untuk pemasukan dari: {INCOME_CATS}. "
        f"Pilih kategori paling sesuai; jika ragu gunakan 'Lainnya'. "
        f"wallet_name harus cocok salah satu dari kantong pengguna: {wallet_names} (atau null jika tidak disebutkan). "
        f"date default hari ini ({today}) jika tidak disebutkan. note isi ringkasan singkat."
    )
    try:
        chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"parse-{device}", system_message=system_message).with_model(*AI_MODEL)
        raw = await chat.send_message(UserMessage(text=input.text))
    except Exception as e:
        logger.error(f"AI parse error: {e}")
        raise HTTPException(status_code=502, detail="Asisten AI sedang sibuk, coba lagi.")

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1:
        raise HTTPException(status_code=422, detail="Tidak dapat memahami kalimat. Coba lebih spesifik.")
    try:
        parsed = json.loads(cleaned[start : end + 1])
    except Exception:
        raise HTTPException(status_code=422, detail="Tidak dapat memahami kalimat. Coba lebih spesifik.")

    t_type = "income" if str(parsed.get("type", "expense")).lower().startswith("income") else "expense"
    try:
        amount = float(parsed.get("amount") or 0)
    except Exception:
        amount = 0
    cats = INCOME_CATS if t_type == "income" else EXPENSE_CATS
    category = parsed.get("category") if parsed.get("category") in cats else "Lainnya"
    wallet_id = ""
    wn = parsed.get("wallet_name")
    if wn:
        for w in wallets:
            if w["name"].lower() == str(wn).lower() or str(wn).lower() in w["name"].lower():
                wallet_id = w["id"]
                break
    date = parsed.get("date") or today
    return {
        "type": t_type,
        "amount": amount,
        "category": category,
        "wallet_id": wallet_id,
        "note": parsed.get("note") or "",
        "date": date,
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_storage():
    try:
        await run_in_threadpool(init_storage)
        logger.info("Object storage initialized.")
    except Exception as e:
        logger.warning(f"Object storage init failed (will retry on upload): {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
