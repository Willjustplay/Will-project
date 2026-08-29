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
- [x] Backend CRUD: transactions, events, tasks (PATCH toggle), reminders (PATCH toggle), vault (PUT edit), files (upload/list/raw/delete).
- [x] Per-device isolation + soft delete.
- [x] Object storage integration for files/images.
- [x] Home dashboard: greeting, balance summary card, "Hari Ini" (events/reminders/tasks), quick-access chips.
- [x] Finance: add sheet (amount, category chips, date picker), donut pie chart by category, income/expense filter, transaction list.
- [x] Jadwal: week strip, segmented Jadwal/Tugas/Alarm, custom time & date pickers, task checkbox, alarm switch.
- [x] Brankas: PIN create/confirm/unlock (SecureStore), locks on tab blur; Sandi accounts (reveal/copy/edit/delete), Berkas grid + upload (image picker + document picker) + image viewer.
- [x] Toasts, haptics, reanimated entrance animations, keyboard-aware sheets.
- [x] Full-stack testing passed (28/28 backend, all frontend flows).

## Backlog / Remaining
- P1: Search & filter within vault and files.
- P1: Monthly finance report / trend line on home.
- P2: Biometric unlock (Face/Touch ID) for vault.
- P2: Export/backup data.
- P2: Categorize/folder the file storage.

## Next Tasks
- Await user feedback; prioritize monthly finance insights and vault search.
