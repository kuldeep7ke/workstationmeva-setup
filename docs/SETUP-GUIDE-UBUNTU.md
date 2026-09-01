# Workstation Meva Online — Ubuntu / Debian Setup Guide

Step-by-step instructions for running the **Workstation Meva Online** server on an **Ubuntu** (or any Debian-based) machine, making it available to every user on the office LAN, auto-starting it at boot as a background service, and troubleshooting common issues.

This version uses **your own Supabase PostgreSQL database** (free tier) instead of a local database file — every fresh install starts with an empty database and the first user to sign up becomes the admin.

---

## Table of Contents

1. [Overview & Requirements](#1-overview--requirements)
2. [Create Your Database (Supabase)](#2-create-your-database-supabase)
3. [Install & Configure the Server](#3-install--configure-the-server) — 3a. one-file `.deb` · 3b. from source
4. [Open the Firewall for LAN Users](#4-open-the-firewall-for-lan-users)
5. [Optional: Reverse proxy (Caddy)](#5-optional-reverse-proxy-caddy)
6. [First Use](#6-first-use)
7. [Verification](#7-verification)
8. [Managing the Service](#8-managing-the-service)
9. [Updating the App](#9-updating-the-app)
10. [Troubleshooting — Symptom Table](#10-troubleshooting--symptom-table)
11. [Quick Reference](#11-quick-reference)

---

## 1. Overview & Requirements

| Item | Value |
|------|-------|
| OS | Ubuntu 20.04 / 22.04 / 24.04 (64-bit), or any Debian-based distro |
| Runtime | Node.js 18+ (installer auto-installs: bundled v24.19.0 offline, else Node.js 20 LTS) |
| Database | Supabase PostgreSQL (free tier) — see [SETUP-SUPABASE.md](SETUP-SUPABASE.md) |
| App URL (local) | `http://localhost:3002` |
| App URL (LAN) | `http://<SERVER-IP>:3002` — also `http://<SERVER-IP>` (port 80, bundled Caddy proxy) and `http://<HOSTNAME>` when the client can resolve the server's computer name |
| Port | `3002` (TCP) |
| Installed at | `/opt/workstation-online` (config in `backend/.env`) |
| Service | `workstation-meva.service` under systemd |

**Two ways to install:** (a) a one-file `.deb` package that is **fully offline** — it bundles the built app, a Node.js runtime, and Caddy, so the machine needs no Node.js/npm/compiler/internet (see §3a); or (b) the source-based route, where `ubuntu/install.sh` deploys the source to `/opt/workstation-online`, installs dependencies with `npm ci`, builds both packages, creates `backend/.env` from the template, and registers the systemd service. The database is **never** shipped — the first server start creates all tables automatically (empty), and the first signup becomes the admin.

---

## 2. Create Your Database (Supabase)

Before installing the server, create a free Supabase project and get its connection string. Full step-by-step instructions are in **[SETUP-SUPABASE.md](SETUP-SUPABASE.md)**.

Quick version:

1. Go to https://supabase.com → Sign up (free) → **New project**
2. Choose a region near you, set a strong database password, create
3. Open **Project Settings → Database → Connection string** (use the **Pooler** option, port `6543`)
4. Copy the `postgresql://...` string — you'll paste it into `backend/.env`

---

## 3. Install & Configure the Server

### 3a. One-file `.deb` package (recommended)

A prebuilt, **fully offline** Debian/Ubuntu package is available: `installer/workstation-meva-online_1.0.0_amd64.deb`.
It bundles the built app, a Node.js runtime, and the Caddy reverse proxy, so **no Node.js, no npm, no compiler,
and no internet are needed at install time**. To build it yourself from source run
`node ubuntu/installer/build-deb.js` (produces the file above).

Copy it to the Ubuntu machine and install:

```bash
sudo apt install ./workstation-meva-online_1.0.0_amd64.deb
```

What `postinst` does automatically on first install:

1. Creates a `meva` system user
2. Extracts the bundled Node.js to `/opt/workstation-node`
3. Creates `/opt/workstation-online/backend/.env` (once, with a generated `JWT_SECRET`)
4. Registers + starts two systemd services: `workstation-meva.service` (the app) and `workstation-meva-caddy.service` (proxy on port 80)
5. Opens ports `80` and `3002` in `ufw` if it's active

Then configure your database (same as below): edit `/opt/workstation-online/backend/.env`,
set `DATABASE_URL`, and restart:

```bash
sudo nano /opt/workstation-online/backend/.env
sudo systemctl restart workstation-meva.service
```

Upgrading later = `sudo apt install ./workstation-meva-online_1.0.0_amd64.deb` again when a new `.deb` is
released (your `.env` and data are preserved). To fully remove: `sudo apt remove --purge workstation-meva-online`.

### 3b. Install from source

**Quick path:** clone the repo on the Ubuntu machine, then run the installer:

```bash
# Install git + curl (if missing)
sudo apt update && sudo apt install -y git curl

# Clone the repository
git clone https://github.com/kuldeep7ke/workstationmeva-setup.git
cd workstation

# Run the installer (installs Node.js, builds, installs the service)
sudo bash ubuntu/install.sh
```

> **No internet?** The repo bundles Node.js v24.19.0 in `tools/node/` — the
> installer detects `tools/node/node-v24.19.0-linux-x64.tar.xz` and installs
> Node from it automatically (no download needed). If the bundle is missing it
> falls back to NodeSource (Node.js 20 LTS).

**What the installer does:**

1. Checks/installs Node.js 18+ (bundled offline v24.19.0 when present, else Node 20 LTS via NodeSource)
2. Deploys the source to `/opt/workstation-online`
3. Runs `npm ci` + `npm run build` for backend and frontend
4. Creates `backend/.env` from `.env.example` (if missing)
5. Creates a system user `meva` and registers `workstation-meva.service`
6. Enables + starts the service and verifies the health endpoint

**After installing — configure your database:**

```bash
sudo nano /opt/workstation-online/backend/.env
```

Set these two values:

```ini
# Your Supabase connection string (Pooler, port 6543)
DATABASE_URL=postgresql://postgres.your-ref:your-password@aws-0-region.pooler.supabase.com:6543/postgres

# Any long random string (e.g. from: openssl rand -hex 32)
JWT_SECRET=change-me-to-a-random-string
```

Save, then restart:

```bash
sudo systemctl restart workstation-meva.service
```

> Note: passwords with special characters must be URL-encoded in the connection string (`&` → `%26`, `%` → `%25`, `@` → `%40`).

---

## 4. Open the Firewall for LAN Users

On Ubuntu with **ufw**:

```bash
sudo ufw allow 3002/tcp
```

If using firewalld instead:

```bash
sudo firewall-cmd --permanent --add-port=3002/tcp && sudo firewall-cmd --reload
```

---

## 5. Optional: Reverse proxy (Caddy)

The server already works for LAN users at `http://<SERVER-IP>:3002`. Caddy only
adds: a clean URL without the port (`http://<SERVER-IP>`), gzip compression,
and static-file caching. **Skip this section if you don't need those** — no
installs are required otherwise.

Install via the package manager (no manual downloads):

```bash
sudo apt install caddy        # Ubuntu/Debian
```

Configure once — copy the repo's Caddyfile (it binds port `:80` on every
interface, so **no IP editing needed** — works even if the IP changes):

```bash
sudo cp /opt/workstation-online/proxy/caddy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

Then `http://<SERVER-IP>` serves the app. Caddy runs as a systemd service and
is auto-started with the app (`Wants=caddy.service`); manual mode (`start.sh`)
auto-starts it too, and `stop.sh` stops it.

---

## 6. First Use

1. Open `http://localhost:3002` on the server, or `http://<SERVER-IP>:3002` from any LAN device
2. Click **Sign Up** and create the first account — **the first user automatically becomes the admin**
3. All further signups are held for admin approval (Dashboard → pending signups)
4. For the desktop-style quick login experience, add PINs for staff under Users/Profiles

### Developer login (restricted — NOT admin)

A built-in file-based login exists as a fallback for when the database is
missing, corrupt, or locked: **`dev-admin`** (default password `Dev@Meva2026`,
stored in `backend/.dev-credentials`, change it from the Developer page).
It is **deliberately not an admin account** — staff level only, so it cannot
manage users, change settings, or reset the database. It can only open the
Developer page (diagnostics, dev tools), the Backups tab, and the repair
tools. For full administration, always use the first admin signup.

---

## 7. Verification

```bash
# Service status
sudo systemctl status workstation-meva.service --no-pager

# Health endpoint
curl http://localhost:3002/api/health
# → {"status":"ok",...}

# Live logs
sudo journalctl -u workstation-meva.service -f
```

---

## 8. Managing the Service

```bash
sudo systemctl start workstation-meva.service    # start
sudo systemctl stop workstation-meva.service     # stop
sudo systemctl restart workstation-meva.service  # restart
sudo systemctl status workstation-meva.service   # status
sudo systemctl disable workstation-meva.service  # disable autostart at boot
```

Manual (foreground) mode — useful for debugging:

```bash
sudo -u meva bash /opt/workstation-online/ubuntu/start.sh
```

---

## 9. Updating the App

```bash
cd ~/workstation-online        # your clone
git pull
sudo bash ubuntu/install.sh    # redeploys, rebuilds, restarts (keeps .env + data)
```

Your `backend/.env` and all data in Supabase are preserved — they live outside the deployed files.

---

## 10. Troubleshooting — Symptom Table

| Symptom | Likely cause / fix |
|---------|-------------------|
| `Error: DATABASE_URL not set` | `backend/.env` missing or empty — set your Supabase connection string |
| `password authentication failed` | Wrong Supabase password, or special characters not URL-encoded |
| `could not translate host name` | Wrong pooler host — re-check the connection string |
| Port 3002 busy | `sudo lsof -i tcp:3002` → kill the process, or change `PORT` in `.env` |
| Empty dashboard / no staff | Fresh database — sign up the first user (becomes admin) |
| LAN users can't connect | Open port 3002 in the firewall (section 4) |
| Browser shows `Cannot GET /` or `Frontend build not found` | The frontend was never built on this machine — `cd frontend && npm ci && npm run build`, then restart (`sudo systemctl restart workstation-meva`) |
| `http://workstation` / `http://<hostname>` doesn't resolve | Name lookup happens on the *client* — use the server IP, run a helper from `lan/` on that client, or add a DNS entry in the router |
| Health endpoint not ready | Give it a few seconds after start, then `journalctl -u workstation-meva.service -n 30` |

---

## 11. Quick Reference

```
Install:      sudo bash ubuntu/install.sh
Configure:    sudo nano /opt/workstation-online/backend/.env
Restart:      sudo systemctl restart workstation-meva.service
Logs:         sudo journalctl -u workstation-meva.service -f
Manual run:   sudo -u meva bash /opt/workstation-online/ubuntu/start.sh
Stop manual:  sudo -u meva bash /opt/workstation-online/ubuntu/stop.sh
```

For RHEL/CentOS/Rocky/AlmaLinux/Fedora see **[SETUP-GUIDE-RHEL.md](SETUP-GUIDE-RHEL.md)**. For macOS use the `mac/` launchers. For Windows use the launchers in the `windows/` folder.
