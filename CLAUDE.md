# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A local TryHackMe ("THM") room tracker: a small Python + FastAPI server backed
by a SQLite file, serving a React + TypeScript single-page app (built with
Vite). Track rooms you want to finish (name, URL, category, difficulty,
deadline, tags, status) with data persisted locally to `rooms.db`.

The server was ported from an earlier Node/Express implementation; the
`rooms.db` schema and the `/api` contract are unchanged from that version (a DB
created by the old server still works). The frontend was rewritten from the
original vanilla JS into a React + TypeScript app under `frontend/`; Vite
builds it to `frontend/dist/`, which FastAPI serves. The `/api` request/
response shapes were kept identical so only the client implementation changed.

`thm_room_tracker.html` at the repo root is the **original single-file
prototype**, kept only for reference. It is superseded by the app and is *not*
served or used at runtime — do not edit it expecting changes to appear.

## Commands

```sh
# Frontend: build once, and again after any change under frontend/src
cd frontend && npm install && npm run build && cd ..

# Backend
pip install -r requirements.txt   # one-time; sqlite3 is stdlib (no native build)
python main.py                    # serves http://localhost:3000  (PORT env var overrides)
```

`python main.py` runs uvicorn directly; you can also use
`uvicorn main:app --port 3000` (add `--reload` while developing). `main.py`
serves the prebuilt `frontend/dist/`; if it is missing it fails soft with a
503 + a "build the frontend" hint instead of crashing.

While developing the UI, run `python main.py` *and*, in `frontend/`,
`npm run dev` — Vite serves the app on :5173 and proxies `/api` to FastAPI on
:3000 (hot reload, no rebuild). `npm run build` runs `tsc` first, so the build
fails on a type error; there is no separate linter or test suite. Otherwise
verify changes by exercising the UI or `curl`-ing `/api/*`. The DB path can be
overridden with the `DB_PATH` env var (useful for a throwaway test DB).

## Architecture

Three core layers plus one network helper, each one file/area:

- **`db.py`** — the only place that touches SQLite (stdlib `sqlite3`). A
  `_db()` context manager opens one connection per operation (commit on
  success, rollback on error, always close); a single `with _db()` block is one
  atomic transaction. Opens/creates `rooms.db`, defines the single `rooms`
  table, and exposes `list_rooms / create_room / update_room / delete_room /
  import_rooms`. It seeds 10 demo rooms **only when the table is empty** (so it
  never re-seeds once the user has their own data, even after deleting all
  rows). `_init_db()` + `_seed_if_empty()` run at import time.
- **`main.py`** — thin FastAPI layer: `StaticFiles` (mounted last, so `/api`
  routes win) serves `public/`, plus a small REST API. `db.py` raises
  `HttpError` carrying a `.status`; a registered exception handler turns it
  into `{"error": "..."}` JSON (same shape the old Express `wrap()` produced),
  so e.g. a missing name becomes a real 400 and the frontend's error handling
  is unchanged. Bodies are parsed permissively (empty/invalid → `{}`) to mirror
  Express's `req.body || {}`.
- **`thm.py`** — the **only** code that makes an outbound network request.
  `fetch_room_info(url)` parses a TryHackMe room URL and fetches the room's
  public metadata from THM's no-auth endpoint
  (`/api/v2/rooms/details?roomCode=<code>`) using the **stdlib** (`urllib` +
  `json`, no new dependency). It returns just `{name, difficulty}` — those are
  the only fields THM exposes unauthenticated (tags come back as opaque IDs and
  category not at all, so they stay manual). It raises `db.HttpError` so
  main.py's existing handler returns the same `{"error": "..."}` shape.
- **`frontend/`** — the React + TypeScript single-page app (Vite). Source
  under `frontend/src/`: `App.tsx` composes the `components/`, `hooks/
  useRooms.ts` owns the `rooms` array + all API mutations, `api.ts` is the
  typed fetch client, `utils.ts` the derived helpers, `types.ts` the API
  shapes, `styles.css` the ported theme (class names unchanged). Chart.js
  comes from npm via `react-chartjs-2` and is bundled by Vite, so the app
  still works fully offline — do not switch it to a CDN. `npm run build`
  emits `frontend/dist/` (gitignored), which `main.py` serves.

The whole app works offline **except** the room-URL lookup (`thm.py` /
`GET /api/room-info` / the Add-form auto-fill), which needs internet to reach
tryhackme.com; it fails soft (an inline hint, never blocks adding a room).

**Two invariants carried over from the prototype — preserve them:**

1. **"Overdue" is derived, never stored.** The DB only ever holds the three
   real statuses `'To Do' | 'In Progress' | 'Done'`. `isOverdue()` /
   `effectiveStatus()` in `frontend/src/utils.ts` compute the virtual
   "Overdue" state from `deadline` vs. today for display and filtering.
2. **The DB is the single source of truth — no optimistic updates.**
   `useRooms` holds one `rooms` array; every mutation calls the API and then
   re-fetches the whole list before React re-renders (the old
   `loadRooms()`/`render()` pattern). Components are pure functions of that
   array; metrics, progress bar, table and chart all derive from it each
   render. Never mutate `rooms` locally to "save a round-trip".

**API contract (`/api`):** `GET /rooms`, `POST /rooms`, `PATCH /rooms/:id`
(partial), `DELETE /rooms/:id`, `GET /export` (downloads a JSON backup),
`POST /import` (accepts `{rooms:[...]}` or a bare array; **replaces all rows**
atomically — it is a restore, not a merge), `GET /room-info?url=<thm room url>`
(no DB; returns `{name, difficulty}` scraped live from TryHackMe to prefill the
Add form — see `thm.py`). Request/response bodies are camelCase with `tags` as
a string array; `db.py` maps that to/from the snake_case columns and a
comma-separated `tags` text column.

**`completed_date` is managed server-side, not by the client.** `update_room()`
stamps it with today's date the first time a room becomes `Done` and clears it
whenever the room leaves `Done`. Clients never send it on normal updates.

**Adding to the frontend.** Put new UI in a `components/` component and feed
it from `App.tsx`; reach the server only through `api.ts` (so the
`{"error": "..."}` handling stays in one place) and trigger mutations via the
`useRooms` callbacks so the re-fetch invariant holds. Keep derived/display
logic in `utils.ts`. The error UX is intentionally the prototype's
`alert()`/`confirm()` — match it for new actions unless deliberately changing
it. `filter`/`search` are local UI state in `App.tsx` (not server state) and
just narrow the rendered list.
