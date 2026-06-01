# Firefox Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Firefox toolbar extension that one-click-adds the active TryHackMe room page to the local Room Tracker via its existing `/api/room-info` + `/api/rooms` endpoints.

**Architecture:** Manifest V3 Firefox add-on with an event-page background script. No content scripts, no popup. The background script enables/disables the toolbar action based on the active tab's URL, and on click runs `GET /api/rooms` (duplicate check) → `GET /api/room-info?url=…` (name+difficulty) → `POST /api/rooms`. Outcomes surface as native OS notifications. A small options page configures the server base URL (default `http://localhost:3000`), persisted in `browser.storage.local`.

**Tech Stack:** Plain HTML/CSS/JavaScript. Firefox WebExtensions API (`browser.*`). Manifest V3. No build step, no bundler, no dependencies.

**Spec:** `docs/superpowers/specs/2026-06-01-firefox-extension-design.md`

---

## Note on testing

The Room Tracker project has **no automated test suite** by convention (see `CLAUDE.md`). The spec explicitly scopes automated tests as out-of-scope and defines a written manual test plan as the verification surface. Each task in this plan ends with **explicit manual verification steps** in place of the usual "run the test" / "assert it passes" pattern. The engineer must perform every verification step before committing the task and moving on. The final Task 6 runs the full end-to-end manual test plan from the spec.

---

## File Structure

New files (all under a new top-level `extension/` directory):

| File | Responsibility |
|---|---|
| `extension/manifest.json` | MV3 manifest: action, background script, options page, permissions, host permissions, gecko id |
| `extension/background.js` | Event-page background script: tab URL watcher (enable/disable), click handler, storage read, REST calls, notifications |
| `extension/options.html` | Options page markup + inline styles |
| `extension/options.js` | Options page logic: load, validate, save server URL to `browser.storage.local` |
| `extension/icons/icon.svg` | Single SVG icon used at all sizes (Firefox supports SVG icons for browser actions and extensions) |

Modified files:

| File | Change |
|---|---|
| `CLAUDE.md` | Append a short "Firefox extension" section pointing at `extension/` and documenting load steps |

The repo has no root `README.md`; per the spec, the install note goes in `CLAUDE.md` instead.

---

## Task 1: Scaffold extension directory, manifest, and icon

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/icons/icon.svg`
- Create: `extension/background.js` (stub only — fully implemented in Tasks 2 & 3)

- [ ] **Step 1: Create the icon SVG**

Write `extension/icons/icon.svg` with this content (a simple dark-blue rounded square with white "THM" lettering — readable at 16px, fine at 128px):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="#1e293b"/>
  <text x="64" y="82" font-family="Segoe UI, Arial, sans-serif" font-size="44"
        font-weight="700" text-anchor="middle" fill="#f8fafc">THM</text>
</svg>
```

- [ ] **Step 2: Create a stub `extension/background.js`**

Write this minimal file. It does nothing yet; later tasks implement the listeners.

```js
// THM Room Tracker — background event page.
// Listeners are registered in subsequent tasks (toolbar enable/disable, click flow).
"use strict";
```

- [ ] **Step 3: Write `extension/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "THM Room Tracker",
  "version": "0.1.0",
  "description": "One-click add the current TryHackMe room to the local Room Tracker.",
  "browser_specific_settings": {
    "gecko": {
      "id": "thm-tracker@local",
      "strict_min_version": "115.0"
    }
  },
  "icons": {
    "16": "icons/icon.svg",
    "32": "icons/icon.svg",
    "48": "icons/icon.svg",
    "128": "icons/icon.svg"
  },
  "action": {
    "default_title": "Add to Room Tracker",
    "default_icon": {
      "16": "icons/icon.svg",
      "32": "icons/icon.svg",
      "48": "icons/icon.svg"
    }
  },
  "background": {
    "scripts": ["background.js"]
  },
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  },
  "permissions": ["storage", "notifications", "tabs"],
  "host_permissions": [
    "*://tryhackme.com/*",
    "*://*.tryhackme.com/*",
    "http://localhost/*",
    "http://127.0.0.1/*"
  ]
}
```

- [ ] **Step 4: Manually verify the extension loads**

