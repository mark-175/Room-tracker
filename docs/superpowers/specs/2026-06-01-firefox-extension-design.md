# Firefox Extension — "Add to THM Room Tracker"

Date: 2026-06-01
Status: Approved (design); pending implementation plan

## Goal

A Firefox extension that adds a one-click toolbar button to send the current
TryHackMe room page into the local Room Tracker. The toolbar button is enabled
only on THM room URLs; clicking it enriches the URL with the room's name and
difficulty (via the existing `/api/room-info` endpoint), then `POST`s to
`/api/rooms`. Feedback is delivered via native OS notifications. A small
options page lets the user point the extension at a non-default server URL.

The extension is a **net-new component**; the Room Tracker backend and
frontend are unchanged.

## Scope

### In scope

- New top-level `extension/` directory containing a Manifest V3 Firefox
  add-on
- Toolbar button only — no popup, no content script, no context menu
- Active only on `tryhackme.com/room/<code>` and `tryhackme.com/r/<code>`
- Duplicate check before adding (one `GET /api/rooms` round-trip per click)
- Configurable server base URL (options page), defaulting to
  `http://localhost:3000`
- Native OS notifications for success and every failure path
- One-paragraph install/load note added to the root `README.md` (or
  `CLAUDE.md` if no README exists)

### Out of scope

- Backend changes (no new endpoints, no schema migration, no URL-uniqueness
  enforcement)
- Frontend changes
- Per-add UI for category / deadline / tags / status — the server's defaults
  (`category: "Other"`, `status: "To Do"`, no deadline, no tags) are
  accepted as-is
- Chrome/Edge build (the manifest will be MV3-compatible, but no build
  pipeline or cross-browser testing is part of this work)
- Signing or AMO publishing — load-as-temporary-add-on is the only
  supported install path
- Automated tests — the repo has none; a written manual test plan is the
  verification surface (matches existing project conventions)

## Architecture

### File layout

```
extension/
  manifest.json
  background.js          # event page: click flow + tab URL watcher
  options.html           # base-URL settings page
  options.js
  icons/
    icon-16.png
    icon-32.png
    icon-48.png
    icon-128.png
```

Everything is plain HTML/JS — no build step, no bundler, no dependencies.

### Manifest V3 — key fields

- `manifest_version: 3`
- `name: "THM Room Tracker"`, `version`, `description`
- `action`: `default_title: "Add to Room Tracker"`, `default_icon`. **No
  `default_popup`** — clicks fire `browser.action.onClicked`.
- `background`: `{ "scripts": ["background.js"] }`. An event-page-style
  background script (not a service worker) — Firefox MV3 supports both, and
  event pages avoid the service-worker lifecycle quirks.
- `permissions`: `["storage", "notifications", "tabs"]`
  - `storage` — persist the server base URL
  - `notifications` — success/failure toasts
  - `tabs` — read the active tab's URL to know when to enable/disable the
    toolbar action
- `host_permissions`: `["*://tryhackme.com/*", "*://*.tryhackme.com/*",
  "http://localhost/*", "http://127.0.0.1/*"]`. A LAN IP set in options
  would need a matching host permission; the design accepts that the user
  must edit `host_permissions` if pointing at a different host (documented
  in the README note). Adding optional permissions on demand is out of
  scope.
- `options_ui`: `{ "page": "options.html", "open_in_tab": true }`
- `browser_specific_settings.gecko.id`: `"thm-tracker@local"` — required by
  Firefox for an MV3 add-on that uses storage

### Toolbar enable/disable logic

`background.js` registers listeners on `tabs.onUpdated` and
`tabs.onActivated`. For the active tab, it checks the URL against a regex
that matches both THM room URL forms:

```
^https://(www\.)?tryhackme\.com/r(oom)?/[^/?#]+
```

Match → `browser.action.enable(tabId)`; no match → `browser.action.disable(tabId)`.

## Click flow

1. `browser.action.onClicked` fires with the active `tab`.
2. If the tab's URL doesn't match the THM regex, show "Not a TryHackMe room
   page" and stop. (Defensive — the button should already be disabled.)
3. If `inFlight.has(tab.id)`, ignore the click. Otherwise add to the set;
   ensure it's removed in a `finally`.
4. Read `serverBaseUrl` from `browser.storage.local`; fallback
   `http://localhost:3000`. Trim a trailing `/`.
5. `GET <base>/api/rooms`. If any returned row has `url === tab.url`
   (compared after trimming any trailing `/` on both sides), show
   "Already in tracker: <existing name>" and stop.
6. `GET <base>/api/room-info?url=<encodeURIComponent(tab.url)>`. Response is
   `{name, difficulty}`. On any non-2xx, show
   "TryHackMe lookup failed: <error>" using the `error` field from the JSON
   body (fallback to status text).
