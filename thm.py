"""TryHackMe room lookup: given a room URL, fetch the room's public metadata
so the Add-room form can be auto-filled.

This is the ONLY part of the app that makes an outbound network request --
everything else works fully offline. It uses the stdlib (urllib + json/regex)
so it adds no dependency, consistent with the rest of the project (sqlite3
stdlib, Chart.js vendored locally).

Two sources, primary + fallback:

1. THM's no-auth JSON endpoint ``/api/v2/rooms/details?roomCode=<code>`` -- the
   only place that exposes the **difficulty** unauthenticated. This is the
   site's own internal endpoint and has changed shape before (the older
   ``?codes=`` form now 404s), so it is treated as best-effort.
2. If (1) fails for any reason *other* than the room genuinely not existing,
   fall back to scraping ``og:title`` out of the room page's server-rendered
   HTML. That still yields a correct **name** (difficulty/tags are rendered
   client-side and are not in the HTML), so the feature degrades instead of
   dying when THM changes its API.

Tags and category are never returned: tags come back as opaque weighted IDs
and category is not exposed at all without auth, so the user fills those (and
the deadline) in by hand.
"""

import json
import re
import urllib.error
import urllib.request
from urllib.parse import urlparse

from db import HttpError

_DETAILS_URL = "https://tryhackme.com/api/v2/rooms/details?roomCode={}"
_ROOM_PAGE_URL = "https://tryhackme.com/room/{}"
_TIMEOUT = 8  # seconds: this blocks the Add form, so fail fast
# A realistic browser fingerprint -- THM sits behind Cloudflare and a bare
# Python-urllib UA can draw a bot challenge (HTML, not JSON) on some networks.
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Accept": "application/json, text/html;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

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
# <meta property="og:title" content="Nmap"> (attr order varies between SSRs).
_OG_TITLE_RE = re.compile(
    r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']'
    r'|<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']',
    re.I,
)
_TITLE_RE = re.compile(r"<title[^>]*>([^<]+)</title>", re.I)


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


def _http_get(target):
    """GET ``target``. Returns ``(status, body_text)``. Raises db.HttpError
    with a *specific* message on transport failure (so a real problem never
    masquerades as "room not found")."""
    req = urllib.request.Request(target, headers=_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        # Read the body so callers can still inspect it (THM returns JSON
        # errors with a 4xx in some cases).
        body = ""
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            pass
        return e.code, body
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise HttpError(502, f"Couldn't reach TryHackMe ({e}). Are you online?")


def _name_from_html(html):
    """Best-effort room title from a room page's server-rendered HTML:
    ``og:title`` first (it's the bare title, e.g. "Nmap"), else the <title>
    tag with THM's "TryHackMe | " prefix stripped."""
    m = _OG_TITLE_RE.search(html)
    if m:
        name = (m.group(1) or m.group(2) or "").strip()
        if name and name.lower() != "tryhackme":
            return name
    m = _TITLE_RE.search(html)
    if m:
        name = re.sub(r"^\s*TryHackMe\s*[|\-]\s*", "", m.group(1)).strip()
        if name and name.lower() != "tryhackme":
            return name
    return ""


def _from_api(code):
    """Try the JSON endpoint. Returns an info dict, or ``None`` to signal
    'fall back to the page' (API unreachable/garbled/changed). Raises a
    genuine 404 only when THM explicitly says the room does not exist."""
    status, body = _http_get(_DETAILS_URL.format(code))
    try:
        payload = json.loads(body)
    except ValueError:
        return None  # HTML/Cloudflare/redirect -> let the page fallback try
    if not isinstance(payload, dict):
        return None
    if payload.get("status") != "success":
        msg = str(payload.get("message") or "").lower()
        if "not found" in msg or status == 404:
            raise HttpError(404, "That room wasn't found on TryHackMe")
        return None  # some other API error -> try the page fallback
    data = payload.get("data") or {}
    name = str(data.get("title") or "").strip()
    if not name:
        return None
    info = {"name": name}
    mapped = _DIFFICULTY.get(str(data.get("difficulty") or "").lower())
    if mapped:
        info["difficulty"] = mapped
    return info


def fetch_room_info(url):
    """Return ``{'name': str, 'difficulty'?: 'Easy'|'Medium'|'Hard'}`` for a
    THM room URL. ``difficulty`` is present only via the API path. Raises
    ``db.HttpError`` (turned into clean ``{"error": ...}`` JSON by main.py's
    existing handler)."""
    code = _room_code(url)

    info = _from_api(code)  # raises a real 404 if the room truly doesn't exist
    if info:
        return info

    # API was unreachable or changed shape -> scrape the page for the name.
    status, html = _http_get(_ROOM_PAGE_URL.format(code))
    if status == 404:
        raise HttpError(404, "That room wasn't found on TryHackMe")
    if status != 200:
        raise HttpError(502, f"TryHackMe returned HTTP {status}; try again later")
    name = _name_from_html(html)
    if not name:
        raise HttpError(
            502, "TryHackMe responded but the room details couldn't be read"
        )
    return {"name": name}