1. Open Firefox.
2. Navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select `extension/manifest.json`.
4. Confirm the add-on appears in the list with name "THM Room Tracker" and **no warnings/errors** under it.
5. Click **Inspect** on the add-on to open the background page devtools. The Console should be empty (no red errors).
6. Confirm the THM toolbar icon (the blue "THM" square) is present in Firefox's toolbar overflow / unified extensions menu. The icon may be disabled — that's expected; it will be wired up in Task 2.

If the manifest fails to load, the error message in `about:debugging` is the source of truth — fix and reload.

- [ ] **Step 5: Add a .gitignore entry so the temporary-load output (none today, but possible later) is not tracked, and confirm git sees the new files**

There is no per-extension build output yet; no gitignore changes are needed. Just confirm:

```bash
git status
```

Expected: shows `extension/manifest.json`, `extension/background.js`, `extension/icons/icon.svg` as new untracked files.

- [ ] **Step 6: Commit**

```bash
git add extension/manifest.json extension/background.js extension/icons/icon.svg
git commit -m "Scaffold Firefox extension manifest, icon, and background stub"
```

---

## Task 2: Toolbar enable/disable on THM room pages

Wire up the background script so the toolbar button is only clickable on TryHackMe room URLs.

**Files:**
- Modify: `extension/background.js`

- [ ] **Step 1: Add the URL matcher and tab listeners**

Replace the contents of `extension/background.js` with:

```js
// THM Room Tracker — background event page.
"use strict";

// Matches both /room/<code> and /r/<code> (THM uses both).
// Case-insensitive on the host; the path is case-sensitive (THM codes are lowercase).
const THM_ROOM_RE = /^https:\/\/(www\.)?tryhackme\.com\/r(?:oom)?\/[^/?#]+/i;

function isThmRoomUrl(url) {
  return typeof url === "string" && THM_ROOM_RE.test(url);
}

async function refreshActionForTab(tabId, url) {
  try {
    if (isThmRoomUrl(url)) {
      await browser.action.enable(tabId);
      await browser.action.setTitle({ tabId, title: "Add to Room Tracker" });
    } else {
      await browser.action.disable(tabId);
      await browser.action.setTitle({
        tabId,
        title: "THM Room Tracker (open a TryHackMe room page)"
      });
    }
  } catch (e) {
    // Tab may have closed between fetch and update; ignore.
  }
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only react when the URL changes or the tab finishes loading.
  if (changeInfo.url || changeInfo.status === "complete") {
    refreshActionForTab(tabId, tab.url);
  }
});

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await browser.tabs.get(tabId);
    refreshActionForTab(tabId, tab.url);
  } catch (e) {
    // Tab gone; ignore.
  }
});

// On startup / install, sync the current state for the active tab in each window.
async function syncAllActiveTabs() {
  const tabs = await browser.tabs.query({ active: true });
  for (const tab of tabs) {
    refreshActionForTab(tab.id, tab.url);
  }
}

browser.runtime.onStartup.addListener(syncAllActiveTabs);
browser.runtime.onInstalled.addListener(syncAllActiveTabs);
syncAllActiveTabs(); // Also run immediately on background page load.
```

- [ ] **Step 2: Reload the extension**

In `about:debugging#/runtime/this-firefox`, click **Reload** on the "THM Room Tracker" entry. Open the background page's devtools Console — confirm no red errors.

- [ ] **Step 3: Manually verify enable/disable**

1. Navigate the active tab to `https://tryhackme.com/room/linuxfundamentalspart1`. The toolbar icon should be **enabled** (full color, clickable). Hover: tooltip reads "Add to Room Tracker".
2. Navigate to `https://tryhackme.com/dashboard`. Icon should be **disabled** (greyed out). Hover: tooltip reads "THM Room Tracker (open a TryHackMe room page)".
3. Navigate to `https://example.com`. Icon disabled, same tooltip.
4. Navigate to `https://tryhackme.com/r/foo` (short URL form). Icon enabled.
5. Open a second tab to a non-THM URL while the first is on a room URL, switch between them — the icon should flip enabled/disabled as you switch.

If any of these fail, inspect the background page devtools, log `url` and `THM_ROOM_RE.test(url)` inside `refreshActionForTab` to diagnose, then re-test.

- [ ] **Step 4: Commit**

```bash
git add extension/background.js
git commit -m "Enable toolbar action only on TryHackMe room URLs"
```

---

## Task 3: Click handler — duplicate check, lookup, add, notifications

