# WorkStation Online (Workstation Meva)

A complete Marathi newsroom management suite for LAN or cloud deployment —
users & roles, a 17-stage news-task workflow, stories, bulletins, programs,
ads, archives, locations, reporters, leaves, a studio **teleprompter**,
analytics, PIN login, and real-time updates via Socket.IO.

Runs on **Windows, macOS, Linux, and Android** (wrapper), backed by **your own
Supabase PostgreSQL** database — with an **offline-first sync engine**: if the
internet goes down, the server keeps working on a local mirror and
automatically syncs everything back the moment the connection returns.

> **Status: Pre-release Beta (`v1.0.0-beta.1`) — Testing Mode.** The app is
> **free & public domain (Unlicense)** and travels as a **fresh copy**: no user
> data, no database, no previous settings — ready for new users only.
>
> **Fresh by design** — this repository ships **no user data and no database**.
> On first start the server creates the schema in your Supabase project, and
> the **first account that signs up automatically becomes the admin**.

---

## Highlights

- **17-stage task workflow** — draft → script_writing → footage_collection →
  waiting_confirmation → approved → editor_assigned → teleprompter_ready →
  prompting → recording_done → editing → uploading → published → under_review
  → completed (admin overrides, auto-editor pick, deadlines, extensions, trash)
- **Stories pipeline** — data gathering → confirmation → one-click send-to-tasks
- **Studio teleprompter** — public reading screen with Imaginary-Teleprompter-style
  velocity control: one signed speed axis (-10…+10) where rolling down past zero
  smoothly reverses the script; parks at -3.0 ◀ at the bottom and +3.0 ▶ at the
  top for instant direction changes; works on any device with or without login
- **Offline-first** — full read/write during outages, queued sync on reconnect,
  amber offline banner, live sync status (no data loss, no manual steps)
- **Real-time** — instant multi-device updates via Socket.IO, LAN-wide toast
  notifications for every app change
- **One admin page for data** — Backups page with **Backups / Database tabs**:
  backup snapshots and restore, live sync status, multiple saved Supabase
  connections, live row counts, preserve-or-clean fresh-start reset
- **Database connect rework** — connect to any Supabase DB with Restore (pull
  online data into app) or Fresh Start (push local data to online); your local
  copy is never wiped automatically — wiping is always a manual action
- **Self-managed** — no external services beyond your Supabase project; the
  first signup becomes admin, later signups need admin approval
- **170+ REST endpoints**, all in-app dialogs (zero browser popups)
- **One-click launchers for every OS** — server starts **hidden in the
  background**, auto-restarts on crash, and **opens the app in your browser**
  when ready
- **Self-healing launcher (Windows)** — `windows/start-server.ps1` auto-repairs
  the launcher files (bat/vbs) on every start, heals the firewall rule, and
  verifies the server by HTTP before calling it running
- **Control Panel (Windows, native)** — a launch pad for first-time setup and daily use:
  one-click Start/Stop + live health, **Autostart at login** On/Off, **Caddy proxy** status,
  **database status** (paste Supabase URL, live connectivity test), LAN address copy buttons,
  and tools (repair launcher, heal firewall, clean junk, view logs) — reads/writes the same
  state files as the `.bat` launchers
- **Bundled runtime bits** — Node.js v24.19.0 installers for all OSes
  (`tools/node/`) and the Windows Caddy binary (`proxy/caddy/caddy.exe`) —
  machines can set up fully offline
- **Polished loading UX** — branded splash on boot, shimmer skeletons while
  pages fetch data (no spinners)

## Quick Start (fastest — Windows)

```bat
:: 1. Install Node.js LTS (bundled: tools\node\node-v24.19.0-x64.msi, or https://nodejs.org)
:: 2. Best: launch the CONTROL PANEL first  ->  windows\Control Panel.bat
::    (Start Menu / desktop shortcut after an .exe install)
::    -> live status, set your database URL (Database card -> Save -> Test now),
::      autostart On/Off, proxy toggle, LAN addresses, repair tools
:: 3. In the panel click Start (or double-click windows\Start Server.bat):
::    -> repairs launcher files if needed, creates .env, builds if needed,
::      starts the server hidden (auto-restart), opens the browser
:: 4. Sign Up  ->  first account = admin
:: 5. To use Supabase later: Backups page -> Database tab (or edit backend/.env)
```

