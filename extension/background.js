// THM Room Tracker — background event page.
"use strict";

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
        await notify(`Couldn't check tracker: ${await readErrorMessage(resp)}`);
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
  } catch (_) {
    await notify("Unexpected error — check the background page console for details.");
  } finally {
    inFlight.delete(tab.id);
  }
}

browser.action.onClicked.addListener(handleAddClick);