Implement the full one-click flow.

**Files:**
- Modify: `extension/background.js`

- [ ] **Step 1: Add the storage helper and constants**

At the top of `extension/background.js`, **immediately after `"use strict";`** add:

```js
const DEFAULT_SERVER_BASE = "http://localhost:3000";
const NOTIFICATION_ID = "thm-tracker-result";
const inFlight = new Set();

async function getServerBase() {
  const { serverBaseUrl } = await browser.storage.local.get("serverBaseUrl");
  const base = (serverBaseUrl || DEFAULT_SERVER_BASE).trim();
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function trimSlash(s) {
  return typeof s === "string" && s.endsWith("/") ? s.slice(0, -1) : s;
}

async function notify(message) {
  await browser.notifications.create(NOTIFICATION_ID, {
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon.svg"),
    title: "THM Room Tracker",
    message
  });
}

// Reads {error} from a non-2xx JSON body; falls back to status text.
async function readErrorMessage(response) {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string" && body.error) return body.error;
  } catch (_) {
    // not JSON
  }
  return response.statusText || `HTTP ${response.status}`;
}
```

- [ ] **Step 2: Add the click-flow function**

Below the listeners you wrote in Task 2 (i.e. after the `syncAllActiveTabs()` call at the bottom), append:

```js
async function handleAddClick(tab) {
  if (!tab || typeof tab.url !== "string") return;

  if (!isThmRoomUrl(tab.url)) {
    await notify("Not a TryHackMe room page");
    return;
  }

  if (inFlight.has(tab.id)) return;
  inFlight.add(tab.id);

  try {
    const base = await getServerBase();
    const targetUrl = trimSlash(tab.url);

    // 1. Duplicate check
    let rooms;
    try {
      const resp = await fetch(`${base}/api/rooms`, { method: "GET" });
      if (!resp.ok) {
        await notify(`Add failed: ${await readErrorMessage(resp)}`);
        return;
      }
      rooms = await resp.json();
    } catch (_) {
      await notify(`Couldn't reach tracker at ${base} — is it running?`);
      return;
    }

    const dup = Array.isArray(rooms)
      ? rooms.find((r) => trimSlash(r.url || "") === targetUrl)
      : null;
    if (dup) {
      await notify(`Already in tracker: ${dup.name || targetUrl}`);
      return;
    }

    // 2. THM lookup (name + difficulty)
    let info;
    try {
      const resp = await fetch(
        `${base}/api/room-info?url=${encodeURIComponent(tab.url)}`,
        { method: "GET" }
      );
      if (!resp.ok) {
        await notify(`TryHackMe lookup failed: ${await readErrorMessage(resp)}`);
        return;
      }
      info = await resp.json();
    } catch (_) {
      await notify(`Couldn't reach tracker at ${base} — is it running?`);
      return;
    }

    if (!info || typeof info.name !== "string" || !info.name) {
      await notify("TryHackMe lookup failed: no name returned");
      return;
    }

    // 3. POST to /api/rooms
    let created;
    try {
      const resp = await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: info.name,
          url: tab.url,
          difficulty: info.difficulty || undefined
        })
      });
      if (!resp.ok) {
        await notify(`Add failed: ${await readErrorMessage(resp)}`);
        return;
      }
      created = await resp.json();
    } catch (_) {
      await notify(`Couldn't reach tracker at ${base} — is it running?`);
      return;
    }

    const diff = created.difficulty || info.difficulty || "";
    await notify(diff ? `Added: ${created.name} (${diff})` : `Added: ${created.name}`);
  } finally {
    inFlight.delete(tab.id);
  }
}

browser.action.onClicked.addListener(handleAddClick);
```

- [ ] **Step 3: Reload the extension and inspect for errors**

In `about:debugging`, click **Reload** on the entry. Open the background-page devtools Console — confirm no red errors at load.

- [ ] **Step 4: Manually verify the happy path**

1. Start the Room Tracker server: in a terminal at the repo root, run `python main.py`. Confirm it logs `THM Room Tracker running at http://localhost:3000`.
2. In Firefox, navigate to `https://tryhackme.com/room/linuxfundamentalspart1` (or any THM room you do **not** already have in your tracker — check the tracker UI at `http://localhost:3000` first to confirm).
3. Click the THM toolbar icon.
4. Within ~2 seconds a system notification appears: `Added: Linux Fundamentals Part 1 (Easy)` (the exact name/difficulty comes from THM).
5. Open `http://localhost:3000` in another tab → confirm the new row is present with the correct name, URL, and difficulty. Category should be `Other`, status `To Do`.