Per-OS guides: [Windows](#windows) · [macOS](#macos) ·
[Ubuntu/Debian](#ubuntu--debian) · [RHEL family](#rhel--centos--rocky--almalinux--fedora)

## Features

**People & access**

- Users, roles & profiles — admin / editorial / author / viewer, seat limits,
  pending-signup approval, quick PIN login, avatars, workload tracking

**News production**

- Task workflow with 17 stages, assignments, auto-editor selection, deadlines +
  extensions, news items with anchor/reporter/footage data, reuse detection,
  audit log, trash + permanent delete
- Stories pipeline to confirmation and one-click send-to-tasks
- Bulletins — announcements with 10 default hourly templates, per-user defaults,
  live refresh via Socket.IO
- Programs / Ads / Archives / Locations / Reporters / Leaves — full CRUD,
  scheduling, stats
- **Teleprompter** — see section below

**Admin & platform**

- **Backups page (Backups tab)** — automatic snapshots on every work change,
  restore any point in time, auto-backup settings, archive/keep-forever,
  storage stats; in Supabase mode it shows the Supabase-managed backup info
- **Backups page (Database tab)** — live sync status (online/offline, engine,
  queued/failed counts, last sync, Sync Now), test/save/switch multiple Supabase
  connection links, live row counts per table, preserve data or clean for a
  fresh start
- **Research Data (Backups page)** — automatic usage/workflow/glitch data
  (90 days) with one-click JSON report and CSV exports
- **Developer page** — combined Dev Account + Saved Passwords card, connection
  diagnostics, repair database, local data backup/restore, app name settings
- Analytics & activity feeds (dashboard, workloads, audit trails, toast history)
- REST API (170+ endpoints) with in-app dialogs only
- Multi-OS one-click launchers, optional Caddy reverse proxy
- Cloud-ready (Render config included)

## Teleprompter

A public-facing studio screen — open `/teleprompter` on any device on the LAN,
no login required (the menu entry appears for admins, video editors and
anchors; signed-out visitors stay on the landing page).

**Velocity control (one signed axis, like Imaginary Teleprompter):**

| Control | Action |
|---------|--------|
| Wheel up / ↑ / W | Speed up forward (+0.5 steps, ▶) |
| Wheel down / ↓ / S | Slow down → zero → smooth reverse upward (◀ negative values) |
| Space | Play / pause |
| Middle click | Reset speed to default |
| Shift + wheel | Move the script freely (auto-scroll resumes after 1.5 s) |
| PgUp / PgDn | Jump by screen |
| ← / → | Font size · R top · M mirror · Escape pause/close |

- Speed range **-10…+10**, shown as a signed value (`3.0 ▶`, `-2.5 ◀`)
- Sub-pixel smooth scrolling — even 0.5 ▶ creeps visibly
- **Bottom park:** reaching the end stops and resets to **-3.0 ◀** so reversing
  is instant; the "Script Ended" popup (Finished / Restart / Close) appears
  after a short dwell and is cancelled if you reverse away
- **Top park:** reversing to the top stops and resets to **+3.0 ▶**
- Adjusting speed while paused resumes motion immediately (no forced fullscreen)
- Settings persist per machine; use **New Script** on the list page to paste
  your own text and prompt it instantly (saved device-local)
- Finishing a task advances it to `recording_done` and moves it to the editor

## Offline-First Sync (how it works)

The backend keeps a small local database mirror (`backend/workstation.db`,
SQLite via sql.js) alongside Supabase.

| State | Behavior |
|-------|----------|
| **Online** | Every write is applied locally **and** to Supabase; reads come from Supabase with instant local fallback |
| **Offline** | Server switches to the mirror automatically — **reads and writes keep working**; changes are queued (`sync_outbox`) and an amber banner appears in the app |
| **Reconnect** | Within seconds the queued changes replay to Supabase automatically (`db:synced` toast), the banner disappears, and the mirror re-aligns |

- No data loss, no manual steps, no downtime during short or long outages.
- Admins can watch the queue in **Backups → Database tab → Sync Status**
  (`GET /api/sync/status`) and force a replay with **Sync Now**
  (`POST /api/sync/replay`).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + React, Socket.IO client, Tailwind-style utility CSS |
| Backend | Node.js 18+ / Express, TypeScript, Socket.IO, JWT, bcryptjs |
| Database | PostgreSQL (Supabase free tier, pooler :6543) via `pg` |
| Offline mirror | SQLite via `sql.js` (`backend/workstation.db`) + outbox sync engine |

## Repository Layout

```
backend/           Express + Socket.IO API (TS -> dist/), sync engine, mirror DB
frontend/          React SPA (Vite)
android/           Android wrapper app (bundles Node runtime)
docs/              All guides: memory capsule, from-scratch blueprint, setup guides
proxy/             Optional reverse proxy: Caddyfile (:80 -> :3002) + caddy.exe (Windows)
ubuntu/            Ubuntu/Debian installer + systemd service + start/stop scripts
redhat/            RHEL-family installer + systemd service + start/stop scripts
mac/               macOS launchers (.command) + auto-start
windows/           Windows launchers: Start/Stop Server.bat, Start Server Hidden.vbs,
                   start-server.ps1 (self-healing launcher + auto-repair),
                   start-server-core.ps1 (auto-restart wrapper), Repair Launcher.bat,
                   autostart bats, Create .env.bat, Clean Junk.bat
lan/               LAN client helpers (friendly hostname, open-app shortcuts)
clean-junk.sh      Junk cleaner for Mac/Linux (auto-run by the launchers)
create-env.sh      One-time backend/.env creator (Mac/Linux), idempotent
tools/node/        Bundled Node.js v24.19.0 installers (Windows .msi, macOS .pkg, Linux .tar.xz)
render.yaml        Render.com cloud config
```

## Documentation

| Guide | Purpose |
|-------|---------|
| [docs/SETUP-SUPABASE.md](docs/SETUP-SUPABASE.md) | Create your free Supabase database + connect (~5 minutes) |
| [docs/SETUP-GUIDE-WINDOWS.md](docs/SETUP-GUIDE-WINDOWS.md) | Windows 10 / 11 full install |
| [docs/SETUP-GUIDE-UBUNTU.md](docs/SETUP-GUIDE-UBUNTU.md) | Ubuntu/Debian full install |
| [docs/SETUP-GUIDE-RHEL.md](docs/SETUP-GUIDE-RHEL.md) | RHEL/CentOS/Rocky/AlmaLinux/Fedora full install |
| [docs/from-scratch.md](docs/from-scratch.md) | Complete blueprint: how the app is built, end to end |
| [docs/MEMORY-CAPSULE.md](docs/MEMORY-CAPSULE.md) | Developer memory — architecture, invariants, critical logic, debugging playbook, work history |

## Installer (Beta)

The Windows `.exe` installer highlights:
- **v1.0.0-beta.1 (Beta — testing mode)**, free & public domain
- **Always installs a fresh copy** — explicitly excludes any database, `.db`/`.sqlite`
  files, `.env`, logs, backups, and telemetry, so **no previous user data** ever ships
- Bundles the Node.js runtime + Caddy proxy + launcher scripts for fully-offline setup
- Build it yourself: see `docs/SETUP-GUIDE-WINDOWS.md` §12

## Prerequisites

- **Node.js 18+** (Linux installers install Node automatically — bundled offline v24.19.0, else NodeSource 20 LTS; macOS/Win: see the bundled installers below)
- **A free Supabase project** — see [docs/SETUP-SUPABASE.md](docs/SETUP-SUPABASE.md)

> **Offline installs:** the repo bundles Node.js v24.19.0 installers for every OS
> in `tools/node/` (`node-v24.19.0-x64.msi` for Windows,
> `node-v24.19.0.pkg` for macOS, `node-v24.19.0-linux-x64.tar.xz` for Linux),
> plus the Windows Caddy binary at `proxy/caddy/caddy.exe` — handy when a
> machine has no internet.

---

## Quick Start per OS

### Windows

1. Install Node.js LTS (bundled offline installer: `tools\node\node-v24.19.0-x64.msi`, or https://nodejs.org)
2. **Nothing to configure** — the first `windows\Start Server.bat` run creates
   `backend/.env` automatically (random JWT_SECRET; runs on the local database).
   To connect Supabase instead, paste your `DATABASE_URL` in the app under
   **Backups → Database** or edit `backend/.env` (see
   [docs/SETUP-SUPABASE.md](docs/SETUP-SUPABASE.md)):
   ```
   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```
3. Double-click **`windows\Start Server.bat`** — on a fresh machine it
   **installs dependencies (`npm ci`) and builds automatically**, then starts the
   server **hidden** (auto-restart wrapper: restarts after crashes) and **opens
   the app in your browser** once it is ready. Double-clicking again while
   running just opens the browser. It also:
   - **self-heals the launcher files** on every start — if any of
     `Start Server.bat`, `Stop Server.bat`, `Start Server Hidden.vbs`, or
     `firewall-heal.bat` is corrupted, it is restored automatically
     (see `windows/Repair Launcher.bat` for a manual repair option)
   - heals the Windows firewall rule (`Workstation Meva 3002`, all network
     profiles) so other machines on your LAN can open `http://<this-PC-IP>:3002`
   - auto-starts the Caddy reverse proxy (`proxy\caddy\caddy.exe` is bundled),
     which also serves **port 80** → `http://<this-PC-IP>` without a port
4. Stop: **`windows\Stop Server.bat`** (stops server + wrapper + proxy) ·
   Auto-start at login: **`windows\Install Autostart.bat`** (starts silently, no
   browser) · Remove: **`windows\Remove Autostart.bat`** — or manage all of this
   in the **Control Panel** (`windows\Control Panel.bat`)

### LAN access from other machines

- Direct: `http://<SERVER-IP>:3002` (firewall rule is healed automatically)
- No port: `http://<SERVER-IP>` when Caddy is running (port 80 → 3002)
- Friendly name: run **`lan\Add Workstation Hosts.bat`** on each machine
  (Mac: `lan/Add Workstation Hosts.command`) so everyone can open
  `http://workstation:3002` — see [lan/README.md](lan/README.md)
- If a fresh clone shows *"Cannot GET /"* or a build-needed page, run the
  frontend build once (`cd frontend && npm run build`) or just restart via the
  launcher, which builds automatically
- Everything is plain HTTP — no certificates needed

### macOS

1. Install **Node.js LTS** (any 18+ works: `brew install node`, or double-click
   the bundled offline installer `tools/node/node-v24.19.0.pkg`)
2. **Nothing to configure** — `backend/.env` is created automatically on first
   run (random `JWT_SECRET`, local database; Supabase via Backups → Database
   later — same as Windows above)
3. Double-click **`mac/Start Server.command`** — starts hidden (auto-restart
   wrapper), auto-starts Caddy if installed (`brew install caddy`), waits for
   the server to be ready (health check, up to 60 s), then opens the app in the
   browser and prints the LAN URL. Double-clicking again while running just
   opens the browser. If macOS asks whether `node` may accept incoming
   connections, click **Allow** — otherwise LAN users can't reach the server.
4. Optional: **`mac/Fix Permissions.command`** (if macOS blocks launchers) ·
   **`mac/Install AutoStart.command`** (start at login — uses the same
   crash-limiting wrapper; **`mac/Stop Server.command`** unloads it first so
   the server stays stopped)

### Ubuntu / Debian

```bash
git clone https://github.com/abcnew2025/workstation.git
cd workstation
sudo bash ubuntu/install.sh        # installs Node (bundled offline v24.19.0, else NodeSource 20 LTS), builds, installs systemd service, creates .env (auto JWT_SECRET)
# .env is created automatically (local database). To use Supabase later:
sudo nano /opt/workstation-online/backend/.env   # set DATABASE_URL + JWT_SECRET
sudo systemctl restart workstation-meva.service
```

Manual (no systemd): `bash ubuntu/start.sh` starts the server hidden in the
background (auto-restart wrapper — restarts after crashes), heals the firewall
(ufw port 3002), auto-starts Caddy if installed, waits for the health check
(up to 60 s), then opens the app in the browser on desktop sessions
(`--foreground` keeps the old foreground mode); stop with `bash ubuntu/stop.sh`
(stops server + wrapper + Caddy).

Full guide: **[docs/SETUP-GUIDE-UBUNTU.md](docs/SETUP-GUIDE-UBUNTU.md)**

### RHEL / CentOS / Rocky / AlmaLinux / Fedora

```bash
git clone https://github.com/abcnew2025/workstation.git
cd workstation
sudo bash redhat/install.sh        # dnf + firewalld, opens port 3002, installs Node (bundled offline v24.19.0, else NodeSource 20 LTS), creates .env (auto JWT_SECRET)
# .env is created automatically (local database). To use Supabase later:
sudo nano /opt/workstation-online/backend/.env   # set DATABASE_URL + JWT_SECRET
sudo systemctl restart workstation-meva.service
```

Manual (no systemd): `bash redhat/start.sh` — same behavior as Ubuntu above
(firewalld port 3002 instead of ufw).

Full guide: **[docs/SETUP-GUIDE-RHEL.md](docs/SETUP-GUIDE-RHEL.md)**

---

## First Use (any OS)

1. Open `http://localhost:3002` on the server — LAN users open
   `http://<SERVER-IP>:3002` (or port 80 via Caddy, or the friendly
   `http://workstation:3002` after running the `lan/` scripts on each machine).
2. Click **Sign Up** — the first account becomes the **admin**
3. The admin approves further signups (Dashboard → pending signups), manages
   seats, and sets up staff PINs
4. Pre-existing data? Check **Backups → Database tab → Database Data** —
   preserve it or clean for a fresh start (next signup becomes admin)

### Developer login (restricted — NOT admin)

A built-in file-based login (`dev-admin`, default password `Dev@Meva2026`,
stored in `backend/.dev-credentials`, never in the database) is available so the
app stays reachable even when the database is missing/corrupt. It is **deliberately
not an admin account**:

- Level: staff (`access_level 3`) — it cannot manage users, change settings,
  switch/reset the database, or open admin-only sections (the **Database** tab
  on the Backups page, Settings admin cards, etc.).
- Kept for developers only: the Developer page (connection help, diagnostics,
  dev tools), the Backups tab, and `clean-all-data`.
- Change its password from **Developer page → Dev Account tab**.
- For full administration use a real admin signup, not the developer login.

## Cloud Deployment (Render)

```bash
cd backend && npm install && npm run build   # then:
cd backend && node dist/index.js
```

Env vars: `DATABASE_URL` + `JWT_SECRET` (see `render.yaml`). Note: the offline
mirror lives on the server's disk — on Render it resets when the instance
restarts; offline writes made during an outage are still replayed as long as the
queue file survives the process lifetime.

## Development

```bash
cd backend && npm install && npm run dev     # API on :3003 (tsx watch)
cd frontend && npm install && npm run dev    # Vite dev server (:5173, proxies /api -> :3003)
```

## Verification

```bash
curl http://localhost:3002/api/health        # -> {"status":"ok",...}
# after login (admin):
GET  /api/sync/status                        # online, engine, queue pending...
POST /api/sync/replay                        # force a sync now
GET  /api/settings/database/state            # live row counts + sync info
```

## Security Notes

- `backend/.env`, `backend/saved-connections.json`, `backend/workstation.db`
  (offline sync mirror), `backend/.dev-credentials` (developer login — bcrypt
  hash), and runtime logs are **git-ignored** — they contain database
  credentials or local data. Never commit them.
- The built-in developer login is **not an admin account** (staff level only);
  it exists to keep the app reachable when the database is broken. Change its
  default password (`Dev@Meva2026`) from the Developer page. For real
  administration, use an admin signup instead.
- Secrets leaked into git history must be **rotated** (reset Supabase password,
  change `JWT_SECRET`) — old history keeps the value forever.
- Production traffic on a public server should be HTTPS: put a TLS-terminating
  reverse proxy (e.g. Caddy with a real certificate) in front of port 3002.

---

**Repo:** `https://github.com/abcnew2025/workstation` (private) ·
**License:** Public domain (Unlicense) — free to use, modify, and distribute for any purpose.
