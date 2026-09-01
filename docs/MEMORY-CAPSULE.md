# WorkStation Online — Memory Capsule

> The complete project memory: decisions, architecture, invariants, critical
> logic, current verified state, runbook, and debugging playbook. Use this to
> replicate, debug, or continue the project — even if the original developer is
> gone.
>
> **No secrets live in this file.** Credentials stay in `backend/.env` (git-ignored).
> Verified state is dated inline — re-verify after any schema/sync change.

---

## 1. What This Is

**WorkStation Online** ("Workstation Meva") is a Marathi newsroom office suite —
users/roles, a 17-stage news-task workflow, stories, bulletins, programs, ads,
archives, locations, reporters, leaves, teleprompter screens, analytics, PIN
login, and real-time updates. Originally a Windows/SQLite desktop app, now a web
app served over LAN (or internet), backed by **Supabase PostgreSQL**, with an
**offline-first sync engine** that keeps the app fully usable during outages.

| Layer | Technology |
|-------|-----------|
| Backend | Node 18+ / Express / TypeScript, Socket.IO, JWT, bcryptjs |
| Frontend | React SPA (Vite), Socket.IO client, utility-class CSS |
| Database | PostgreSQL via Supabase pooler (`pg`, port 6543) |
| Offline mirror | SQLite via `sql.js` → `backend/workstation.db` + outbox sync engine |
| Repo | `https://github.com/kuldeep7ke/workstationmeva-setup` (public; local branch `main` pushes to `main`) |

## 2. Project Snapshot (verified 2026-08-15)

- **Mode:** PostgreSQL (Supabase pooler, region `ap-northeast-2`). SQLite legacy
  path still compiles but is never used standalone.
- **Schema:** 30 public tables auto-created on first start; launch-clean state =
  users 0, profiles 0, templates 10, channel_metadata 1, backup_config 1.
- **Offline sync:** fully verified end-to-end (online boot + bootstrap, offline
  boot + queued writes, reconnect replay 4/4, PG confirmed, reset leaves mirror
  launch-clean).
- **Admin UI:** database controls live on the **Backups page with tabs**
  (Backups / Database) — not in Settings (Settings keeps app name, appearance,
  channel metadata, user-data export/import, bulletin defaults, clean-data).
- **Loading UX:** branded splash (`SplashLoader`) for auth boot / Suspense /
  full-page loads; shimmer skeletons (`Skeleton` primitives +
  `SkeletonTable`/`SkeletonList`) replace spinners while pages fetch data.
- **Windows launcher:** single self-healing PowerShell script
  (`windows/start-server.ps1`, mode `visible`/`open`/`hidden`/`repair`) — it
  embeds canonical copies of the launcher files and **auto-repairs them on every
  start** (see §7). The cmd-bat parse-error class of bugs cannot recur.
- **Bundled runtimes (repo):** Node.js v24.19.0 installers in `tools/node/`
  (Windows `.msi`, macOS `.pkg`, Linux `.tar.xz`) + Windows Caddy binary at
  `proxy/caddy/caddy.exe` — offline-friendly setup. Guides live in `docs/`.
- **Server:** `node backend/dist/index.js` on `:3002`, serves API + built SPA
  from `frontend/dist`.
- **Database connect rework:** connect to any Supabase DB with Restore (pull
  online data into app) or Fresh Start (push local data to online). Your local
  copy is never wiped automatically — wiping everything is always a manual action.

### Architecture

```
Browser (PC / phone / Android wrapper)
    │  HTTP :3002 (API + SPA)  +  WebSocket (Socket.IO realtime)
    ▼
Express + Socket.IO server (backend/, TS → dist/, node dist/index.js)
    │
    ├─── Supabase PostgreSQL (pooler :6543)   ← source of truth (online)
    └─── SQLite mirror (sql.js, workstation.db) ← always kept, used offline
                                              + sync_outbox queue + 5s health ping
```

### Boot sequence (`initDatabase()`, schema.ts — order matters)

1. **PG block** (only when `DATABASE_URL` set): connect + create missing tables +
   seed defaults. Any failure → `adapter = null` → **offline boot** (app still
   serves, mirror only).
2. **Mirror block** (always): open/create `workstation.db` → `createTables()`
   (SQLite DDL) → `seedDefaultBulletinTemplates()` → `runMigrations()` →
   `initSyncEngine()`.
3. `index.ts` waits for init; on failure continues **only if `mirrorReady()`**,
   else `process.exit(1)`.

**Gotcha:** `runMigrations()` must run **before** `initSyncEngine()` (bootstrap
needs the tables migrations create: `backup_config`, `channel_metadata`, …) and
must use mirror-direct statements (`new Statement(...)` / `db.run`), **never**
the dual-path `prepare()` — the sync engine isn't initialized yet.

### Request flow (online, PG mode)

```
route handler → prepare(sql) = SyncStatement
  .run():  outbox INSERT → mirror run → PG run (fire-and-forget)
           → mark outbox applied_mirror / applied_pg
  .get()/.all(): PG read → on failure fall back to mirror
offline:  same, but PG leg skipped (engine = mirror); outbox rows wait
```

### Project layout

```
backend/     Express + Socket.IO API (src/ → dist/), sync engine, mirror DB;
             ad-hoc dev tools live in scripts/ (reset-db, db-reset, … — run from backend/)
frontend/    React SPA (Vite)
android/     Android wrapper bundling Node (arm64/armv7l)
docs/        All guides: MEMORY-CAPSULE.md (this file), SETUP-SUPABASE.md,
             SETUP-GUIDE-UBUNTU.md, SETUP-GUIDE-RHEL.md
lan/         LAN client scripts (hosts-entry helpers) + README
proxy/       Caddyfile + caddy.exe (bundled Windows binary) + launchers
tools/node/  Bundled Node.js v24.19.0 installers (msi / pkg / tar.xz)
ubuntu/      installer + systemd service + start.sh (hidden+browser) + stop.sh
redhat/      same for RHEL family
mac/         .command launchers + auto-start (already hidden + browser-open)
windows/     start-server.ps1 (self-healing launcher), Start/Stop Server.bat,
             Start Server Hidden.vbs, start-server-core.ps1 (auto-restart),
             Repair Launcher.bat, autostart bats, Create .env.bat, Clean Junk.bat
create-env.sh  one-time backend/.env creator (Mac/Linux), idempotent
clean-junk.sh  junk cleaner (Mac/Linux): logs + tsbuildinfo older than 7 days
render.yaml  Render.com cloud config
```