- [ ] **Step 5: Manually verify duplicate handling**

1. With the same room still on screen, click the toolbar icon again.
2. Notification reads: `Already in tracker: <name>` — no new row created in the tracker UI.

- [ ] **Step 6: Manually verify server-down handling**

1. Stop the server (Ctrl+C in the terminal running `python main.py`).
2. On a THM room page, click the toolbar icon.
3. Notification reads: `Couldn't reach tracker at http://localhost:3000 — is it running?`
4. Restart the server before continuing.

- [ ] **Step 7: Manually verify the concurrency guard**

1. On a fresh, untracked THM room page, click the toolbar icon **3–4 times rapidly** (within ~1 second).
2. Refresh the tracker UI. Exactly **one** new row should be present.
3. The first click's notification (Added) is the one displayed; rapid subsequent clicks during the in-flight period are silently dropped.

- [ ] **Step 8: Commit**

```bash
git add extension/background.js
git commit -m "Implement one-click add flow with duplicate check and notifications"
```

---

## Task 4: Options page for configurable server URL

**Files:**
- Create: `extension/options.html`
- Create: `extension/options.js`

- [ ] **Step 1: Write `extension/options.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>THM Room Tracker — Options</title>
    <style>
      body {
        font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif;
        max-width: 540px;
        margin: 2rem auto;
        padding: 0 1rem;
        color: #1e293b;
      }
      h1 { font-size: 1.25rem; margin-bottom: 1rem; }
      label { display: block; margin-bottom: 0.25rem; font-weight: 600; }
      input[type="url"] {
        width: 100%;
        padding: 0.5rem 0.6rem;
        font-size: 1rem;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        box-sizing: border-box;
      }
      .row { margin-top: 1rem; display: flex; gap: 0.5rem; align-items: center; }
      button {
        padding: 0.5rem 1rem;
        border: 0;
        border-radius: 6px;
        background: #1e293b;
        color: #f8fafc;
        font-weight: 600;
        cursor: pointer;
      }
      button:hover { background: #0f172a; }
      .hint { color: #64748b; font-size: 0.85rem; margin-top: 0.5rem; }
      .status { font-size: 0.9rem; }
      .status.ok { color: #047857; }
      .status.err { color: #b91c1c; }
    </style>
  </head>
  <body>
    <h1>THM Room Tracker — Options</h1>
    <label for="serverBaseUrl">Tracker server URL</label>
    <input
      id="serverBaseUrl"
      type="url"
      placeholder="http://localhost:3000"
      autocomplete="off"
      spellcheck="false"
    />
    <p class="hint">
      Origin only (no path). Example: <code>http://localhost:3000</code> or
      <code>http://192.168.1.20:3000</code>.
    </p>
    <div class="row">
      <button id="save" type="button">Save</button>
      <span id="status" class="status"></span>
    </div>
    <script src="options.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `extension/options.js`**

```js
"use strict";

const DEFAULT_SERVER_BASE = "http://localhost:3000";
const input = document.getElementById("serverBaseUrl");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

// Validate the URL: must parse, must be http(s), must have no path/query/hash.
function validateOriginUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch (_) {
    return { ok: false, error: "Not a valid URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "URL must start with http:// or https://" };
  }
  if (u.pathname !== "/" && u.pathname !== "") {
    return { ok: false, error: "URL must be an origin (no path)" };
  }
  if (u.search || u.hash) {
    return { ok: false, error: "URL must not contain a query string or fragment" };
  }
  // Normalised: protocol + // + host (incl. port). No trailing slash.
  return { ok: true, normalised: `${u.protocol}//${u.host}` };
}

async function load() {
  const { serverBaseUrl } = await browser.storage.local.get("serverBaseUrl");
  input.value = serverBaseUrl || DEFAULT_SERVER_BASE;
}

async function save() {
  const raw = input.value.trim();
  const result = validateOriginUrl(raw);
  if (!result.ok) {
    setStatus(result.error, "err");
    return;
  }
  await browser.storage.local.set({ serverBaseUrl: result.normalised });
  input.value = result.normalised;
  setStatus("Saved", "ok");
  setTimeout(() => {
    if (statusEl.textContent === "Saved") setStatus("", "");
  }, 2000);
}

