# Research Report — Baseline Snapshot (2026-08-11)

> Purpose: first saved look at how Workstation Meva is actually being used.
> This is the **baseline** — from this date, the app automatically collects
> usage, workflow and glitch data (see "How it is collected" below), so future
> reports can compare against this snapshot and drive simplifications.

## How it is collected (new, automatic)

| What | Where | Kept for | Access |
|------|-------|----------|--------|
| Every API request (method, URL, status, latency, user, role) | server `telemetry/requests-*.ndjson` | 30 days, auto-pruned | server filesystem |
| Client-side errors / glitches (page, error, stack, user) | `telemetry_errors` table (local mirror + Supabase) | 90 days, auto-pruned | Backups → Research Data |
| Every work action (who did what) | `activity_logs` (existing) | forever | Backups → Research Data |
| Task workflow state changes | `task_audit_log` (existing) | forever | Backups → Research Data |
| Sync engine health | `sync_log` (existing) | forever | Backups → Research Data |

Download anytime: **Backups page → Research Data** — Full report (JSON) or
Activity / Task workflow / App errors (CSV). Covers the last 90 days.

## Baseline numbers (2026-08-11)

| Area | Count |
|------|-------|
| Registered users (profiles) | 12 real staff + 3 test accounts |
| Tasks | 1 (draft) |
| Stories | 0 |
| Bulletins | 1 |
| Programs | 1 |
| Ads | 2 |
| Archives | 1 |
| Locations | 3 |
| Reporters | 2 |
| Leaves | 1 |
| Activity log entries (all time) | 34 |
| Task workflow audit entries | 0 |
| Client-side errors captured (first day) | 2 (test) |

## Findings at baseline

1. **The app is installed but barely used in the last 30 days.** 12 staff
   accounts exist, but only 1 task, 0 stories, 1 bulletin. Either the team is
   not yet working through the app, or work flows bypass it. This is the single
   biggest question the new telemetry will answer (which screens people open,
   which they abandon, where work gets stuck).
2. **Test accounts are still in the production database**: `testuser`,
   `test2` (Test User / Test Two) and `junk1049792451` (no profile link).
   Recommendation: remove them so usage research is clean.
3. **Sync churn on 2026-08-11 (400 log entries)** — mostly replay attempts
   during today's queue-fix work. Expected to settle; watch `Backups →
   Database → Sync Status` (queuePending should be 0).
4. **Workflow audit is empty** because no task ever moved through stages. Once
   tasks flow, `task_audit_log` will show the real newsroom path and rework
   loops (e.g. how many `correction_required` cycles per task).

## What to improve next (when ~2–4 weeks of telemetry exist)

1. **Simplicity** — drop or auto-hide features nobody opens (usage heat).
2. **Time-saving** — shorten the most-used paths (defaults, one-click actions);
   spot rework loops in the workflow (the correction cycle is usually the
   biggest time loss in newsrooms).
3. **Flexibility** — adjust statuses/fields to the path the team actually uses.
4. **Data relevance** — make dashboards per-role from real usage.

## How to take the next snapshot

1. Open the app → **Backups → Research Data → Full report (JSON)**.
2. Keep the file (e.g. `research-YYYY-MM-DD.json`).
3. Compare counts and screens against this baseline.
