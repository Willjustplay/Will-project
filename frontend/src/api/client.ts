import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const API = `${BASE}/api`;
const DEVICE_KEY = "pv_device_id";

let cachedDeviceId: string | null = null;

function genId(): string {
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  let id = await storage.secureGet<string>(DEVICE_KEY, "");
  if (!id) {
    id = genId();
    await storage.secureSet(DEVICE_KEY, id);
  }
  cachedDeviceId = id;
  return id;
}

async function headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const deviceId = await getDeviceId();
  return { "X-Device-Id": deviceId, ...extra };
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: await headers() });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: await headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPatch<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "PATCH",
    headers: await headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPut<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "PUT",
    headers: await headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${API}${path}`, {
    method: "DELETE",
    headers: await headers(),
  });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
}

// ---- AI assistant ----
export interface ParsedTx {
  type: "income" | "expense";
  amount: number;
  category: string;
  wallet_id: string;
  note: string;
  date: string;
}

export async function aiChat(message: string): Promise<{ reply: string }> {
  return apiPost("/ai/chat", { message });
}

export async function aiParse(text: string): Promise<ParsedTx> {
  return apiPost("/ai/parse-transaction", { text });
}

export async function aiHistory(): Promise<{ role: string; content: string; created_at: string }[]> {
  return apiGet("/ai/history");
}

export async function aiClearHistory(): Promise<void> {
  return apiDelete("/ai/history");
}

// Multipart upload — handles both native and web runtimes.
export async function uploadFile(uri: string, name: string, type: string, folder = "Lainnya"): Promise<any> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type } as any);
  }
  form.append("folder", folder);
  const deviceId = await getDeviceId();
  const res = await fetch(`${API}/upload`, {
    method: "POST",
    headers: { "X-Device-Id": deviceId },
    body: form,
  });
  if (res.status === 402) throw new Error("PENYIMPANAN_PENUH");
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

// Build an authenticated raw file URL. On web, use token query param.
export async function fileUri(fileId: string): Promise<string> {
  const deviceId = await getDeviceId();
  return `${API}/files/${fileId}/raw?token=${encodeURIComponent(deviceId)}`;
}

export async function fileSource(fileId: string): Promise<{ uri: string; headers?: Record<string, string> }> {
  const deviceId = await getDeviceId();
  if (Platform.OS === "web") {
    return { uri: `${API}/files/${fileId}/raw?token=${encodeURIComponent(deviceId)}` };
  }
  return { uri: `${API}/files/${fileId}/raw`, headers: { "X-Device-Id": deviceId } };
}
