# VPS + Tailscale Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the THM Room Tracker hostable on a single-user Ubuntu VPS, reachable only from the owner's own devices via Tailscale, with `rooms.db` kept in the app directory and no auth code added to the app.

**Architecture:** The FastAPI app keeps binding to `127.0.0.1:3000` (unchanged). A systemd unit runs it on boot. `tailscale serve` terminates HTTPS on the tailnet and proxies to localhost; the public internet sees nothing on web ports. Access control is device identity (Tailscale account), not an app login. This plan delivers the **repo artifacts** (systemd unit template, deployment runbook, CLAUDE.md section, extension manifest host) that make that deployment reproducible; the VPS-side execution is captured as the runbook in `deploy/DEPLOY.md`.

**Tech Stack:** Ubuntu, Tailscale (`tailscale serve`), systemd, Python venv (FastAPI/uvicorn), Node/npm (one-time Vite build), `ufw`, Firefox MV3 extension.

**Note on testing:** This repo has no automated test suite (per CLAUDE.md, `npm run build` runs `tsc` as the only static check, and there is no Python test runner). The repo changes here are config/docs plus one JSON edit, so verification per task is JSON validity, file presence, and content review. End-to-end deployment is verified on the VPS using the checklist in the spec's "Verification" section (reproduced in `deploy/DEPLOY.md`).

**Reference spec:** `docs/superpowers/specs/2026-06-03-vps-tailscale-deployment-design.md`

---

## File Structure

- **Create `deploy/roomtracker.service`** — systemd unit template. Sole responsibility: define how systemd runs the app (working dir, venv python, PORT env, restart policy, boot enablement). Operator edits `User`/paths to match their VPS.
- **Create `deploy/DEPLOY.md`** — the operator runbook. Sole responsibility: exact, ordered commands to stand up the VPS (Tailscale, code, venv, build, systemd, `tailscale serve`, ufw), configure the Firefox extension, and verify.
- **Modify `extension/manifest.json`** — add the `.ts.net` origin to `host_permissions` so the extension may `fetch` the tailnet server. Sole responsibility: extension network permissions.
- **Modify `CLAUDE.md`** — add a short **Deployment** section that points at `deploy/DEPLOY.md`. Sole responsibility: discoverability for future work in the repo.

No changes to `main.py`, `db.py`, `thm.py`, or `frontend/`.

---

## Task 1: systemd unit template

**Files:**
- Create: `deploy/roomtracker.service`

- [ ] **Step 1: Create the unit file**

Create `deploy/roomtracker.service` with exactly this content. The example path is `/opt/roomtracker` and the example service user is `roomtracker`; the operator changes those (and only those) to match their VPS — `WorkingDirectory` is what guarantees `rooms.db` is created/opened in the app directory.

```ini
# systemd unit for the THM Room Tracker.
#
# Install (on the VPS), assuming the repo lives at /opt/roomtracker and runs
# as the service user `roomtracker` (edit both below to match your setup):
#
#   sudo cp /opt/roomtracker/deploy/roomtracker.service /etc/systemd/system/
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now roomtracker
#   systemctl status roomtracker
#
# The app binds 127.0.0.1:3000 (see main.py); it is exposed to your devices by
# `tailscale serve` (see deploy/DEPLOY.md), never to the public internet.
[Unit]
Description=THM Room Tracker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=roomtracker
Group=roomtracker
WorkingDirectory=/opt/roomtracker
Environment=PORT=3000
ExecStart=/opt/roomtracker/.venv/bin/python /opt/roomtracker/main.py
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Verify the file is well-formed**

Run: `git --no-pager diff --stat -- deploy/roomtracker.service` (after `git add -N deploy/roomtracker.service`) or simply confirm the file exists and contains `WorkingDirectory=/opt/roomtracker` and `ExecStart=/opt/roomtracker/.venv/bin/python /opt/roomtracker/main.py`.
Expected: file present; both lines present; `[Unit]`, `[Service]`, `[Install]` sections all present.

- [ ] **Step 3: Commit**

```bash
git add deploy/roomtracker.service
git commit -m "Add systemd unit template for VPS deployment"
```

---

## Task 2: Deployment runbook

**Files:**
- Create: `deploy/DEPLOY.md`

- [ ] **Step 1: Create the runbook**

Create `deploy/DEPLOY.md` with exactly this content:

````markdown
# Deploying the THM Room Tracker on a VPS (Tailscale, single-user)

This stands the tracker up on an **Ubuntu VPS** reachable **only from your own
devices** via Tailscale. The app stays bound to `127.0.0.1:3000`; `tailscale
serve` fronts it with HTTPS on your tailnet. Nothing is exposed to the public
internet. `rooms.db` stays in the app directory.

Placeholders used below — substitute your own:
- `APP_DIR` = `/opt/roomtracker` (where the repo lives)
- `SVC_USER` = `roomtracker` (the non-root user that runs it)
- `<host>.<tailnet>.ts.net` = your VPS's Tailscale HTTPS hostname

## 1. Install Tailscale and join your tailnet

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up        # opens a login URL; authenticate with your Google account
tailscale status         # confirm the VPS is in your tailnet
```

