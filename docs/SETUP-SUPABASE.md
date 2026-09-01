# Supabase Setup Guide (Workstation Meva)

This app stores everything in **your own** Supabase PostgreSQL database. The
server creates all tables automatically on first start. Total time: ~5 minutes.

## Step 1: Create a Supabase account & project

1. Go to https://supabase.com → **Start your project** → sign up with GitHub or email
2. Click **New project**
3. **Organization**: pick yours or create one (free)
4. **Project name**: anything, e.g. `workstation-meva`
5. **Database password**: generate a strong one — **save it now** (shown once)
6. **Region**: choose the closest to your users (e.g. Mumbai, Singapore, Tokyo)
7. **Create new project** and wait ~2 minutes

## Step 2: Copy the connection string

1. Open your project → click **Connect** (top bar) → **Connection string** → **URI** tab
2. Copy the full URI, which looks like:

```
postgresql://postgres.<PROJECT-REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres
```

3. Replace `<PASSWORD>` with the database password from Step 1

> **Use the pooler port `6543`, not `5432`** — the direct port may be IPv6-only
> and fails from many servers.
>
> If the password contains special characters (`&`, `%`, `@`, `#`), URL-encode
> them (`&` → `%26`, `%` → `%25`, `@` → `%40`).

## Step 3: Configure `backend/.env`

Create `backend/.env`:

```
DATABASE_URL=postgresql://postgres.<PROJECT-REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres
JWT_SECRET=<any long random string>
PORT=3002
NODE_ENV=production
```

> `.env` is git-ignored — never commit it. Example: `.env.example`.

## Step 4: Start the server

**Windows:** double-click `windows\Start Server.bat` (first run builds automatically).

**Manual:**
```bash
cd backend
npm install
npm run build
node dist/index.js
```

On first start the log shows `[db] PostgreSQL schema initialized` — all tables
are created, default bulletins/channel settings are seeded.

## Step 5: Verify

1. Visit `http://localhost:3002/api/health` → `{"status":"ok",...}`
2. Open the app → **Sign Up** → the **first account becomes the admin**
3. Check **Backups → Database tab → Database Data** → it should show an empty, fresh database

> Note: the built-in developer login (`dev-admin`, see the Developer page) is a
> restricted staff-level fallback for broken-database emergencies — it is NOT an
> admin account and cannot manage users or the database.

## Step 6 (optional): Deploy to Render

1. Push this repo to GitHub
2. https://render.com → **New → Web Service** → connect the repo
3. Build: `cd backend && npm install && npm run build`
4. Start: `cd backend && node dist/index.js`
5. Env vars: `DATABASE_URL`, `JWT_SECRET` (plus `PORT=3002`)
6. Create the service, wait for first deploy (~3-5 min)

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Connection refused` | Check `DATABASE_URL` for typos; free-tier connection limits — retry in seconds |
| Tables not created | Look at the server log; `[db]` line must appear without errors |
| `ENOTFOUND ... pooler.supabase.com` | Region is wrong in the URL — copy exactly from Supabase Connect |
| CORS errors | Add your frontend origin under Supabase → Settings → API → CORS |
| Wrong password errors | Reset password in Supabase → Settings → Database → Reset database password |
