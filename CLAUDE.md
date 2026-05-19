# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A local TryHackMe ("THM") room tracker: a small Python + FastAPI server backed
by a SQLite file, serving a vanilla-JS frontend. Track rooms you want to finish
(name, URL, category, difficulty, deadline, tags, status) with data persisted
locally to `rooms.db`.

The server was ported from an earlier Node/Express implementation; the
`rooms.db` schema, the `/api` contract, and the frontend in `public/` are
unchanged from that version (a DB created by the old server still works).

`thm_room_tracker.html` at the repo root is the **original single-file
prototype**, kept only for reference. It is superseded by the app and is *not*
served or used at runtime — do not edit it expecting changes to appear.

## Commands

```sh
pip install -r requirements.txt   # one-time; sqlite3 is stdlib (no native build)
python main.py                    # serves http://localhost:3000  (PORT env var overrides)
```

`python main.py` runs uvicorn directly; you can also use
`uvicorn main:app --port 3000` (add `--reload` while developing). There is no
build step, no linter, and no test suite. Verify changes by running the server
and exercising the UI or `curl`-ing `/api/*`. The DB path can be overridden
with the `DB_PATH` env var (useful for a throwaway test DB).

## Architecture

Three layers, each one file/area:

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
- **`public/`** — `index.html` + `styles.css` + `app.js`, plus
  `vendor/chart.umd.js` (Chart.js vendored locally so the app works offline;
  do not switch it back to a CDN `<script>`).

**Two invariants carried over from the prototype — preserve them:**

1. **"Overdue" is derived, never stored.** The DB only ever holds the three
   real statuses `'To Do' | 'In Progress' | 'Done'`. `isOverdue()` /
   `effectiveStatus()` in `app.js` compute the virtual "Overdue" state from
   `deadline` vs. today for display and filtering.
2. **One `render()` rebuilds everything from state.** `app.js` keeps a single
   `rooms` array loaded from the API; every mutation calls the API, then
   `loadRooms()` re-fetches and calls `render()`, which fully rebuilds metrics,
   progress bar, table (`innerHTML`), and chart. The chart is destroyed and
   recreated each render. The DB — not client memory — is the source of truth.

**API contract (`/api`):** `GET /rooms`, `POST /rooms`, `PATCH /rooms/:id`
(partial), `DELETE /rooms/:id`, `GET /export` (downloads a JSON backup),
`POST /import` (accepts `{rooms:[...]}` or a bare array; **replaces all rows**
atomically — it is a restore, not a merge). Request/response bodies are
camelCase with `tags` as a string array; `db.py` maps that to/from the
snake_case columns and a comma-separated `tags` text column.

**`completed_date` is managed server-side, not by the client.** `update_room()`
stamps it with today's date the first time a room becomes `Done` and clears it
whenever the room leaves `Done`. Clients never send it on normal updates.

**Frontend events are delegated.** Because the table is re-rendered on every
change, `app.js` attaches listeners to stable parents (`#room-tbody`,
`#filter-row`) and dispatches via `js-*` classes / `data-id`, rather than the
prototype's inline `onclick`. Keep new row controls within this delegation
scheme.