In the Tailscale **admin console** (one-time, account-wide):
- Enable **MagicDNS**.
- Enable **HTTPS certificates**.

Find this machine's HTTPS hostname:

```sh
tailscale cert           # prints/issues the cert for <host>.<tailnet>.ts.net
```

## 2. Get the code onto the VPS

```sh
sudo mkdir -p /opt/roomtracker
sudo useradd --system --home /opt/roomtracker --shell /usr/sbin/nologin roomtracker || true
# Clone (or rsync) the repo into /opt/roomtracker, then:
sudo chown -R roomtracker:roomtracker /opt/roomtracker
```

## 3. Python environment

```sh
sudo apt-get update && sudo apt-get install -y python3-venv
cd /opt/roomtracker
sudo -u roomtracker python3 -m venv .venv
sudo -u roomtracker .venv/bin/pip install -r requirements.txt
```

## 4. Build the frontend (once)

`frontend/dist/` is gitignored, so it must be built on the VPS. Re-run this only
after changing anything under `frontend/src`.

```sh
sudo apt-get install -y nodejs npm        # or install a current Node via nodesource
cd /opt/roomtracker/frontend
sudo -u roomtracker npm install
sudo -u roomtracker npm run build         # emits frontend/dist/ that main.py serves
cd /opt/roomtracker
```

## 5. Run it as a service

```sh
sudo cp /opt/roomtracker/deploy/roomtracker.service /etc/systemd/system/
# If you changed APP_DIR or SVC_USER, edit /etc/systemd/system/roomtracker.service to match.
sudo systemctl daemon-reload
sudo systemctl enable --now roomtracker
systemctl status roomtracker              # should be active (running)
curl -s http://127.0.0.1:3000/api/rooms   # should return JSON
```