saveBtn.addEventListener("click", save);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") save();
});

load();
```

- [ ] **Step 3: Reload the extension**

In `about:debugging#/runtime/this-firefox`, click **Reload** on the extension entry.

- [ ] **Step 4: Manually verify the options page**

1. In `about:debugging`, click the **Options** button under the extension entry (or open the extension's "Manage Extension" → Preferences). The options page opens in a new tab.
2. Confirm the input is prefilled with `http://localhost:3000`.
3. **Valid save:** change the value to `http://localhost:8080`, click **Save**. Green "Saved" appears for ~2 seconds. The input now reads `http://localhost:8080` (normalised; no trailing slash).
4. Reload the options tab → input shows `http://localhost:8080`. Open `about:debugging` → click the extension's **Inspect**, then in the console run:

   ```js
   browser.storage.local.get("serverBaseUrl").then(console.log)
   ```

   Expected output: `{serverBaseUrl: "http://localhost:8080"}`.

5. **Invalid save — not a URL:** set value to `not a url`, click Save. Red error: `Not a valid URL`. Storage unchanged.
6. **Invalid save — wrong scheme:** set value to `ftp://localhost`, click Save. Red error: `URL must start with http:// or https://`.
7. **Invalid save — has path:** set value to `http://localhost:3000/api`, click Save. Red error: `URL must be an origin (no path)`.
8. **Trailing slash trimming:** set value to `http://localhost:3000/`, click Save. Green "Saved"; input updates to `http://localhost:3000` (no trailing slash).
9. **End-to-end with custom URL:** in the options page, set the URL to `http://localhost:9999` (a port nothing is listening on), save. On a THM room page, click the toolbar icon. Notification reads: `Couldn't reach tracker at http://localhost:9999 — is it running?` (proves the click flow is reading the configured URL). Reset the value to `http://localhost:3000` before continuing.

- [ ] **Step 5: Commit**

```bash
git add extension/options.html extension/options.js
git commit -m "Add options page for configurable tracker server URL"
```

---

## Task 5: Document the extension in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Append a new section to `CLAUDE.md`**

Open `CLAUDE.md` and append the following section to the very end of the file (after the existing "Adding to the frontend" paragraph, on a new line):

```markdown

## Firefox extension

`extension/` is a Manifest V3 Firefox add-on that adds a toolbar button to one-click add the current TryHackMe room page to the tracker. It calls the existing `/api/room-info` + `/api/rooms` endpoints; the backend and frontend are unchanged. The toolbar button is enabled only on `tryhackme.com/room/<code>` (and the short `/r/<code>` form); clicking it does a duplicate check, enriches the URL with name+difficulty from THM, posts the new row, and shows a native OS notification with the result. The options page lets you point the extension at a different server URL (default `http://localhost:3000`), persisted in `browser.storage.local`.

Load it as a temporary add-on while developing: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and select `extension/manifest.json`. The add-on is unloaded on Firefox restart — there is no signing/AMO step. If you change the server URL to a host not listed in `host_permissions` (e.g. a LAN IP outside `localhost`/`127.0.0.1`), edit `extension/manifest.json` to add the host and reload the extension.
```

- [ ] **Step 2: Verify the addition**

```bash
git diff CLAUDE.md
```

Expected: a clean addition at the end of the file with the two paragraphs above. No other lines modified.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Document Firefox extension in CLAUDE.md"
```

---

## Task 6: Full end-to-end manual test plan

Run the full manual test plan from the spec to confirm everything still works together after all the incremental tasks.

**Files:** None (verification only)

- [ ] **Step 1: Pre-flight**

1. Backend: `python main.py` running, log shows `http://localhost:3000`.
2. Extension: loaded fresh as a temporary add-on (`about:debugging` → Reload, or remove + re-Load).
3. Background page Console (via `about:debugging` → Inspect): no red errors at load.

- [ ] **Step 2: Test 1 — Add a new room**

1. Pick a THM room you do **not** already have in the tracker (check `http://localhost:3000`).
2. Navigate the active tab to that room (`tryhackme.com/room/<code>`).
3. Confirm the toolbar icon is enabled.
4. Click it.
5. **Pass:** within ~2 seconds, a notification reads `Added: <Room Name> (<Difficulty>)`. The tracker UI shows the new row with correct name, URL, difficulty, `Other` category, `To Do` status.

- [ ] **Step 3: Test 2 — Duplicate**

1. With the same room page still open, click the toolbar icon again.
2. **Pass:** notification reads `Already in tracker: <Room Name>`. No new row in the tracker.

- [ ] **Step 4: Test 3 — Server unreachable**

1. Stop `python main.py` (Ctrl+C).
2. On a THM room page, click the toolbar icon.
3. **Pass:** notification reads `Couldn't reach tracker at http://localhost:3000 — is it running?`. Restart the server before continuing.

- [ ] **Step 5: Test 4 — Custom server URL surfaces in errors**

1. Open the extension's Options page; set URL to `http://localhost:9999`; save.
2. On a THM room page, click the toolbar icon.
3. **Pass:** notification reads `Couldn't reach tracker at http://localhost:9999 — is it running?` (the configured URL appears verbatim).
4. Reset the options URL to `http://localhost:3000` and save.

- [ ] **Step 6: Test 5 — Non-room THM page**

1. Navigate to `https://tryhackme.com/dashboard`.
2. **Pass:** toolbar icon is greyed/disabled; tooltip reads `THM Room Tracker (open a TryHackMe room page)`.

- [ ] **Step 7: Test 6 — Non-THM page**

1. Navigate to `https://example.com`.
2. **Pass:** toolbar icon disabled; same tooltip as above.

- [ ] **Step 8: Test 7 — Concurrency guard**

1. On a fresh, untracked THM room page, click the toolbar icon 3–4 times rapidly (within ~1 second).
2. **Pass:** exactly one new row in the tracker UI. The first click's `Added: …` notification was shown; subsequent clicks during the in-flight period were silently dropped.

- [ ] **Step 9: If all eight tests pass, no further action is needed.**

If any test fails:
- Inspect the background page Console for stack traces.
- Verify the server is reachable from the same machine the browser is on (e.g. `curl http://localhost:3000/api/rooms` from PowerShell).
- Confirm `host_permissions` in `manifest.json` cover the server URL you've configured.

Do **not** commit anything for this task — it is verification only. If a defect is found, raise it as a new task (or fix inline and amend the relevant Task 1–5 commit per the engineer's discretion).

---

## Self-Review (writer's checklist — completed before handoff)

**1. Spec coverage:**

| Spec section / requirement | Task |
|---|---|
| `extension/` directory + MV3 manifest with permissions, host permissions, gecko id | Task 1 |
| Icons (placeholder acceptable) | Task 1 (SVG icon shared across all sizes) |
| Toolbar enable/disable on THM room URLs (`/room/<code>` and `/r/<code>`) | Task 2 |
| Click flow: dup check → room-info → POST | Task 3 |
| In-flight concurrency guard | Task 3 step 2 + verification step 7 |
| Single shared notification id | Task 3 step 1 (`NOTIFICATION_ID`) |
| Failure → notification table (4 rows) | Task 3 step 2 covers all 4 |
| Options page with origin-only URL validation + storage persistence | Task 4 |
| Default `http://localhost:3000` fallback when storage empty | Task 3 step 1 (`DEFAULT_SERVER_BASE` + `getServerBase`) and Task 4 step 2 (`load()`) |
| `CLAUDE.md` install note | Task 5 |
| Full manual test plan (7 spec items) | Task 6 — Tests 1–7 map 1:1 to spec's manual test plan; Test 8 (Concurrency) covered as Test 7 in spec / Step 8 here |

**2. Placeholder scan:** No TBD/TODO/"add appropriate" — every code step contains the full code. Every verification step includes the exact URL/command and the exact expected text.

**3. Type/name consistency:** `THM_ROOM_RE`, `isThmRoomUrl`, `refreshActionForTab`, `getServerBase`, `trimSlash`, `notify`, `readErrorMessage`, `handleAddClick`, `NOTIFICATION_ID`, `DEFAULT_SERVER_BASE`, `inFlight` — all referenced consistently across Tasks 2, 3, 4. The `DEFAULT_SERVER_BASE` constant is duplicated in `options.js` (Task 4) and `background.js` (Task 3); this is intentional since the two scripts share no module system. Both use the identical string `"http://localhost:3000"`.
