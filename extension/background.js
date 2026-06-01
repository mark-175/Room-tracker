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
