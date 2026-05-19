"""TryHackMe room lookup: given a room URL, fetch the room's public metadata
so the Add-room form can be auto-filled.

This is the ONLY part of the app that makes an outbound network request --
everything else works fully offline. It uses the stdlib (urllib + json) so it
adds no dependency, consistent with the rest of the project (sqlite3 stdlib,
Chart.js vendored locally).

Only ``name`` (the room title) and ``difficulty`` are reliably available from
TryHackMe without authentication. Tags come back as opaque weighted IDs and
category is not exposed on the public endpoint, so they are intentionally not
returned -- the user still fills those (and the deadline) in by hand.
"""

import json
import re
import urllib.error
import urllib.request
from urllib.parse import urlparse

from db import HttpError

# Public, no-auth JSON: {"status":"success","data":{"title":..,
# "difficulty":"easy",..}}. The older ?codes= form now redirects to an HTML
# "not found" page; this ?roomCode= form is the one the site itself uses.
_DETAILS_URL = "https://tryhackme.com/api/v2/rooms/details?roomCode={}"
_TIMEOUT = 8  # seconds: this blocks the Add form, so fail fast
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

# THM's lowercase difficulty -> this app's Easy/Medium/Hard <select> values.
_DIFFICULTY = {
    "easy": "Easy",
    "medium": "Medium",
    "hard": "Hard",
    "info": "Easy",
    "introductory": "Easy",
    "insane": "Hard",
    "expert": "Hard",
}

_ROOM_CODE_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def _room_code(url):
    """Pull the room code out of a TryHackMe room URL. Accepts http/https,
    optional www, trailing slash / query / fragment, and a scheme-less paste,
    e.g. ``https://tryhackme.com/room/furthernmap`` -> ``furthernmap``."""
    raw = (url or "").strip()
    if not raw:
        raise HttpError(400, "Enter a TryHackMe room URL")
    if "://" not in raw:
        raw = "https://" + raw  # tolerate a pasted "tryhackme.com/room/x"
    parsed = urlparse(raw)
    host = (parsed.hostname or "").lower()
    if host != "tryhackme.com" and not host.endswith(".tryhackme.com"):
        raise HttpError(400, "That doesn't look like a TryHackMe URL")
    parts = [p for p in parsed.path.split("/") if p]
    # .../room/<code>  (also tolerate the short /r/<code> form)
    if len(parts) >= 2 and parts[0] in ("room", "r"):
        code = parts[1]
    else:
        raise HttpError(400, "Use a room URL like https://tryhackme.com/room/...")
    if not _ROOM_CODE_RE.match(code):
        raise HttpError(400, "Couldn't read the room name from that URL")
    return code


def fetch_room_info(url):
    """Return ``{'name': str, 'difficulty': 'Easy'|'Medium'|'Hard'}`` for a
    THM room URL. ``difficulty`` is omitted if THM reports a value we don't
    map. Raises ``db.HttpError`` (turned into clean ``{"error": ...}`` JSON by
    main.py's existing exception handler)."""
    code = _room_code(url)
    req = urllib.request.Request(
        _DETAILS_URL.format(code),
        headers={"User-Agent": _UA, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            body = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise HttpError(404, "That room wasn't found on TryHackMe")
        raise HttpError(502, "TryHackMe returned an error; try again later")
    except (urllib.error.URLError, TimeoutError, OSError):
        raise HttpError(502, "Couldn't reach TryHackMe (no internet?)")

    try:
        payload = json.loads(body)
    except ValueError:
        # An unknown code redirects to an HTML "not found" page, not JSON.
        raise HttpError(404, "That room wasn't found on TryHackMe")

    if not isinstance(payload, dict) or payload.get("status") != "success":
        raise HttpError(404, "That room wasn't found on TryHackMe")
    data = payload.get("data") or {}

    name = str(data.get("title") or "").strip()
    if not name:
        raise HttpError(404, "That room wasn't found on TryHackMe")

    info = {"name": name}
    mapped = _DIFFICULTY.get(str(data.get("difficulty") or "").lower())
    if mapped:
        info["difficulty"] = mapped
    return info
