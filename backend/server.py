from fastapi import FastAPI, APIRouter, Header, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import Response
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import requests
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone

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
    created_at: str = Field(default_factory=now_iso)


class TransactionCreate(BaseModel):
    type: str
    amount: float
    category: str
    note: Optional[str] = ""
    date: str


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
# Files (Berkas)
# ---------------------------------------------------------------------------
@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), x_device_id: str = Header(None)):
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
