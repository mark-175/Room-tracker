"""SQLite data layer. One table, ``rooms``, stored in rooms.db next to this
file.

"Overdue" is intentionally NOT stored -- it is derived in the frontend from
``deadline`` vs. today (see public/app.js). Only the three real statuses
('To Do' | 'In Progress' | 'Done') are ever persisted. ``completed_date`` is
auto-stamped/cleared here whenever a room enters/leaves the Done state.

This is a faithful port of the original db.js (better-sqlite3) to Python's
stdlib ``sqlite3``; the schema and rooms.db file are unchanged, so an existing
database created by the Node version keeps working as-is.
"""

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

DB_PATH = os.environ.get("DB_PATH") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "rooms.db"
)

STATUSES = ("To Do", "In Progress", "Done")


class HttpError(Exception):
    """Carries an HTTP status so the API layer can turn it into a clean JSON
    error response, mirroring db.js's httpError() + server.js's wrap()."""

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


@contextmanager
def _db():
    """One connection per operation: commit on success, roll back on error,
    always close. A single ``with _db()`` block is one atomic transaction
    (used to make the import a true full-replace, like the Node version)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _today_iso():
    return datetime.now(timezone.utc).date().isoformat()


def _normalize_tags(tags):
    if isinstance(tags, list):
        tags = ",".join(str(t) for t in tags)
    if not isinstance(tags, str):
        return ""
    return ",".join(t.strip() for t in tags.split(",") if t.strip())


def _row_dict(r):
    return {k: r[k] for k in r.keys()}


# DB row (snake_case) -> API shape (camelCase, tags as array).
def _row_to_api(r):
    return {
        "id": r["id"],
        "name": r["name"],
        "category": r["category"],
        "difficulty": r["difficulty"],
        "deadline": r["deadline"] or "",
        "status": r["status"],
        "url": r["url"] or "",
        "tags": [t for t in (r["tags"].split(",") if r["tags"] else []) if t],
        "completedDate": r["completed_date"] or "",
        "createdAt": r["created_at"],
    }


_INSERT = """
    INSERT INTO rooms (name, category, difficulty, deadline, status, url, tags, completed_date)
    VALUES (:name, :category, :difficulty, :deadline, :status, :url, :tags, :completed_date)
"""


def list_rooms():
    with _db() as conn:
        rows = conn.execute("SELECT * FROM rooms ORDER BY id").fetchall()
        return [_row_to_api(r) for r in rows]


def create_room(data):
    name = str(data.get("name") or "").strip()
    if not name:
        raise HttpError(400, "Room name is required")
    status = data.get("status") if data.get("status") in STATUSES else "To Do"
    with _db() as conn:
        cur = conn.execute(
            _INSERT,
            {
                "name": name,
                "category": data.get("category") or "Other",
                "difficulty": data.get("difficulty") or "Easy",
                "deadline": data.get("deadline") or None,
                "status": status,
                "url": str(data.get("url") or "").strip() or None,
                "tags": _normalize_tags(data.get("tags")) or None,
                "completed_date": _today_iso() if status == "Done" else None,
            },
        )
        row = conn.execute(
            "SELECT * FROM rooms WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        return _row_to_api(row)


def update_room(room_id, patch):
    with _db() as conn:
        existing = conn.execute(
            "SELECT * FROM rooms WHERE id = ?", (room_id,)
        ).fetchone()
        if existing is None:
            raise HttpError(404, "Room not found")

        nxt = _row_dict(existing)
        if "name" in patch:
            n = str(patch["name"]).strip()
            if not n:
                raise HttpError(400, "Room name cannot be empty")
            nxt["name"] = n
        if "category" in patch:
            nxt["category"] = patch["category"] or "Other"
        if "difficulty" in patch:
            nxt["difficulty"] = patch["difficulty"] or "Easy"
        if "deadline" in patch:
            nxt["deadline"] = patch["deadline"] or None
        if "url" in patch:
            nxt["url"] = str(patch["url"]).strip() or None
        if "tags" in patch:
            nxt["tags"] = _normalize_tags(patch["tags"]) or None
        if "status" in patch:
            if patch["status"] not in STATUSES:
                raise HttpError(400, "Invalid status")
            nxt["status"] = patch["status"]

        # Auto-stamp the completion date the first time a room becomes Done;
        # clear it whenever it leaves Done.
        if nxt["status"] == "Done":
            if not nxt["completed_date"]:
                nxt["completed_date"] = _today_iso()
        else:
            nxt["completed_date"] = None

        conn.execute(
            """
            UPDATE rooms SET
              name=:name, category=:category, difficulty=:difficulty, deadline=:deadline,
              status=:status, url=:url, tags=:tags, completed_date=:completed_date
            WHERE id=:id
            """,
            {**nxt, "id": room_id},
        )
        row = conn.execute(
            "SELECT * FROM rooms WHERE id = ?", (room_id,)
        ).fetchone()
        return _row_to_api(row)


def delete_room(room_id):
    with _db() as conn:
        cur = conn.execute("DELETE FROM rooms WHERE id = ?", (room_id,))
        if cur.rowcount == 0:
            raise HttpError(404, "Room not found")


# JSON import = full restore. The whole table is replaced inside one
# transaction so a backup file always round-trips to exactly what was exported.
def import_rooms(rooms):
    if not isinstance(rooms, list):
        raise HttpError(400, 'Import file must contain a "rooms" array')
    with _db() as conn:
        conn.execute("DELETE FROM rooms")
        for r in rooms:
            status = r.get("status") if r.get(
                "status") in STATUSES else "To Do"
            conn.execute(
                _INSERT,
                {
                    "name": str(r.get("name") or "").strip() or "Untitled",
                    "category": r.get("category") or "Other",
                    "difficulty": r.get("difficulty") or "Easy",
                    "deadline": r.get("deadline") or None,
                    "status": status,
                    "url": str(r.get("url") or "").strip() or None,
                    "tags": _normalize_tags(r.get("tags")) or None,
                    "completed_date": r.get("completedDate")
                    or (_today_iso() if status == "Done" else None),
                },
            )
    return list_rooms()


def _init_db():
    with _db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rooms (
              id             INTEGER PRIMARY KEY AUTOINCREMENT,
              name           TEXT NOT NULL,
              category       TEXT NOT NULL DEFAULT 'Other',
              difficulty     TEXT NOT NULL DEFAULT 'Easy',
              deadline       TEXT,
              status         TEXT NOT NULL DEFAULT 'To Do',
              url            TEXT,
              tags           TEXT,
              completed_date TEXT,
              created_at     TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )


# Run on import, exactly like the Node module did on require().
_init_db()
