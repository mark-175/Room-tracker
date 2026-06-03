# VPS + Tailscale deployment — design

**Date:** 2026-06-03
**Status:** Approved (ready for implementation plan)

## Goal

Host the THM Room Tracker on a personal Ubuntu VPS so that **only the owner can
access it**, reachable **only from the owner's own devices**. Keep `rooms.db` in
the application directory (not an external/managed database). Authentication is
device-identity based via Tailscale — no login page or auth code in the app.

## Non-goals

- Public/any-browser access (explicitly not needed — owner's own devices only).
- App-level Google OAuth or password login (avoided in favour of network-level
  access control).
- External/managed database (the SQLite file stays beside the app).
- Automated backups (out of scope for now; the existing `GET /api/export`
  remains available on demand).

## Chosen approach

**Tailscale mesh VPN + `tailscale serve`.** The VPS and each of the owner's
devices join a private tailnet (WireGuard). The app continues to bind to
`127.0.0.1:3000` exactly as it does today. `tailscale serve` terminates HTTPS on
the tailnet and reverse-proxies to localhost. The public internet sees nothing
on web ports.

Rejected alternatives:
- **Public reverse proxy (Caddy) + oauth2-proxy / basic auth** — requires a
  domain, public exposure, cert renewal, and an auth gate. Unnecessary because
  any-browser access is not required.
- **App-level Google OAuth in `main.py`** — most code to write/maintain, still
  needs a public HTTPS proxy, worst fit for a single-user case.

## Topology

```
Owner's laptop/phone  ──(tailnet, WireGuard)──►  Ubuntu VPS
  (Tailscale app)                                ├─ tailscale serve: HTTPS on tailnet ─┐
                                                 │                                     ▼
                                                 └─ systemd ─► python main.py @ 127.0.0.1:3000
                                                                       │
                                                                   rooms.db  (same dir)
```

## Access & security model

- **Access control = device identity.** Only devices signed into the owner's
  Tailscale account can route to the site. No login page, no password, no OAuth
  code in the app. Tailscale itself is authenticated via the owner's Google
  account.
- **HTTPS inside the tailnet** via Tailscale's issued cert (requires MagicDNS +
  HTTPS enabled once in the Tailscale admin console). Clean hostname:
  `https://<host>.<tailnet>.ts.net`.
- **No public attack surface.** The app binds localhost only; Tailscale needs no
  inbound firewall port (outbound/NAT-traversing). `ufw` allows SSH only and
  denies all other inbound.
- We use `tailscale serve` (tailnet-only), **not** `tailscale funnel` (which
  would expose it publicly).

## VPS setup (runbook outline → `deploy/DEPLOY.md`)

1. **Tailscale:** install, `sudo tailscale up`, authenticate with Google.
   Enable **MagicDNS** and **HTTPS certificates** in the Tailscale admin
   console (one-time).
2. **Code:** clone/copy the repo to a stable path (e.g. `/opt/roomtracker` or
   `~/roomtracker`), owned by a non-root user.
3. **Python:** create a venv, `pip install -r requirements.txt`.
4. **Frontend:** install Node/npm, run `cd frontend && npm install &&
   npm run build` once (produces the gitignored `frontend/dist/` that `main.py`
   serves). Re-run only after frontend source changes.
5. **systemd:** install `deploy/roomtracker.service` (paths/user filled in),
   `systemctl enable --now roomtracker`. `WorkingDirectory` = the app dir so
   `rooms.db` is created/opened there. `Restart=on-failure`, starts on boot.
6. **Expose over tailnet:** `sudo tailscale serve --bg 3000` →
   `https://<host>.<tailnet>.ts.net`.
7. **Firewall:** `ufw allow OpenSSH`, `ufw default deny incoming`,
   `ufw default allow outgoing`, `ufw enable`.
8. **Devices:** install Tailscale on each of the owner's devices, sign in with
   the same account; open the `.ts.net` URL.

## Repository changes

- **`deploy/roomtracker.service`** — systemd unit template:
  `WorkingDirectory`, `ExecStart` (venv python running `main.py`), `User`,
  `Restart=on-failure`, `Environment=PORT=3000`, install/enable notes.
- **`deploy/DEPLOY.md`** — the full step-by-step runbook (the outline above,
  expanded with exact commands), including the Firefox-extension step.
- **`CLAUDE.md`** — append a short **Deployment** section pointing at
  `deploy/DEPLOY.md`.
- **`extension/manifest.json`** — add the tailnet host to `host_permissions`
  (e.g. `"https://*.ts.net/*"`) alongside the existing localhost entries, so the
  extension's `fetch` to the `.ts.net` server origin is permitted.
- **No changes** to `main.py`, `db.py`, `thm.py`, or the frontend source. The
  app already binds `127.0.0.1` and honours the `PORT` env var.

## Firefox extension impact

The extension keeps working from the owner's Firefox device (it's on the
tailnet). Three adjustments are required:

1. **Server URL** (options page) → `https://<host>.<tailnet>.ts.net`
   (persisted in `browser.storage.local`).
2. **`host_permissions`** in `extension/manifest.json` must include the
   `.ts.net` origin (currently only `localhost`/`127.0.0.1`), or the cross-origin
   `fetch` from `tryhackme.com` pages to the server is blocked.
3. **Reload** the temporary add-on via `about:debugging` after editing the
   manifest.

## Data persistence

`rooms.db` lives in the application directory, guaranteed by systemd's
`WorkingDirectory`. No automated backup in this iteration; `GET /api/export`
provides an on-demand JSON snapshot.

## Verification

- `systemctl status roomtracker` shows active; survives `reboot`.
- `curl -s http://127.0.0.1:3000/api/rooms` on the VPS returns JSON.
- From an owner device on the tailnet, `https://<host>.<tailnet>.ts.net` loads
  the SPA and the API works; padlock/cert is valid.
- From a device **not** on the tailnet, the host does not resolve/route
  (confirms no public exposure). A public port scan of the VPS shows only SSH.
- The Firefox extension adds a room end-to-end against the tailnet URL after the
  three adjustments above.