**Key frontend components** (`frontend/src/components/`): `DatabasePanels.tsx`
(SyncStatusPanel / DatabaseConnection / DatabaseStatePanel — used by the Backups
page's Database tab), `SplashLoader.tsx` (branded boot splash), `Skeleton.tsx` +
`PageSkeletons.tsx` (shimmer primitives + table/list/card/stat skeletons),
`OfflineBanner.tsx`, `AnimatedLogo.tsx`, `Layout.tsx` (sidebar/header/bottom nav).

---

## 3. Core Invariants (do not break)

### 3.1 Every DB-touching handler is `async` and `await`s `prepare()`

`res.json(<Promise>)` silently serializes to `{}` → frontend white screen.
This was the #1 bug class in the SQLite→PG migration. Fire-and-forget pattern:

```ts
const r: any = prepare('INSERT INTO ...').run(...);
if (r && typeof r.catch === 'function') r.catch(() => {});
```

### 3.2 SQL translation (`convertSyntax()` in postgres.ts)

Longest patterns first. Coverage: `datetime('now'[,+offset])` → `NOW() [+ INTERVAL …]`,
`date('now')` → `CURRENT_DATE`, `time('now')` → `CURRENT_TIME`,
`julianday(expr)` → `EXTRACT(EPOCH FROM expr)/86400.0`, `INSERT OR IGNORE` →
`ON CONFLICT DO NOTHING`, `AUTOINCREMENT` → `SERIAL`, `?` → `$n`.

**Never** leave a trailing `;` inside SQL strings — `run()` appends
`RETURNING id` and a stray `;` causes `42601 syntax error`.

### 3.3 PG types are strict

Never `TEXT` for dates/times (`TEXT >= DATE` → `operator does not exist`).
Use `DATE` / `TIME` / `TIMESTAMPTZ`.

### 3.4 Resilience

- `process.on('unhandledRejection')` is **log-only** — never `process.exit(1)`.
- Error middleware logs `err.message`, `err.where`, `err.detail`; `run()` logs
  failing SQL + params.
- `PG COUNT(*)` returns strings (`"0"`) — frontend uses `|| 0`. Don't "fix".

### 3.5 Frontend loading & navigation

- Auth boot and route fallbacks render `SplashLoader` (never block the app on
  spinners); in-page data loading uses skeleton blocks from
  `PageSkeletons.tsx` — the `loading ?` ternaries must keep their
  `err ?` / empty-state branches intact.
- Backups page tabs: `activeTab: 'backup' | 'database'`; the Database tab (and
  its admin panels) render only when `isAdmin` — the panels call admin APIs
  (`/settings/database/*`, `/sync/*`).
- Tab styling convention (border-b underline, `border-accent-600` active)
  comes from Reporters.tsx — keep it consistent.

### 3.6 Database connect rework

- `POST /settings/database` and `POST /settings/database/use` accept
  `action: 'fresh' | 'restore'`.
- Fresh Start: switch to the new DB, then `POST /database/reset` — pushes local
  data to online.
- Restore: switch to the new DB — pulls online data into the app.
- Local mirror is **never** auto-wiped; `TRUNCATE` + `resetMirrorAndQueue()`
  only on explicit Wipe All Data action.
- `dataLock` prevents concurrent sync operations.
- `normalizeForMirror()` strips PG-specific types before mirror writes.

---

## 4. Database

- **30 public tables** (alphabetical):
  `activity_logs, ads, anchor_tasks, archives, backup_config, backups,
  bulletin_templates, bulletins, channel_metadata, leaves, locations,
  login_attempts, notifications, profiles, reporters, special_programs, stories,
  story_activities, system_activity, system_bulletin_defaults, task_audit_log,
  task_collaborators, task_extensions, task_news_items, tasks, telemetry_errors,
  user_activity, user_bulletin_defaults, users, video_editor_tasks`
- **`tasks_status_check` constraint must contain `prompting`** (17 statuses):
  `draft, script_writing, footage_collection, waiting_confirmation,
  correction_required, approved, editor_assigned, teleprompter_ready, prompting,
  recording_done, editing, uploading, published, under_review, completed,
  cancelled, trashed`.
- Adding a status = edit `schema.ts` (PG_TABLES **and** backup/restore rebuild
  SQL) **plus** an `ALTER TABLE … DROP CONSTRAINT` + re-`ADD` on live Supabase.
- **Seeds** (`seedPostgresDefaults()`, also after fresh-start reset): 10
  `bulletin_templates` (Good Morning 07:00 → Top 24 Headlines 16:00, hourly),
  1 `channel_metadata`, 1 `backup_config`.
- **Managed backups are a no-op in PG** (`saveManagedBackup` returns null) —
  restore via Supabase dashboard (Database → Backups).
- Mirror schema is created by SQLite `createTables()` + `runMigrations()` —
  **must stay SQLite-compatible** (`SERIAL`/`TIMESTAMPTZ`/`DEFAULT NOW()` are
  forbidden; use `INTEGER PRIMARY KEY AUTOINCREMENT`, `TEXT`, `datetime('now')`).

### 4.1 Offline sync engine (`database/sync.ts`) — verified end-to-end 2026-08-07

- **Mirror is always initialized**, even in PG mode.
- **Dual-write:** PG-mode `prepare()` returns `SyncStatement`: mirror first →
  outbox row (`sync_outbox`) → PG (fire-and-forget). Failures leave
  `applied_pg=0` → retried. Reads: PG with mirror fallback.
- **Engine-internal statements never replicate** (fix 2026-08-11): only rows
  backed by an outbox entry (`entryId && getActiveEngine() === 'pg'`) are sent
  to PG. Before the fix, `recordOutbox`/bootstrap/replay-generated SQL went
  through `prepare()` and (a) queued stuck `sync_outbox` rows and (b) double-applied
  writes — a broken server state where the queue never drained and PG rows
  duplicated.
- **Health monitor:** pings PG every 5 s. offline→online: `replayPending()` then
  `bootstrapMirror()`; steady-online: also replays + bootstraps (so a database
  reset self-heals the mirror within 5 s). Emits Socket.IO `db:online`,
  `db:offline`, `db:status`, `db:synced` — but `synced` is emitted **only when
  `synced > 0`, and never more often than once per 60 s per failing outbox
  entry** (`lastAttemptAt` + `RETRY_BACKOFF_MS = 60_000`; fix 2026-08-13 —
  the engine used to broadcast `synced` with `0` on failures too, which drove
  the OfflineBanner reload loop). `POST /api/sync/replay` forces
  `replayPending(true)` past the backoff.
- **Replay** selects `WHERE applied_pg = 0` (mirror-flag irrelevant — a
  mirror-constraint failure must still reach PG). Failures keep `pg_error` and
  log to `sync_log`; counters `syncedWrites/failedWrites` accumulate.
- **Bootstrap** guarded by `bootstrapped` flag + all-key-tables-empty check;
  copies every PG table with `INSERT OR REPLACE` (idempotent vs seeded
  defaults), aligns `sqlite_sequence` and PG `setval` both ways.
- **Persist discipline:** bulk ops disable persist (`setPersist(false)`) and
  must call `flush()` after re-enabling — otherwise the disk file stays stale
  and **resurrects deleted data on restart** (bug found & fixed 2026-08-07).
- **`resetMirrorAndQueue()`** clears mirror + outbox and resets
  `bootstrapped=false`.
- **API:** `GET /api/sync/status` (auth) → `{mode, engine, online, queuePending,
  syncedWrites, failedWrites, lastSyncAt, lastError, …}`; `POST /api/sync/replay`
  (admin); `GET /api/settings/database/state` embeds sync info.
- **UI:** fixed-bottom amber `OfflineBanner` (`components/OfflineBanner.tsx`,
  listens for socket events, reloads on `db:synced` **only when `synced > 0`
  with a 10 s cooldown** — fix 2026-08-13); the sync panel lives in
  `components/DatabasePanels.tsx` (`SyncStatusPanel`) rendered on the
  **Backups page → Database tab** (was Settings → Sync Status) — shows
  online/offline pill, engine, 4 stat cards (queued/synced/failed/**last sync
  time-only**), Check Now, Sync Now.
- **Verified flows:** offline boot (bogus `DATABASE_URL`) served reads/writes on
  mirror; 4 queued writes replayed on reconnect (`Startup replay:
  {"synced":4,"failed":0,"pending":0}`); PG confirmed to contain offline rows;
  reset leaves both PG and mirror launch-clean.

---

## 5. Critical Logic (do not break)

### Tasks (`routes/tasks.ts`)

- `PUT /tasks/:id/auto-approve` — **PUT**, not POST; requires
  `priority: 'urgent'`, else 400.
- `GET /users/:staffId/workload` (users.ts) is the workload endpoint.
- Admin can override illegal transitions (e.g. skip straight to `approved`).
- `video_editor_id`: must **`await findBestVideoEditor()`** — a missing await
  passes a Promise → PG `22P02 "{}"` invalid input for bigint.
- `trackCollaborator(...)` calls must be awaited.
- Permanent delete cascade (`DELETE /tasks/:id/permanent`,
  `POST /tasks/permanent-bulk`, `POST /tasks/empty-trash`) must delete children
  (`task_news_items`, `task_extensions`, `task_collaborators`, `task_audit_log`,
  + `anchor_tasks`, `video_editor_tasks`, `notifications`) or FK violations.
  Empty trash/permanent-bulk return **404**.

### Stories (`routes/stories.ts`)

- Chain: `data_gathering → script_writing → plotting → add_ons → confirmation`,
  then `POST /stories/:id/confirm { approved: true }`.
- Confirmed story → send-to-tasks → returns a `[Story]` task id.
- Delete a story: trash + **permanent-delete** its production task first
  (releases the FK), then delete the story.

### Auth & admin bootstrapping

- **First signup becomes admin** (`access_level 1`); later signups stay pending
  until approved (Dashboard → pending signups). Seat limits cap active seats;
  deactivating a user frees a seat.
- **Developer login is NOT an admin account.** `dev-admin` / `Dev@Meva2026`
  (stored bcrypt-hashed in `backend/.dev-credentials` — git-ignored, file-based
  so it works when the DB is missing/corrupt) logs in only when the ID starts
  with `dev-`; its token is `access_level 3` (staff) + `is_dev: true`. It keeps
  dev-only tools (`authorizeDev`: Developer page, Backups tab, `clean-all-data`,
  `fix-db`, `/auth/dev*`) but **cannot** manage users, change settings, or touch
  the Database tab (`authorize(1)` / `access_level <= 1` checks all reject it).
  Do not "helpfully" raise its level — restricted dev access is deliberate.
- `regen-usernames` rewrites short usernames (`savedadmin` → `sa`); passwords
  keep working, logins change.
- PIN flow: set/verify/request/delete per profile; PIN login works with or
  without full password.

### Backups page — panels (`pages/Backups.tsx`, `components/DatabasePanels.tsx`)

- **Backups tab** — `mode` from `GET /api/backups` (`sqlite` | `postgres`).
  In `postgres` mode the tab shows the Supabase-managed info card only; in
  `sqlite` mode the full snapshot list, auto-settings, restore/archive/notes.
  **Restore and export show a result-summary dialog** (fix 2026-08-13): the
  restore endpoint returns `{ success, restored, summary }` —
  `restoreDatabaseFromFile()` returns `RestoreSummary` (restored file/date,
  per-table row counts, preserved tables, `syncQueueCleared`, warnings); the
  page also parses the downloaded blob to show per-dataset row counts
  (JSON `counts` from the payload, CSV rows from the text) + file name/size.
- **Database tab** (admin only):
  - `DatabaseConnection` — test + save multiple Supabase URLs
    (`saved-connections.json` on disk — **git-ignored, plaintext DB password**);
    label field is optional and its text sits in the **placeholder**
    ("Label (optional)") — there is no label heading.
  - `POST /api/settings/database` tests the connection **before** switching
    (bogus URLs → 502, server untouched); `POST /api/settings/database/use`
    switches to a saved connection.
  - `GET /api/settings/database/state` (admin): live row counts →
    `{hasData, total, counts}` (embeds sync info).
  - `POST /api/settings/database/reset` (admin): 503 while offline; pre-reset
    managed backup (no-op in PG), `TRUNCATE … RESTART IDENTITY CASCADE` on public
    tables, reseed defaults, `resetMirrorAndQueue()` → next signup becomes admin.
  - **Restore vs Fresh Start**: when connecting to a DB with data, user chooses
    Restore (pull online data) or Fresh Start (push local data to online).
    Local data is never auto-wiped.

### Settings page (what stayed behind)

App name, appearance (dark mode), channel metadata, user-data export/import,
bulletin slot defaults + system defaults, clean-all-data flows. **No database
panels remain here** — do not re-add them; point users to Backups → Database.

### Developer page (`pages/Developer.tsx`)

- Combined "Dev Account" + "Saved Passwords & PINs" in one card with sub-tabs.
- Dev login is staff level (`access_level 3`), not admin.
- Activity Logs and Users tabs hidden for non-admin devs.

### Teleprompter control invariants (full blueprint: docs/from-scratch.md §18.1)

- **One signed velocity axis** (-10…+10, 0.5 steps): positive = scroll down,
  negative = reverse upward. Wheel/arrows/WASD all nudge the same value;
  rolling down past zero smoothly reverses (Imaginary-Teleprompter model).
- **Own float position accumulator** (`posRef`) — `element.scrollTop` truncates
  fractions, which made speeds ≤ 2.0 appear dead. Never go back to bare
  `scrollTop +=`.
- **Eased velocity** (`currentVelRef`, ~150 ms time constant) for smooth ramps.
- **Boundary parking:** bottom → stop + speed `-3.0 ◀` (instant reverse; end
  popup only after dwell, cancelled by reversing away); top / R / Restart →
  `+3.0 ▶`. Speed badge + slider always show signed values (`-3.0 ◀`).
- **Adjusting speed while paused auto-resumes** via `beginScroll(false)` — no
  forced fullscreen; only the Start button enters fullscreen.
- **Buttons blur after click** — otherwise keyboard focus sticks on the
  Start/Pause button and all shortcuts die.
- **Close button renders whenever `!scrolling && finishState !== 'done'`** —
  never gate it on a ref (refs don't re-render; that was the "close button
  disappears" bug).
- Custom scripts: created on the list page, stored device-local in
  localStorage (`tp_custom_scripts`, ids `custom-<ts>`, cap 50); served by
  `fetchData` without any API call; `is_task:false` so no start/finish posts.

### Misc gotchas

- Program/story/task/location/reporter/archive creates return **201**.
- Archive updates use `name` (not `title`); news-item updates use `news_script`.
- Frontend: **zero** `window.confirm/alert/prompt` — all dialogs via
  `useDialog()` + `useToast()` (confirmed by grep 2026-08-07).

---

## 6. Environment & Secrets (NOT in git)

`.env.example` shows the shape; the real file is `backend/.env`:

```
DATABASE_URL=postgresql://postgres.<PROJECT-REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres
JWT_SECRET=<random long string>
PORT=3002
NODE_ENV=production
```

- Must use the **pooler** (port 6543); the direct (5432) endpoint can be
  IPv6-only and fails from many servers.
- URL-encode the password: `&`→`%26`, `%`→`%25`, `@`→`%40`.
- Every deployment should create its **own** Supabase project; never hardcode
  refs/passwords in code or docs.
- If a secret leaks into git history, **rotate it** (reset Supabase password,
  change `JWT_SECRET`) — history keeps old values forever.

**Git-ignored local files:** `.env`, `saved-connections.json`, `workstation.db`
(+ `*.db*`), `backups/`, `*.pem`, `server.log`, `server-err.log`, `smoke2*.log`,
`.jwt-secret`, `.dev-credentials` (developer login, bcrypt hash), `telemetry/`
(request-log NDJSON files — auto-pruned), Android build artifacts,
`data-snapshots/` (local DB/full-dump copies — **never commit: real user data,
incl. bcrypt password hashes**; duplicates of `backend/backups/`), `.obsidian/`
(local editor config).

---

## 7. Runbook

### Build & run (Windows dev)

```powershell
cd backend;  npm install; npm run build   # tsc → dist/
cd frontend; npm install; npm run build   # tsc -b && vite build
node backend/dist/index.js                # :3002, API + built SPA
```

### One-click start (all OS)

| OS | Start | Stop | Autostart |
|----|-------|------|-----------|
| Windows | `windows/Start Server.bat` → hidden server + browser opens when ready; self-repairs launcher files; heals firewall; auto-starts Caddy if `proxy\caddy\caddy.exe` exists | `windows/Stop Server.bat` (server + wrapper + Caddy) | `windows/Install Autostart.bat` (silent, no browser) / `windows/Remove Autostart.bat` |
| macOS | `mac/Start Server.command` → hidden (nohup, auto-restart wrapper) + health check (up to 60 s) then browser opens; auto-starts Caddy if installed | `mac/Stop Server.command` (server + wrapper + Caddy) | `mac/Install AutoStart.command` |
| Ubuntu/RHEL manual | `ubuntu\|redhat/start.sh` → firewall self-heat (ufw/firewalld), auto-restart wrapper, auto-start Caddy (if installed, not a service), health check (up to 60 s) + browser (desktop only); `--foreground` = old manual mode | `ubuntu\|redhat/stop.sh` (server + wrapper + Caddy) | systemd via `install.sh` |
| Ubuntu/RHEL systemd | `systemctl start workstation-meva` — `Restart=always` + `Wants=caddy.service` | `systemctl stop workstation-meva` | enabled by `install.sh` |

### Windows launcher internals (start-server.ps1 — self-healing, single source of truth)

**Architecture:** `windows/start-server.ps1` is the ONLY launcher with logic;
the `.bat`/`.vbs` files are thin dispatchers. Modes (arg `-Mode`):
`visible` (double-click; messages + pause on error + opens browser),
`open` (hidden start, opens browser when up), `hidden` (silent — login
autostart), `repair` (fix launcher files and exit — used by
`windows/Repair Launcher.bat`).

**Every start runs these steps in order:**
1. **Self-repair** — the script embeds canonical content for `Start Server.bat`,
   `Stop Server.bat`, `Start Server Hidden.vbs`, `firewall-heal.bat` in a
   `$canonical` hash; each file is compared (`Normalize-Content` = CRLF→LF +
   `.Trim()`) and restored if missing/drifted, with a `REPAIR:` line in
   `server.log`. This is how the cmd parse-error class of failures was
   eliminated permanently — a corrupted `Start Server.bat` cannot survive.
2. **Already running?** — verified by **HTTP** (`Invoke-WebRequest`, up to 5 s),
   not just the port: a port can briefly show LISTENING while the process is
   still shutting down. If up → open browser (visible/open modes) and exit.
   If listening but not answering → kill the stale listener and start fresh.
3. **Junk cleanup** — logs/tsbuildinfo older than 7 days (same whitelist as
   `windows/Clean Junk.bat` / `clean-junk.sh`).
4. **Firewall self-heal** — if the rule `Workstation Meva 3002` is missing,
   relaunch `firewall-heal.bat` elevated (UAC `-Verb RunAs`) — the helper adds
   the rule with `profile=any` (Domain/Private/Public).
5. **Caddy auto-start** (only if `proxy\caddy\caddy.exe` exists, not already
   running).
6. **`.env` auto-create** (from `backend\.env.example`, random 64-hex
   `JWT_SECRET`).
7. **Deps + build** — `npm ci` (fallback `npm install`) when `node_modules`
   missing; `npm run build` when `dist` missing.
8. **Start the watchdog** — `Start-Process powershell -WindowStyle Hidden
   -File start-server-core.ps1` (auto-restart wrapper: restarts `node
   dist/index.js` after crash, max 5 within 60 s, `[core]` lines in
   `server.log`). The wrapper's port-3002 guard: if already listening when it
   starts, it exits (prevents duplicate servers).
9. **Wait + open browser** (visible/open only): poll port up to 60 s, then
   `Start-Process http://localhost:3002`.

**cmd quoting rule (learned the hard way, 2026-08-13):** in `.bat` files,
`powershell -Command "…"` must contain **NO inner double quotes** — cmd toggles
quote state at every `"`, so `\"` escapes still break pipes/parens (observed
error: `'ForEach-Object' is not recognized`). Use single quotes inside
PowerShell and WQL (`-Filter 'Name=''powershell.exe'''`) and quote-free regexes.
PowerShell `-File` invocations are unaffected.

**Wrapper/killer matching rule (2026-08-13):** when killing processes by
command line, match `-File\s+.*start-server-core\.ps1` (the `-File` argument) —
NOT a bare `*start-server-core*` LIKE. A bare LIKE matches the killer's own
command line (the search string is in it), so `Stop Server.bat` could kill
itself mid-iteration and leave the real wrapper alive. Same for any
check script that greps for `start-server-core` — it will match itself.

**Stop order matters:** `Stop Server.bat` kills the wrapper PowerShell FIRST
(else it respawns node), then node on :3002, then `caddy.exe`.

**macOS/Ubuntu/RHEL launchers** mirror the same pattern: hidden/background start,
poll `GET /api/health` until `{"status":"ok"}` (up to 60 s), then open the
browser; already-running → just open the browser. All OSes use an auto-restart
wrapper (`start-server-core.sh` / `.ps1`); Linux systemd mode relies on
`Restart=always`. `stop` scripts kill the wrapper FIRST, then the node server,
then the manually-started Caddy.

### Restart server (Windows, manual)

```powershell
# find + kill (keep commands separate — one-liner kill+start chains flake):
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*dist/index.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
# then start fresh in a new command:
Start-Process node -ArgumentList "dist/index.js" -WorkingDirectory "backend" -WindowStyle Hidden
```

### Verify

- `curl http://localhost:3002/api/health` → `{"status":"ok",…}`
- Server output (stdout + stderr) lands in `server.log` (root, one file — the
  Windows wrapper pipes everything there; `server-err.log` is no longer used).
- Sync: `GET /api/sync/status` (logged-in admin) → `online:true, queuePending:0`
  (UI: Backups → Database tab → Sync Status).

### Offline-sync manual test (safe, no internet needed)

1. Back up `backend/.env`; set `DATABASE_URL` to an unreachable host.
2. Restart → log shows `starting OFFLINE on the local database`; app still works.
3. Create data → `GET /api/sync/status` shows `engine:mirror, queuePending>0`.
4. Restore `.env`, restart → `Startup replay` logs `synced:N, failed:0`;
   verify data in Supabase.

### Reset to launch-clean

`POST /api/settings/database/reset` (admin, online only) — truncates PG,
reseeds defaults, clears mirror + queue (mirror re-bootstraps within 5 s).
UI: Backups → Database tab → Database Data → Clean for Fresh Start.
Scratch tools in `backend/scripts/` (dev only, removable): `db-reset.js`, `drop-tables.js`,
`reset-db.js`, `reset-fixed.js`, `test-db.js`, `check-admins.js`.

### Smoke test

`smoke-test2.ps1` (local temp area, **not committed**) — 159 API checks; last
verified run **PASS=159 FAIL=0 WARN=1** (WARN = password-mask regex
expectation). Bootstraps `savedadmin`/`Admin!234` on a clean DB. Wipe after via
`POST /api/settings/database/reset`.

### Frontend skeleton conventions

- Boot: `SplashLoader` (AnimatedLogo + app name + shimmer bar) — used by
  `PageLoader` in App.tsx (auth loading + Suspense) and by full-page loading
  in Landing / Onboarding / TaskDetail. Teleprompter screens keep their own
  black-background spinners (thematic).
- In-page: `SkeletonTable` (list/table pages: Tasks, Ads, Stories, Users,
  RecycleBin, Published, Programs, Backups), `SkeletonList` (Archive, Reporters,
  PinManagement, Activity tabs), `SkeletonStatCards` / `SkeletonCards` for
  dashboard-style layouts. Always keep the `err`/empty branches intact.

### Developer login restrictions (frontend)

- The dev token is staff level (`access_level 3`), so `isAdmin` checks
  (`access_level <= 1`) hide admin sections for devs: Backups → Database tab,
  Settings admin cards, Users/activity management pages.
- Backend `/api/backups*` routes use `authorizeAdminOrDev` (admin
  `access_level <= 1` OR `is_dev`) — admins can manage backups without a dev
  login; `/backups/fix-db` stays dev-only.
- Developer page (`pages/Developer.tsx`) computes `isAdmin =
  !user?.is_dev && access_level <= 1`: the **Activity Logs** and **Users** tabs
  and their fetches (`/analytics/activity`, `/users`, `/settings/database`) are
  hidden for non-admin devs (default tab becomes `tools`); dev-only tools
  (Danger Zone → `clean-all-data`, Connection Help → `fix-db`, Dev Tools →
  `/auth/dev*`) still render since they use `authorizeDev` on the backend.
- Nav visibility is driven by `item.devOnly ? (is_dev || access_level <= 1) :
  access_level <= minLevel` in Layout.tsx — devs see the Developer nav via
  `is_dev`, admins via `access_level <= 1`.

### Reverse proxy (optional)

`proxy/` ships the Caddyfile (plain HTTP: gzip/zstd + WebSocket upgrade;
binds `:80` on every interface → `http://<any-LAN-IP>` / `http://workstation` /
`http://localhost` → `127.0.0.1:3002` — no IP editing even on DHCP change) with
Windows start/stop launchers. The Windows Caddy binary is **bundled**
(`proxy/caddy/caddy.exe`, committed) — Linux/macOS install via
`apt`/`dnf`/`brew`. The app runs plain HTTP on :3002 — no certificates
anywhere. For a public (non-LAN) deployment, put a TLS-terminating proxy in
front of port 3002 yourself.

### Offline installs (bundled runtime)

Node.js v24.19.0 installers ship in `tools/node/` (`node-v24.19.0-x64.msi`,
`node-v24.19.0.pkg`, `node-v24.19.0-linux-x64.tar.xz`) for machines without
internet — see README "Prerequisites".

### Android runtime version (do NOT bump to v24)

`android/app/build.gradle` downloads Node **v20.11.1** (linux-arm64 + linux-armv7l)
at build time. This is intentional: Node.js stopped shipping `linux-armv7l`
(32-bit ARM) builds after v20, and many budget Android tablets are armv7l.
Keep the gradle `nodeVersion` at a v20.x LTS that still publishes both ABIs —
v24.19.0 has only arm64, so a bump silently breaks 32-bit devices.

---

## 8. Work History (condensed)

| # | What | Where |
|---|------|-------|
| 1 | Dual-path adapter (SQLite kept, PG added) | `database/postgres.ts`, `database/schema.ts` |
| 2 | Every route handler async + `await` (white-screen fix) | `routes/*.ts`, `socket.ts`, `middleware/auth.ts` |
| 3 | `convertSyntax()` (datetime/date/time/julianday, OR IGNORE) | `database/postgres.ts` |
| 4 | DATE/TIME column types in PG schema | `database/schema.ts` |
| 5 | `unhandledRejection` → log-only | `src/index.ts` |
| 6 | Deployment files (render.yaml, .env.example, launchers, guides) | root, `ubuntu/`, `redhat/`, `mac/` |
| 7 | Task/story lifecycle fixes (auto-approve PUT+urgent, awaited editor pick → 22P02 fix, awaited collaborator tracking, FK child deletes, `prompting` in `tasks_status_check`) | `routes/tasks.ts`, `routes/stories.ts`, `schema.ts`, live Supabase ALTER |
| 8 | Database-state panel + fresh-start reset (preserve vs clean); zero system popups | `routes/settings.ts`, `utils/dbAdmin.ts`, `pages/Settings.tsx`, `pages/Developer.tsx` |
| 9 | Repo restructure & sanitized docs | root docs |
| 10 | Reverse-proxy package (Caddy, launchers) | `proxy/` |
| 11 | **Offline-first sync**: sql.js mirror, outbox, dual-write, 5 s health monitor, socket events, OfflineBanner + Settings sync card, sync API; fixed: sql.js init call, PG DDL in mirror schema, migration ordering, `INSERT OR REPLACE` bootstrap, missing `flush()` (stale mirror), replay picking `applied_pg=0`, post-reset re-bootstrap | `database/sync.ts`, `database/schema.ts`, `routes/sync.ts`, `routes/settings.ts`, `index.ts`, `components/OfflineBanner.tsx`, `pages/Settings.tsx` |
| 12 | **DB panels → Backups page with tabs** (Backups / Database); panels extracted to `components/DatabasePanels.tsx` | `pages/Backups.tsx`, `pages/Settings.tsx`, `components/DatabasePanels.tsx` |
| 13 | **Loading UX**: branded `SplashLoader` for boot/Suspense/full-page loads; `Skeleton.tsx` primitives + `PageSkeletons.tsx` | `components/SplashLoader.tsx`, `components/Skeleton.tsx`, `components/PageSkeletons.tsx`, `App.tsx`, `pages/*` |
| 14 | **Launchers restructured**: Start Server.bat hidden + auto browser open; Ubuntu/RHEL `start.sh` background + health check | `Start Server.bat`, `ubuntu/start.sh`, `redhat/start.sh` |
| 15 | README + MEMORY-CAPSULE restructure from scratch | `README.md`, `docs/MEMORY-CAPSULE.md` |
| 16 | **Developer login de-escalated**: dev token is staff level (3), not admin (1) | `middleware/auth.ts`, `routes/auth.ts`, `pages/Developer.tsx` |
| 17 | **Windows launcher crash fix**: `Join(WScript.Arguments)` fails on collections | `Start Server Hidden.vbs`, `Start Server.bat` |
| 18 | **Backups 403 fix**: admins couldn't open Backups page | `middleware/auth.ts`, `routes/backups.ts` |
| 19 | **Sync queue stuck fix**: outbox row failed FK, patched params_json | `backend/workstation.db`, `database/sync.ts` |
| 20 | Ads form options: `festival_special` + `agency` | `pages/Ads.tsx` |
| 21 | **Launcher overhaul**: auto-restart wrappers on all OS, Windows firewall self-heal, Caddy auto-start per OS | `start-server-core.ps1/.sh`, `mac/*`, `ubuntu/*`, `redhat/*` |
| 22 | **Bundled runtimes**: Node.js v24.19.0 installers + Windows caddy.exe | `tools/node/`, `proxy/caddy/caddy.exe` |
| 23 | **HTTPS live + LAN fixes** (later reverted) | various |
| 24 | **SHA-1 cert fix + one-click LAN setup** (later reverted) | various |
| 25 | **Fresh-clone .env fix**: backend/.env.example added | `backend/.env.example` |
| 26 | **One-click .env creation**: `Create .env.bat` | `Create .env.bat`, `Start Server.bat` |
| 27 | **All-OS zero-setup parity**: `create-env.sh` | `create-env.sh`, `mac/Start Server.command`, `ubuntu/start.sh`, `redhat/start.sh` |
| 28 | **HTTPS fully reverted → plain HTTP + repo cleanup** | `backend/src/index.ts`, `proxy/caddy/Caddyfile`, various |
| 29 | **Windows launchers → `windows/` folder** | `windows/*`, docs |
| 30 | **Windows zero-setup first run**: auto-installs dependencies | `windows/Start Server.bat` |
| 31 | **Repo cleanup & restructure**: deleted legacy duplicates, moved dev tools to `backend/scripts/` | root cleanup, `backend/scripts/*` |
| 32 | **Caddy fixed + load-time fixes**: binds `:80` on all interfaces, Cache-Control headers | `proxy/caddy/Caddyfile`, `backend/src/index.ts` |
| 33 | **Auto junk cleanup**: `windows/Clean Junk.bat` + `clean-junk.sh` | `windows/Clean Junk.bat`, `clean-junk.sh` |
| 34 | **Recycle Bin extended to Ads / Locations / Reporters** | `backend/src/database/schema.ts`, `backend/src/routes/*`, `frontend/src/pages/RecycleBin.tsx` |
| 35 | **Archive stock status + monthly update reminder** | `backend/src/database/schema.ts`, `backend/src/routes/archives.ts`, `frontend/src/pages/Archive.tsx` |
| 36 | **Archive folder scanner ("Import from Folder")** | `backend/src/routes/archives.ts`, `frontend/src/pages/Archive.tsx` |
| 37 | **Full audit 2026-08-11 — backend access-gating fixes** | `backend/src/routes/tasks.ts`, `backend/src/routes/activity.ts`, `backend/src/routes/auth.ts` |
| 38 | **Full audit 2026-08-11 — frontend fixes** | `frontend/src/components/NotificationBell.tsx`, `frontend/src/pages/Onboarding.tsx`, `frontend/src/pages/MobileApp.tsx` |
| 39 | **Full audit 2026-08-11 — sync engine fix**: engine-internal statements no longer replicate | `backend/src/database/sync.ts` |
| 40 | **Full audit 2026-08-11 — live data repair**: PG users↔profiles links | `backend/src/database/sync.ts`, `backend/src/routes/*` |
| 41 | **Research telemetry (B1+B2 + both preservation modes)** | `backend/src/routes/telemetry.ts`, `backend/src/database/schema.ts`, `frontend/src/lib/telemetry.ts` |
| 42 | **Firewall rule made permanent (Windows)** | `windows/Start Server.bat`, `windows/firewall-heal.bat` |
| 43 | **Self-healing launcher (Windows) — rebuilt from scratch** | `windows/start-server.ps1`, `windows/Repair Launcher.bat` |
| 44 | **Stop Server.bat cmd-quoting bug + wrapper self-match fix** | `windows/Stop Server.bat`, `windows/start-server.ps1` |
| 45 | **Docs/OS-setup sweep**: repo URL fixed, stale refs removed | `README.md`, `docs/*`, `frontend/vite.config.ts` |
| 46 | **Join-Path build-step bug (Windows launcher)** | `windows/start-server.ps1` |
| 47 | **Infinite reload loop after backup restore** | `frontend/src/components/OfflineBanner.tsx`, `backend/src/database/sync.ts`, `backend/src/routes/sync.ts` |
| 48 | **Backup import/export summary dialogs** | `backend/src/database/schema.ts`, `backend/src/routes/backups.ts`, `frontend/src/pages/Backups.tsx` |
| 49 | **Repo hygiene sweep**: data-sapshots/ gitignored, stale master branch deleted | `.gitignore`, docs |
| 50 | **Connect-flow: check data first, then ask Restore vs Fresh Start** | `backend/src/routes/settings.ts`, `frontend/src/context/DialogContext.tsx`, `frontend/src/components/DatabasePanels.tsx` |
| 51 | **Deep audit + bug-fix pass 2026-08-13**: clean-all-data, auth, tasks, V2 migration, stories, leaves, postgres numerics | `backend/src/routes/*`, `backend/src/database/*`, `frontend/src/pages/Developer.tsx` |
| 52 | **Second audit pass 2026-08-13**: tasks PUT whitelist, workload, landing kiosk, stories, ads, auth | `backend/src/routes/*`, `frontend/src/pages/Landing.tsx` |
| 53 | **Third audit pass 2026-08-14**: fresh-install migration bug, stories.vo_artist FK, socket guest login, notifications shadowing | `backend/src/database/schema.ts`, `backend/src/routes/*`, `backend/src/socket.ts` |
| 54 | **Live Supabase audit + sync-engine fixes + "Connected & Working" status 2026-08-14**: dev-user writes, read-after-queued-write blindness, PG row duplicates | `backend/src/database/sync.ts`, `backend/src/routes/*`, `frontend/src/components/Layout.tsx` |
| 55 | **First-admin protection + login_attempts CHECK bug 2026-08-14** | `backend/src/routes/users.ts`, `backend/src/database/schema.ts`, `frontend/src/pages/Users.tsx` |
| 56 | **UI/UX polish pass + LAN-wide socket-toast coverage 2026-08-14** | `frontend/src/index.css`, `frontend/src/components/Layout.tsx`, `frontend/src/components/ToastContext.tsx` |
| 57 | **OS setups restructured for parity 2026-08-14** | `mac/*`, `ubuntu/install.sh`, `redhat/install.sh`, `windows/start-server.ps1` |
| 58 | **LAN-wide toast coverage for every app change 2026-08-14** | `backend/src/socket.ts`, `backend/src/routes/*`, `frontend/src/components/Layout.tsx` |
| 59 | **Activity Toasts tab — LAN toast history 2026-08-14** | `backend/src/database/schema.ts`, `backend/src/routes/activity.ts`, `frontend/src/pages/Activity.tsx` |
| 60 | **Database connection rework 2026-08-15**: Restore/Fresh Start flow, dataLock, normalizeForMirror, local data never auto-wiped | `backend/src/database/sync.ts`, `backend/src/database/schema.ts`, `backend/src/routes/settings.ts`, `frontend/src/components/DatabasePanels.tsx` |
| 61 | **Developer.tsx combined login card 2026-08-15**: merged Dev Account + Saved Passwords into one card with sub-tabs | `frontend/src/pages/Developer.tsx` |
| 62 | **Backups page fixes 2026-08-15**: removed overflow-x-auto, moved Check Now button to bottom | `frontend/src/pages/Backups.tsx` |
| 63 | **Code review bug fixes 2026-08-15**: realignSequence SQL fix, formatTime→formatDuration rename, removed dead code + unused imports, removed unnecessary await | `backend/src/database/sync.ts`, `frontend/src/pages/Developer.tsx`, `backend/src/routes/settings.ts` |
| 64 | **Teleprompter access rework 2026-08-21**: menu entry only for admin/video-editor/anchor; signed-out users stay on landing (401 → `/`, never `/teleprompter*`); mobile-UA bypass for teleprompter routes | `frontend/src/components/Layout.tsx`, `frontend/src/utils/api.ts`, `frontend/src/App.tsx` |
| 65 | **Imaginary-style velocity controls 2026-08-21**: one signed speed axis (-10…+10), wheel/arrows/WASD, reverse past zero, signed readouts, middle-click reset | `frontend/src/pages/Teleprompter.tsx`, `frontend/src/pages/TeleprompterList.tsx` |
| 66 | **Prompter feel fixes 2026-08-21**: controls work while paused (auto-resume, no forced fullscreen), eased velocity + wheel accumulation, sub-pixel scroll fix (`posRef`) so speeds ≤ 2.0 move, button blur (focus-stuck bug) | `frontend/src/pages/Teleprompter.tsx` |
| 67 | **Boundary parking 2026-08-21**: bottom parks at -3.0 ◀ with cancellable end popup; top/R/Restart park at +3.0 ▶; close button always visible when not prompting (ref-gate bug fixed); subtle speed badge | `frontend/src/pages/Teleprompter.tsx` |
| 68 | **Custom teleprompter scripts 2026-08-21**: New Script form on the list page (paste & prompt instantly), device-local storage (`tp_custom_scripts`), open/delete saved scripts | `frontend/src/utils/tpCustom.ts`, `frontend/src/pages/TeleprompterList.tsx`, `frontend/src/pages/Teleprompter.tsx` |
| 69 | **Repo migration + infra fixes 2026-08-21**: repo moved to `kuldeep7ke/workstationmeva-setup`; fresh-clone 503 page when dist missing; dual-stack listen (`::`); LAN docs/scripts sweep (IP + hostname URLs); README/from-scratch/capsule rewritten | `.git/config`, `backend/src/index.ts`, `lan/*`, `docs/*`, `README.md` |
| 70 | **Test Script removed 2026-08-21** — the built-in `/teleprompter/demo` sample was dropped; Custom Scripts (New Script paste-and-prompt) fully replace it for trying/using the prompter without a task | `frontend/src/pages/Teleprompter.tsx`, `frontend/src/pages/TeleprompterList.tsx`, docs |
| 71 | **Windows setup guide 2026-08-21** — comprehensive `docs/SETUP-GUIDE-WINDOWS.md` covering Windows 10/11: one-click launcher, manual setup, Supabase config, LAN/firewall/Caddy, autostart, launcher internals, troubleshooting table | `docs/SETUP-GUIDE-WINDOWS.md`, `README.md` |
| 72 | **Windows .exe installer 2026-08-21** — NSIS single-file installer (`installer/workstation-meva-setup.nsi`, built via makensis 3.x) bundles pre-built app + portable Node.js + Caddy; installs to `C:\Workstation-Meva`, opens firewall port 3002, creates Start Menu/desktop shortcuts, registers in Add/Remove Programs, full uninstaller. Output `installer\workstation-meva-setup.exe` (~68 MB, git-ignored). `start-server-core.ps1` now auto-uses bundled `$root\node\node.exe` when present | `installer/workstation-meva-setup.nsi`, `windows/start-server-core.ps1`, `.gitignore`, `docs/SETUP-GUIDE-WINDOWS.md` |
| 73 | **Installer QA + shortcut fix 2026-08-21** — silent-install verified end-to-end: extraction, bundled Node v24.19.0 boots backend + SPA (health 200), uninstaller clean. **Bug found & fixed**: Start Menu/desktop shortcuts + finish-page RUN pointed to root `Start Server.bat`, but launchers install under `windows\` — all retargeted to `$INSTDIR\windows\Start Server.bat` / `Stop Server.bat`. Note: uninstaller deletes the shared firewall rule | `installer/workstation-meva-setup.nsi` |

---

## 9. Debugging Playbook

1. **White screen** → `/api/profiles/level3` & friends return `{}`; look for an
   unawaited `prepare()` in the newest route file.
2. **`42601 syntax error`** → `convertSyntax()` missed something; check for a
   stray `;` before `RETURNING id` or an unconverted SQLite function.
3. **`22P02` / `{}` value** → object/Promise passed where a scalar belongs
   (missing `await`).
4. **`operator does not exist`** → TEXT vs DATE comparison; fix schema types.
5. **Server dies after a query error** → someone re-added `process.exit` in
   `unhandledRejection`; remove it.
6. **Frontend build breaks after backend change** → build both; Settings/
   Developer pages compile last-known-good via `tsc -b`.
7. **New table/status not appearing** → `initDatabase()` only creates missing
   tables; constraints aren't altered on existing ones — ALTER live Supabase
   manually.
8. **`SQL.Database is not a constructor` at boot** → `ensureSqlJs()` must
   **call** `initSqlJs()` (`return initSqlJs()`), not return the function.
9. **`near "(": syntax error` in mirror `createTables`** → PG DDL leaked into
   the SQLite schema (`SERIAL`, `TIMESTAMPTZ`, `DEFAULT NOW()`).
10. **`Sync engine not initialized` during boot** → a dual-path `prepare()`
    inside `runMigrations()`/before `initSyncEngine`; use mirror-direct
    `Statement`/`db.run`.
11. **Mirror missing newer tables at bootstrap / stale data resurrects after
    restart** → migrations must run before bootstrap; bulk ops must `flush()`
    after `setPersist(true)`.
12. **Queued changes never sync** → replay must select `applied_pg = 0`
    regardless of the mirror flag.
13. **Mirror out of sync after reset** → `resetMirrorAndQueue()` resets
    `bootstrapped`; steady-online health checks re-bootstrap (within 5 s).
14. **Browser doesn't open on windows\Start Server.bat** → the launcher
    (visible/open modes) polls up to 60 s for `:3002`; check the server booted
    (health endpoint) and that the mode is `visible`/`open` (autostart = hidden
    never opens a browser by design). `windows/Repair Launcher.bat` restores
    broken launcher files; `server.log` has `[launcher]`/`[core]` lines.
15. **Backups page shows no Database tab** → `isAdmin` false
    (`access_level <= 1` required); panels are admin-only by design.
16. **`'ForEach-Object' is not recognized` from a .bat** → an inner `"` inside
    `powershell -Command "…"` toggled cmd's quote state; rewrite with no inner
    double quotes (single quotes only; `''` = literal quote in WQL/PS).
17. **`Stop Server.bat` leaves the server running** → it killed itself (its own
    command line matched the wrapper LIKE pattern); the match must require the
    `-File` argument (`-match '-File\s+.*start-server-core\.ps1'`).
18. **Two wrappers / phantom wrappers seen in checks** → the check command
    matched its own command line (the search string is in it); count only
    processes whose command line has `-File "…start-server-core.ps1"`.

---

## 10. Quick Reference (build a similar PG backend)

1. Create a Supabase project → pooler connection string (port 6543).
2. `import 'dotenv/config'` first in `index.ts`; `DATABASE_URL` gates PG mode.
3. `prepare()` returns a statement wrapper (async on PG, sync on SQLite); `run()`
   returns `{lastInsertRowid, changes}` and appends `RETURNING id`.
4. Make every DB-touching handler `async` + `await` everything.
5. Fire-and-forget: `const r = prepare(...).run(...); if (r?.catch) r.catch(()=>{})`.
6. Extend `convertSyntax()` for every SQLite function your SQL uses.
7. Use proper `DATE`/`TIME`/`TIMESTAMPTZ` types, never TEXT-for-dates.
8. `unhandledRejection` log-only; error middleware logs `where`/`detail`.
9. Seed defaults via one exported function; call after init **and** after any
   destructive reset.
10. First signup becomes admin; keep `.env`, `saved-connections.json`,
    `workstation.db`, logs out of git.
11. For offline resilience: local mirror + outbox queue + health monitor +
    auto-replay (see §4.1) — apply mirror writes first, queue everything,
    replay `applied_pg = 0`, and always flush after disabling persist.
12. For a desktop-style deployment: ship one-click launchers that start the
    server hidden (VBS/nohup/nohup+&) and open the browser only after a
    health-poll succeeds; keep autostart browser-free. On Windows, prefer a
    single self-healing PowerShell launcher that repairs its own .bat/.vbs
    files — the cmd parser is fragile (`"` toggling, parens in `if (...)`
    blocks, `\"` meaning nothing).

| 74 | **Beta / public-domain / clean-installer release 2026-08-28** - app marked pre-release beta `v1.0.0-beta.1` (testing mode) and moved to **public domain (Unlicense)**: new `frontend/src/utils/appMeta.ts` (APP_VERSION/APP_STATUS/TESTING_MODE/APP_LICENSE); Beta+Testing badges on Landing/Login/SignUp/Layout; About/Terms/Privacy/FAQ rewritten for free/public-domain/beta; root `LICENSE` (Unlicense); package.json versions bumped; NSIS welcome text + version keys updated and File `/r` gains explicit `/x` excludes for `*.db`, `*.sqlite*`, `.env`, `*.log`, `backups`, `telemetry`, `saved-connections.json` - installer can never ship user data (fresh install, new users only) | `frontend/src/utils/appMeta.ts`, frontend pages, `LICENSE`, `installer/workstation-meva-setup.nsi`, `README.md`, `docs/SETUP-GUIDE-WINDOWS.md` |

| 75 | **Control Panel (native Windows) 2026-08-28** - new launch pad `windows/Control Panel.bat` -> `Control Panel.ps1` (WPF, STA, ASCII-safe): live cards for Server (start/stop/health/PID/uptime), Autostart-at-login On/Off (same Startup shortcut as Install Autostart.bat), Caddy proxy status/toggle (also kills the caddy-watchdog), Database status via backend\.env DATABASE_URL with paste/Save + live ping through `windows/db-probe.js` (node + pg, NODE_PATH=backend\node_modules, bundled node preferred), LAN URLs with copy buttons, and Tools (repair launcher, heal firewall elevated, clean junk silent, view server.log, open backend folder). Reads/writes the SAME state files as the .bat launchers. Installer: finish page now opens the Control Panel (DB setup first), Start Menu + desktop get a Control Panel shortcut, db-probe.js + panel files bundled; VIProductVersion bumped to 1.0.0.2 | `windows/Control Panel.bat`, `windows/Control Panel.ps1`, `windows/db-probe.js`, `installer/workstation-meva-setup.nsi`, `docs/SETUP-GUIDE-WINDOWS.md`, `README.md` |

| 76 | **Installer start fix - "Caddy runs but server never starts" 2026-08-28** - root cause: packaged layout lacks frontend\node_modules, so start-server.ps1 ran `npm ci` on every Start (offline / npm not on PATH) and bailed via Fail before launching the wrapper - caddy (started earlier) kept running. Fix: installer now writes an `app.installed` marker at $INSTDIR; start-server.ps1 detects it, skips dependency install + builds entirely (verifies pre-built dist + backend\node_modules instead), and also puts the bundled portable node on PATH at the top (moved after the Write-Log function to fix the used-before-defined error). Verified end-to-end on a silent-installed copy: packaged-layout messages in server.log, health 200, SPA served, panel smoke PANEL-OK, uninstall clean | `windows/start-server.ps1`, `installer/workstation-meva-setup.nsi`, `docs/SETUP-GUIDE-WINDOWS.md` |
