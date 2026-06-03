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
