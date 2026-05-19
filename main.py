"""FastAPI server: serves the static frontend from public/ and a small REST
API backed by db.py. Run with ``python main.py`` (or
``uvicorn main:app --port 3000``), then open http://localhost:3000.

This replaces the original Node/Express server.js. The /api contract,
camelCase request/response bodies, and status codes are identical, so the
unchanged frontend in public/ keeps working without modification.
"""

import json
import os
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

import db

PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

app = FastAPI(title="THM Room Tracker")


# db.py raises HttpError with a .status; turn it into the same JSON shape the
# Express wrap() produced ({"error": "..."}) so the frontend's error handling
# (it reads `.error`) is unchanged.
@app.exception_handler(db.HttpError)
async def _http_error_handler(request: Request, exc: db.HttpError):
    return JSONResponse(status_code=exc.status, content={"error": exc.message})


# Any other unexpected error -> clean 500 JSON instead of an HTML stack trace.
@app.exception_handler(Exception)
async def _unhandled_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500, content={"error": str(exc) or "Server error"}
    )


async def _json_body(request: Request):
    """Mirror Express's `req.body || {}`: tolerate an empty/invalid body."""
    try:
        return await request.json()
    except Exception:
        return {}


@app.get("/api/rooms")
async def get_rooms():
    return db.list_rooms()


@app.post("/api/rooms", status_code=201)
async def post_room(request: Request):
    body = await _json_body(request)
    return db.create_room(body if isinstance(body, dict) else {})


@app.patch("/api/rooms/{room_id}")
async def patch_room(room_id: int, request: Request):
    body = await _json_body(request)
    return db.update_room(room_id, body if isinstance(body, dict) else {})


@app.delete("/api/rooms/{room_id}", status_code=204)
async def delete_room(room_id: int):
    db.delete_room(room_id)
    return Response(status_code=204)


# Download a full JSON backup of every room.
@app.get("/api/export")
async def export_rooms():
    payload = {
        "app": "thm-room-tracker",
        "version": 1,
        "exportedAt": datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z"),
        "rooms": db.list_rooms(),
    }
    stamp = datetime.now(timezone.utc).date().isoformat()
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="thm-rooms-{stamp}.json"'
        },
    )


# Restore from a backup file: accepts either {"rooms": [...]} or a bare [...].
# This REPLACES all existing rooms (confirmed in the UI before sending).
@app.post("/api/import")
async def import_rooms(request: Request):
    body = await _json_body(request)
    if isinstance(body, list):
        rooms = body
    elif isinstance(body, dict):
        rooms = body.get("rooms")
    else:
        rooms = None
    return db.import_rooms(rooms)


# Serve the frontend. Mounted last so the /api routes above take precedence;
# html=True serves index.html at "/".
app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "3000"))
    print(f"THM Room Tracker running at http://localhost:{port}")
    print(f"Data file: {db.DB_PATH}")
    uvicorn.run(app, host="127.0.0.1", port=port)
