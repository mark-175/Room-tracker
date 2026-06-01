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