7. `POST <base>/api/rooms` with `{name, url: tab.url, difficulty}`. On any
   non-2xx, show "Add failed: <error>".
8. On success, show "Added: <name> (<difficulty>)".

All notifications use a **single shared `notificationId`** (e.g.
`"thm-tracker-result"`), so a new result replaces the previous one rather
than stacking.

### Failure → notification table

| Failure | Notification text |
|---|---|
| `fetch` throws (server down, DNS, CORS, etc.) | `Couldn't reach tracker at <base> — is it running?` |
| `GET /api/room-info` non-2xx | `TryHackMe lookup failed: <error>` |
| `POST /api/rooms` non-2xx | `Add failed: <error>` |
| URL regex mismatch (defensive) | `Not a TryHackMe room page` |

All errors are caught inside `background.js`; nothing propagates as an
unhandled rejection.

## Options page

`options.html` + `options.js`:

- Single labelled `<input type="url">` — **"Tracker server URL"**, placeholder
  `http://localhost:3000`.
- **Save** button. Validation:
  - Must parse as a URL with `protocol === "http:"` or `"https:"`
  - `pathname` must be `/` (no path), `search` and `hash` must be empty
  - Trailing `/` is trimmed before storage
- On valid save, `browser.storage.local.set({serverBaseUrl: value})` and
  show "Saved" for ~2 seconds.
- On invalid, show red error text under the input describing the
  expectation.
- No "test connection" button — the next toolbar click is the test, and the
  notification surfaces success/failure immediately.
- Styling: ~15 lines of CSS inline in `options.html`. The frontend's
  `styles.css` is not reused (different runtime, not worth wiring up).

When `serverBaseUrl` has never been set, `background.js` uses
`http://localhost:3000` directly.

## Conventions preserved from the existing project

- The extension reads `{error}` from non-2xx JSON bodies — same shape that
  `db.py`'s `HttpError` produces and that `frontend/src/api.ts` already
  reads.
- One outbound mutation per click; the server remains the source of truth
  (consistent with the `useRooms.ts` "no optimistic updates" invariant —
  the extension simply doesn't have any local state to keep in sync).
- camelCase JSON bodies, `tags` as an array (though this extension doesn't
  send `tags`).

## Install / load

The extension is loaded as a **temporary add-on**:

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** → select `extension/manifest.json`
3. The icon appears in the toolbar; visiting a THM room page enables it.

Temporary add-ons are unloaded on Firefox restart. Permanent installation
would require AMO signing or a Developer/ESR build with
`xpinstall.signatures.required` disabled — out of scope.

A one-paragraph note will be added to `README.md` (or `CLAUDE.md`)
describing the load steps and the `extension/` directory.

## Manual test plan

(There are no automated tests — the project has none. This list is the
verification surface.)

1. With `python main.py` running and the unpacked extension loaded:
   - Visit `https://tryhackme.com/room/linuxfundamentalspart1` (or any
     room not already in the tracker).
   - The toolbar icon becomes enabled.
   - Click it → notification reads "Added: Linux Fundamentals Part 1
     (Easy)" (or similar).
   - Open the Room Tracker UI → the new row is visible.
2. Click the icon again on the same page → notification reads
   "Already in tracker: <name>".
3. Stop the server (`Ctrl+C` on `python main.py`), click again →
   notification reads "Couldn't reach tracker at http://localhost:3000 —
   is it running?".
4. Open the options page, set the URL to `http://localhost:9999`, save,
   and click on a THM room page → reachability error references
   `http://localhost:9999`.
5. Visit a non-room page (e.g. `tryhackme.com/dashboard`) → toolbar icon
   is greyed/disabled.
6. Visit a non-THM page (e.g. `example.com`) → toolbar icon disabled.
7. (Edge) Click rapidly multiple times in succession on a fresh room
   page → only one row is added (concurrency guard).

## Open questions / risks

- **Icons**: The design assumes 16/32/48/128 PNG icons under `extension/icons/`.
  These need to be created. A simple text-on-color icon ("THM" or a
  hexagon) is fine; the implementation plan will note this as a deliverable
  but will not block on artwork — placeholder icons are acceptable for an
  unsigned, locally-loaded add-on.
- **THM URL canonicalisation**: Comparing `url === tab.url` after trimming
  trailing slashes is the cheapest viable duplicate check, but it will
  miss e.g. a stored `https://tryhackme.com/room/foo` vs. a visited
  `https://tryhackme.com/r/foo`. This is accepted as a known limitation
  rather than expanded into a normalisation routine — duplicates can be
  resolved manually in the tracker UI on the rare occasion they slip
  through.
- **THM rate limiting**: `/api/room-info` calls THM's public endpoint. A
  single click triggers one such call. No rate-limit handling beyond
  surfacing whatever error THM/the server returns.
