"""FastAPI server: serves the static frontend from public/ and a small REST
API backed by db.py. Run with ``python main.py`` (or
``uvicorn main:app --port 3000``), then open http://localhost:3000.

The /api contract, camelCase request/response bodies, and status codes are
unchanged from the original Node/Express server; this serves the built
React + TypeScript single-page app from frontend/dist (Vite build output)
instead of the old vanilla-JS public/ directory.
"""

import json
import os
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

import db
import thm

# The built React app (Vite output). Created by:
#   cd frontend && npm install && npm run build
FRONTEND_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "frontend", "dist"
)

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


# Look up a TryHackMe room's public metadata so the Add form can prefill
# itself. Defined as a sync `def` so FastAPI runs the blocking urllib fetch in
# its threadpool (off the event loop). thm.py raises db.HttpError on a bad URL
# / missing room / network failure, handled by the same handler as db errors.
@app.get("/api/room-info")
def room_info(url: str = ""):
    return thm.fetch_room_info(url)


# Serve the built React app. Mounted last so the /api routes above take
# precedence; html=True serves index.html at "/". If the frontend hasn't been
# built yet, fail soft with a clear hint instead of crashing at startup
# (StaticFiles raises if the directory is missing).
if os.path.isdir(FRONTEND_DIR):
    app.mount(
        "/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static"
    )
else:

    @app.get("/")
    async def _frontend_not_built():
        return JSONResponse(
            status_code=503,
            content={
                "error": "Frontend not built. Run: "
                "cd frontend && npm install && npm run build"
            },
        )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "3000"))
    print(f"THM Room Tracker running at http://localhost:{port}")
    print(f"Data file: {db.DB_PATH}")
    uvicorn.run(app, host="0.0.0.0", port=port)