`rooms.db` is now created in `/opt/roomtracker` (the unit's `WorkingDirectory`).

## 6. Expose it to your devices over the tailnet

```sh
sudo tailscale serve --bg 3000
tailscale serve status                    # shows https://<host>.<tailnet>.ts.net -> 127.0.0.1:3000
```

Open `https://<host>.<tailnet>.ts.net` from any device signed into your
Tailscale account. (Do **not** use `tailscale funnel` — that would publish it.)

## 7. Lock down the firewall

Tailscale needs no inbound port (it's outbound/NAT-traversing) and the app is
localhost-only, so allow SSH and deny everything else inbound:

```sh
sudo apt-get install -y ufw
sudo ufw allow OpenSSH
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
```

## 8. Point the Firefox extension at the tailnet URL

On your Firefox device (which must be signed into the same Tailscale account):

1. Edit `extension/manifest.json` so `host_permissions` includes the tailnet
   origin — this repo already ships `"https://*.ts.net/*"` there. If you prefer
   to pin the exact host, replace it with `"https://<host>.<tailnet>.ts.net/*"`.
2. Reload the temporary add-on: open `about:debugging#/runtime/this-firefox`,
   **Reload** (or **Load Temporary Add-on…** → `extension/manifest.json`).
3. Open the extension's **options** page and set the server URL to
   `https://<host>.<tailnet>.ts.net`.

## Verification

- `systemctl status roomtracker` is active; survives `sudo reboot`.
- `curl -s http://127.0.0.1:3000/api/rooms` on the VPS returns JSON.
- From a device on your tailnet, `https://<host>.<tailnet>.ts.net` loads the app
  and the API works; the browser shows a valid cert/padlock.
- From a device **not** on your tailnet, the host does not resolve/route, and a
  public port scan of the VPS shows only SSH — confirming no public exposure.
- The Firefox extension adds a TryHackMe room end-to-end against the tailnet URL.

## Updating later

```sh
cd /opt/roomtracker && sudo -u roomtracker git pull
sudo -u roomtracker .venv/bin/pip install -r requirements.txt   # if deps changed
cd frontend && sudo -u roomtracker npm install && sudo -u roomtracker npm run build && cd ..   # if frontend changed
sudo systemctl restart roomtracker
```
````

- [ ] **Step 2: Verify the runbook**

Confirm `deploy/DEPLOY.md` exists and that each numbered section (1–8) is present plus a "Verification" section. Skim that the commands reference `roomtracker.service`, `tailscale serve --bg 3000`, and `https://<host>.<tailnet>.ts.net`.
Expected: all eight steps + Verification + Updating sections present; no `TODO`/`TBD` markers.

- [ ] **Step 3: Commit**

```bash
git add deploy/DEPLOY.md
git commit -m "Add VPS + Tailscale deployment runbook"
```

---

## Task 3: Allow the extension to reach the tailnet server

**Files:**
- Modify: `extension/manifest.json:34-39` (the `host_permissions` array)

- [ ] **Step 1: Add the tailnet origin to `host_permissions`**

In `extension/manifest.json`, change the `host_permissions` array from:

```json
  "host_permissions": [
    "*://tryhackme.com/*",
    "*://*.tryhackme.com/*",
    "http://localhost/*",
    "http://127.0.0.1/*"
  ]
```

to:

```json
  "host_permissions": [
    "*://tryhackme.com/*",
    "*://*.tryhackme.com/*",
    "http://localhost/*",
    "http://127.0.0.1/*",
    "https://*.ts.net/*"
  ]
```

(The localhost entries are kept so the extension still works against a local dev server.)

- [ ] **Step 2: Verify the JSON is valid**

Run: `python -c "import json; json.load(open('extension/manifest.json')); print('ok')"`
Expected: prints `ok` (no `JSONDecodeError` — e.g. confirms the trailing comma was added correctly).

- [ ] **Step 3: Commit**

```bash
git add extension/manifest.json
git commit -m "Allow extension to reach the Tailscale (.ts.net) server"
```

---

## Task 4: Document deployment in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (append a new section after the "Firefox extension" section)

- [ ] **Step 1: Append a Deployment section**

Add this section to `CLAUDE.md`, immediately after the existing "## Firefox extension" section (i.e. as the final top-level section):

```markdown
## Deployment

The app is designed to run on a single-user Ubuntu VPS reachable **only from the
owner's own devices** via Tailscale — there is no in-app authentication. The app
keeps binding to `127.0.0.1:3000`; `tailscale serve` fronts it with HTTPS on the
tailnet, and a `systemd` unit (`deploy/roomtracker.service`) runs it on boot with
`WorkingDirectory` set so `rooms.db` stays in the app directory. The public
internet is never exposed (ufw allows SSH only; Tailscale needs no inbound port).

See `deploy/DEPLOY.md` for the full step-by-step runbook. The Firefox extension
talks to the deployed server too: its `host_permissions` includes
`https://*.ts.net/*` and its options page must point at the tailnet URL.
```

- [ ] **Step 2: Verify**

Confirm `CLAUDE.md` now contains a `## Deployment` section that mentions `deploy/DEPLOY.md`, `tailscale serve`, and `roomtracker.service`.
Expected: section present with those references.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Document VPS + Tailscale deployment in CLAUDE.md"
```

---

## Self-Review

**Spec coverage:**
- Tailscale + `tailscale serve` topology, MagicDNS/HTTPS, no funnel → Task 2 (steps 1, 6).
- App unchanged, binds 127.0.0.1, PORT env → Task 1 (`ExecStart`/`Environment`), no app-code tasks (intentional).
- systemd, `WorkingDirectory` keeps `rooms.db` in app dir → Task 1 + Task 2 step 5.
- Frontend build once on VPS → Task 2 step 4.
- ufw SSH-only → Task 2 step 7.
- Firefox extension: host_permissions + options URL + reload → Task 3 (manifest) + Task 2 step 8.
- `deploy/roomtracker.service`, `deploy/DEPLOY.md`, CLAUDE.md section, manifest host → Tasks 1–4.
- No backup (out of scope) → not present, as intended.
- Verification checklist → Task 2 "Verification" section mirrors spec.

**Placeholder scan:** Operator-substituted values (`/opt/roomtracker`, `roomtracker`, `<host>.<tailnet>.ts.net`) are real, documented substitutions, not unfinished work. No `TODO`/`TBD`/"implement later" in any task.

**Type/name consistency:** Service name `roomtracker` / unit file `roomtracker.service`, host string `https://*.ts.net/*`, port `3000`, and path `/opt/roomtracker/.venv/bin/python` are used identically across Tasks 1–4.
