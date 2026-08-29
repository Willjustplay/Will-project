# Personal Vault — PRD

## Original Problem Statement
"buatkan saya aplikasi untuk mencatat jadwal, keuangan, alarm, tugas, akun dan sandi (pisahkan akun aplikasi berbeda), dan untuk menyimpan beberapa file atau gambar"
(An app to record schedules, finances, alarms/reminders, tasks, accounts & passwords separated per app, and to store files/images.)

## User Choices
- No login — direct use, data scoped per device (X-Device-Id header).
- Password vault locked with a 4-digit PIN.
- Finance: income/expense + balance summary + category charts.
- Alarm = in-app reminder only.
- Dark theme, "sangat mudah digunakan" (very easy to use).

## Architecture
- Frontend: Expo Router (SDK 54), 4 bottom tabs — Beranda, Keuangan, Jadwal, Brankas.
- Backend: FastAPI + MongoDB (Motor). All routes under /api, per-device via X-Device-Id header. Soft-delete everywhere.
- Files: Emergent Managed Object Storage (app name `personalvault`), served through backend with token/header auth.
- Design system in /app/design_guidelines.json (Dark-First Utility, amber accent).

## User Personas
- Individual who wants a private all-in-one organizer on their phone without creating an account.

## Core Requirements (static)
1. Schedule (Jadwal) — dated events with time.
2. Finance (Keuangan) — income/expense, balance, category pie chart.
3. Reminders (Alarm) — in-app time reminders with repeat days & enable toggle.
4. Tasks (Tugas) — checklist with done toggle.
5. Password vault (Sandi) — PIN-locked, per-service accounts, reveal/copy.
6. File & image storage (Berkas) — upload images/documents, grid view, image viewer.

## Implemented (2026-06)
- [x] Backend CRUD: transactions (wallet_id), events, tasks, reminders, vault, wallets (auto-seed), files (folders), backup export/import.
- [x] Per-device isolation + soft delete. Object storage for files/images.
- [x] Home dashboard, Finance (wallets/kantong + pie chart), Jadwal/Tugas/Alarm, PIN vault (search), Berkas (folders + search), Cadangan Data (export/import), monthly 6-month trend chart.
- [x] AI Assistant (Gemini 3 Flash via Emergent key): chat with data-aware context + natural-language transaction capture (/asisten). Chat history persisted per device. Entry via Beranda header button + banner.
- [x] Testing: 49/49 backend, all frontend flows green (3 iterations).

## Backlog / Remaining
- P1: AI could also create events/tasks/reminders from natural language (currently transactions only).
- P2: Biometric unlock for vault; export/import including binary files.
- P2: Streaming AI responses on native (currently non-streaming for reliability).

## Next Tasks
- Await user feedback; prioritize monthly finance insights and vault search.
