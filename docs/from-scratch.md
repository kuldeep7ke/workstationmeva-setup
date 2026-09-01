# WorkStation Online — From Scratch: Complete App Creation Guide

> This document is a complete blueprint for building WorkStation Online (or a
> similar newsroom management suite) from an idea to a fully working app. It
> covers every decision, structure, type, workflow, and pattern needed — written
> so a developer can follow it start-to-finish.

---

## Table of Contents

1. [Concept & Requirements](#1-concept--requirements)
2. [Architecture Decisions](#2-architecture-decisions)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Database Schema (30 tables)](#5-database-schema-30-tables)
6. [Backend Architecture](#6-backend-architecture)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Real-Time System (Socket.IO)](#8-real-time-system-socketio)
9. [Offline-First Sync Engine](#9-offline-first-sync-engine)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Core Workflows](#11-core-workflows)
12. [API Design Patterns](#12-api-design-patterns)
13. [UI/UX Patterns](#13-uiux-patterns)
14. [Deployment & Launchers](#14-deployment--launchers)
15. [Testing & Verification](#15-testing--verification)

---

## 1. Concept & Requirements

### What This App Is

A **newsroom office suite** — a single web app that handles the entire news
production lifecycle: from assigning a story idea to publishing it on air.
Built for Marathi TV newsrooms but applicable to any broadcast news operation.

### Core User Roles

| Role | Access Level | Description |
|------|-------------|-------------|
| Admin | 1 | Full control: users, settings, database, all content |
| Level 2 | 2 | Senior editorial: can manage tasks, approve, manage users |
| Level 3 | 3 | Staff: can create/edit own tasks, limited management |
| Viewer | 4 | Read-only access |

### Core Requirements

1. **17-stage task workflow** — draft → script → footage → approved → editing →
   published → completed (with admin overrides)
2. **Stories pipeline** — data gathering → confirmation → send-to-tasks
3. **Bulletins** — hourly news bulletins with slot management
4. **Offline-first** — full read/write during internet outages, auto-sync on reconnect
5. **Real-time** — multi-device updates via WebSocket (Socket.IO)
6. **Self-hosted** — runs on LAN, no cloud dependency beyond the database
7. **Multi-OS** — Windows, macOS, Linux, Android
8. **No browser popups** — all dialogs are in-app

---

## 2. Architecture Decisions

### Why These Choices

| Decision | Choice | Why |
|----------|--------|-----|
| Database | PostgreSQL (Supabase) + SQLite mirror | PG for production, SQLite for offline resilience |
| Sync strategy | Outbox pattern with dual-write | Write locally first (fast, works offline), replicate to PG asynchronously |
| Backend | Express + TypeScript | Fast to build, good ecosystem, type safety |
| Frontend | React + Vite | Fast builds, component model, large ecosystem |
| Real-time | Socket.IO | Reliable WebSocket with fallbacks, room/broadcast support |
| Auth | JWT + bcrypt | Stateless, simple, works offline too |
| Deployment | Single Node process + static SPA | Simple to deploy, no build pipeline needed at runtime |

### Key Architectural Patterns

```
┌─────────────────────────────────────────────────┐
│                   BROWSER                       │
│  React SPA + Socket.IO client + localStorage    │
└──────────────────┬──────────────────────────────┘
                   │ HTTP + WebSocket
┌──────────────────▼──────────────────────────────┐
│              EXPRESS SERVER                      │
│  Routes → Middleware → Sync Engine → Database    │
│                                                  │
│  ┌─────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Auth    │  │ Socket.IO│  │ Sync Engine   │  │
│  │ (JWT)   │  │ Events   │  │ (outbox+ping) │  │
│  └────┬────┘  └────┬─────┘  └───────┬───────┘  │
│       │            │                │            │
│  ┌────▼────────────▼────────────────▼───────┐   │
│  │          Database Adapter Layer           │   │
│  │  prepare() → SyncStatement                │   │
│  │  .run() → mirror + outbox + PG            │   │
│  │  .get()/.all() → PG → mirror fallback     │   │
│  └────────────┬──────────────┬──────────────┘   │
│               │              │                   │
│  ┌────────────▼──┐  ┌───────▼───────────┐      │
│  │ SQLite Mirror │  │ Supabase PostgreSQL│      │
│  │ (sql.js)      │  │ (pg, pooler:6543) │      │
│  └───────────────┘  └──────────────────┘      │
└─────────────────────────────────────────────────┘
```

---

## 3. Tech Stack

### Backend

| Package | Purpose | Why |
|---------|---------|-----|
| `express` | HTTP server | Simple, well-known |
| `typescript` | Type safety | Catches bugs at compile time |
| `socket.io` | Real-time WebSocket | Reliable with fallbacks |
| `jsonwebtoken` | JWT tokens | Stateless auth |
| `bcryptjs` | Password hashing | Pure JS, no native deps |
| `pg` | PostgreSQL client | Direct, no ORM overhead |
| `sql.js` | SQLite in-memory | Works in Node without native bindings |
| `dotenv` | Env config | Standard practice |
| `cors` | CORS headers | Needed for dev (Vite proxy) |

### Frontend

| Package | Purpose | Why |
|---------|---------|-----|
| `react` + `react-dom` | UI framework | Component model, large ecosystem |
| `vite` | Build tool | Fast HMR, fast builds |
| `axios` | HTTP client | Interceptors, promise-based |
| `socket.io-client` | WebSocket client | Pairs with backend Socket.IO |
| `react-router-dom` | Routing | Standard React routing |

### Dev Tools

| Tool | Purpose |
|------|---------|
| `tsx` | TypeScript execution (dev mode) |
| `tsc` | TypeScript compiler |
| `@types/*` | Type definitions |
| `concurrently` | Run backend + frontend together |

---

## 4. Project Structure

```
workstation-online/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Entry point: init DB, start server
│   │   ├── config/
│   │   │   ├── roles.ts          # Role definitions, access levels
│   │   │   └── devCredentials.ts # Dev login (file-based)
│   │   ├── database/
│   │   │   ├── schema.ts         # PG + SQLite table definitions, migrations
│   │   │   ├── postgres.ts       # PG adapter, SQL translation
│   │   │   └── sync.ts           # Offline sync engine (outbox, dual-write)
│   │   ├── middleware/
│   │   │   ├── auth.ts           # JWT verify, role gates, token generation
│   │   │   └── rateLimit.ts      # IP-based rate limiting
│   │   ├── routes/
│   │   │   ├── auth.ts           # Login, signup, approve/reject
│   │   │   ├── tasks.ts          # Task CRUD, workflow, teleprompter
│   │   │   ├── stories.ts        # Story pipeline, confirm, send-to-tasks
│   │   │   ├── bulletins.ts      # Bulletin CRUD
│   │   │   ├── bulletinTemplates.ts # Slot management
│   │   │   ├── users.ts          # User/seat/profile management
│   │   │   ├── profiles.ts       # PIN management
│   │   │   ├── ads.ts            # Ad CRUD, recycle bin
│   │   │   ├── programs.ts       # Special programs, recycle bin
│   │   │   ├── archives.ts       # Archive stock, folder import
│   │   │   ├── locations.ts      # Location CRUD, recycle bin
│   │   │   ├── reporters.ts      # Reporter CRUD, stats
│   │   │   ├── leaves.ts         # Leave requests, approve/reject
│   │   │   ├── notifications.ts  # In-app notifications
│   │   │   ├── analytics.ts      # Dashboard stats
│   │   │   ├── activity.ts       # Activity logs, toast history
│   │   │   ├── settings.ts       # Database connection management
│   │   │   ├── backups.ts        # Backup/restore
│   │   │   ├── sync.ts           # Sync status, replay
│   │   │   ├── developer.ts      # Dev tools (clean-all-data)
│   │   │   ├── telemetry.ts      # Error capture, research export
│   │   │   ├── channelMetadata.ts # Channel branding
│   │   │   ├── news.ts           # Task news items
│   │   │   ├── pendingRequests.ts # Pending approvals summary
│   │   │   └── roles.ts          # Role definitions endpoint
│   │   ├── utils/
│   │   │   ├── username.ts       # Username generation
│   │   │   ├── pin.ts            # PIN hashing/verification
│   │   │   ├── dbAdmin.ts        # DB admin helpers
│   │   │   ├── savedConnections.ts # Saved DB connections
│   │   │   └── asyncErrors.ts    # Error handling
│   │   └── socket.ts             # Socket.IO setup, event handlers
│   ├── scripts/                  # Dev tools (reset-db, etc.)
│   ├── workstation.db            # SQLite mirror (git-ignored)
│   ├── saved-connections.json    # Saved DB links (git-ignored)
│   └── .env                      # Secrets (git-ignored)
├── frontend/
│   ├── src/
│   │   ├── main.tsx              # Entry point
│   │   ├── App.tsx               # Router, auth, Suspense
│   │   ├── context/
│   │   │   ├── AuthContext.tsx    # Login state, token, user
│   │   │   ├── ToastContext.tsx   # Toast notifications
│   │   │   └── DialogContext.tsx  # Modal dialogs
│   │   ├── components/
│   │   │   ├── Layout.tsx        # Sidebar, header, bottom nav
│   │   │   ├── DatabasePanels.tsx # DB connection/status panels
│   │   │   ├── SplashLoader.tsx  # Boot splash screen
│   │   │   ├── Skeleton.tsx      # Loading skeleton primitives
│   │   │   ├── PageSkeletons.tsx # Page-level skeletons
│   │   │   ├── OfflineBanner.tsx # Offline mode banner
│   │   │   ├── NotificationBell.tsx # Notification icon
│   │   │   ├── AnimatedLogo.tsx  # Animated logo
│   │   │   ├── PasswordInput.tsx # Password with show/hide
│   │   │   ├── LeavesTab.tsx     # Leaves in profile view
│   │   │   └── YouTubeEmbed.tsx  # YouTube embed
│   │   ├── pages/                # 31 pages (see §4.1)
│   │   ├── utils/
│   │   │   ├── api.ts            # Axios instance, auth interceptor
│   │   │   ├── dates.ts          # Timezone-safe date formatting
│   │   │   ├── roles.ts          # Role helpers, priority labels
│   │   │   ├── quickLogin.ts     # Saved login management
│   │   │   └── appConfig.ts      # App name, channel name
│   │   └── lib/
│   │       └── telemetry.ts      # Client error capture
│   └── index.html
├── android/                      # Android wrapper
├── windows/                      # Windows launchers
├── mac/                          # macOS launchers
├── ubuntu/                       # Ubuntu/Debian installer + scripts
├── redhat/                       # RHEL installer + scripts
├── lan/                          # LAN hostname helpers
├── proxy/                        # Caddy reverse proxy
├── tools/node/                   # Bundled Node.js installers
├── docs/                         # Guides + this file
├── render.yaml                   # Render.com config
└── create-env.sh                 # .env creator (Mac/Linux)
```

### §4.1 Frontend Pages

| Page | Purpose |
|------|---------|
| `Landing.tsx` | Kiosk-style login selection (PIN quick-login, password, signup) |
| `Login.tsx` | Username/password login form |
| `SignUp.tsx` | New user registration |
| `Dashboard.tsx` | Main dashboard with stats, reminders, quick actions |
| `Tasks.tsx` | Task list with filters, kanban view |
| `TaskDetail.tsx` | Single task edit with 17-status workflow |
| `Stories.tsx` | Story pipeline (7 types, 9 stages) |
| `Bulletins.tsx` | Bulletin management with slot picker |
| `Programs.tsx` | Special programs (live, interview, event) |
| `Ads.tsx` | Advertisement bookings |
| `Archive.tsx` | Archive footage/stock library |
| `Locations.tsx` | Geographic locations directory |
| `Reporters.tsx` | Reporter directory with stats |
| `Users.tsx` | User/seat/profile management (admin) |
| `Leaves.tsx` | Leave request management |
| `Activity.tsx` | Activity logs + toast history (5 tabs) |
| `Analytics.tsx` | Dashboard statistics/charts |
| `Published.tsx` | Published/completed tasks |
| `RecycleBin.tsx` | Trashed items (tasks, programs, ads, locations, reporters) |
| `PinManagement.tsx` | Admin PIN management |
| `Backups.tsx` | Database backups + connection management (2 tabs) |
| `Settings.tsx` | App settings, appearance, export/import |
| `Developer.tsx` | Dev tools, diagnostics, saved passwords |
| `Profile.tsx` | User profile, PIN, settings |
| `NewsArticles.tsx` | Individual news items within tasks |
| `Teleprompter.tsx` | Teleprompter display (studio screen) |
| `TeleprompterList.tsx` | Teleprompter script list |
| `Onboarding.tsx` | New user onboarding |
| `About.tsx` | About page |
| `Contact.tsx` | Contact page |
| `FAQ.tsx` | FAQ page |
| `NotFound.tsx` | 404 page |

---

## 5. Database Schema (30 tables)

### Design Principles

1. **PG for production, SQLite for offline** — same schema, different SQL dialects
2. **Mirror every write** — every PG write also goes to SQLite
3. **No foreign keys in SQLite** — SQLite has limited FK support; enforce in code
4. **TIMESTAMPTZ for dates** — never use TEXT for dates in PG
5. **SERIAL for IDs** — auto-increment primary keys
6. **Soft delete** — `deleted_at` column for recycle bin (tasks, programs, ads, locations, reporters)

### Table Definitions

#### Users & Auth

```sql
-- users: Login accounts
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- profiles: User profiles (1:1 with users)
CREATE TABLE profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  access_level INTEGER NOT NULL,  -- 1=admin, 2=senior, 3=staff, 4=viewer
  status TEXT DEFAULT 'active',   -- active/inactive/archived
  pin_hash TEXT,                   -- optional PIN for quick login
  pin_enabled BOOLEAN DEFAULT FALSE,
  shift_start TIME,
  shift_end TIME,
  is_active BOOLEAN DEFAULT TRUE,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- login_attempts: Login audit trail
CREATE TABLE login_attempts (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER,
  action TEXT CHECK (action IN (
    'success', 'failed_password', 'failed_pin', 'failed_approval',
    'failed_status', 'failed_pin_reset', 'pin_reset'
  )),
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### News Production

```sql
-- tasks: Core task management (17-status workflow)
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'script_writing', 'footage_collection',
      'waiting_confirmation', 'correction_required',
      'approved', 'editor_assigned', 'teleprompter_ready',
      'prompting', 'recording_done', 'editing', 'uploading',
      'published', 'under_review', 'completed',
      'cancelled', 'trashed'
    )),
  priority TEXT DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  task_type TEXT DEFAULT 'general_news',
  assigned_to INTEGER REFERENCES profiles(id),
  video_editor_id INTEGER REFERENCES profiles(id),
  deadline TIMESTAMPTZ,
  created_by INTEGER REFERENCES profiles(id),
  -- Script fields (preserved on PUT to avoid data loss)
  headline TEXT, slug TEXT, main_story TEXT, closing TEXT,
  visual_cues TEXT, pronunciation_notes TEXT, source_reference TEXT,
  duration INTEGER,
  -- Social media fields
  facebook_link TEXT, instagram_link TEXT, website_link TEXT,
  -- Reporter/camera fields
  reporter_name TEXT, camera_operator TEXT, mobile_journalist TEXT,
  photographer TEXT, drone_operator TEXT,
  -- Graphics
  logos_link TEXT, graphics_link TEXT, footage_link TEXT,
  -- Metadata
  bulletin_date DATE,
  location_id INTEGER REFERENCES locations(id),
  archive_id INTEGER REFERENCES archives(id),
  reporter_id INTEGER REFERENCES reporters(id),
  uid TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- anchor_tasks: Anchor subtask data
CREATE TABLE anchor_tasks (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id),
  script TEXT,
  teleprompter_ready BOOLEAN DEFAULT FALSE,
  recording_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- video_editor_tasks: Editor subtask data
CREATE TABLE video_editor_tasks (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id),
  edited_video_url TEXT,
  thumbnail_url TEXT,
  tone_rating INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- task_news_items: Individual news items in a bulletin task
CREATE TABLE task_news_items (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id),
  headline TEXT,
  content TEXT,
  anchor_name TEXT,
  reporter_name TEXT,
  footage_available BOOLEAN DEFAULT FALSE,
  correction_notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- task_extensions: Deadline extensions
CREATE TABLE task_extensions (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id),
  new_deadline TIMESTAMPTZ NOT NULL,
  reason TEXT,
  requested_by INTEGER REFERENCES profiles(id),
  approved_by INTEGER REFERENCES profiles(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- task_collaborators: Task collaborator tracking
CREATE TABLE task_collaborators (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id),
  profile_id INTEGER REFERENCES profiles(id),
  role TEXT DEFAULT 'collaborator',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- task_audit_log: Task status transition audit trail
CREATE TABLE task_audit_log (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id),
  from_status TEXT,
  to_status TEXT,
  changed_by INTEGER REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Stories

```sql
-- stories: Story/feature pipeline
CREATE TABLE stories (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  story_type TEXT DEFAULT 'feature'
    CHECK (story_type IN (
      'feature', 'investigation', 'series', 'documentary',
      'interview', 'opinion', 'other'
    )),
  status TEXT DEFAULT 'data_gathering'
    CHECK (status IN (
      'data_gathering', 'script_writing', 'plotting',
      'add_ons', 'confirmation', 'approved',
      'sent_to_tasks', 'completed', 'archived'
    )),
  vo_artist TEXT,  -- FK to profiles (repaired at boot if needed)
  task_id INTEGER,  -- production task after send-to-tasks
  created_by INTEGER REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- story_activities: Story-level activity log
CREATE TABLE story_activities (
  id SERIAL PRIMARY KEY,
  story_id INTEGER REFERENCES stories(id),
  action TEXT,
  details TEXT,
  performed_by INTEGER REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Bulletins

```sql
-- bulletin_templates: Named time slots (10 defaults)
CREATE TABLE bulletin_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  publish_time TIME NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- bulletins: Bulletin content
CREATE TABLE bulletins (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  bulletin_type TEXT DEFAULT 'general'
    CHECK (bulletin_type IN (
      'breaking', 'special_report', 'ground_report', 'general'
    )),
  template_id INTEGER REFERENCES bulletin_templates(id),
  status TEXT DEFAULT 'draft',
  created_by INTEGER REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- user_bulletin_defaults: Per-user saved slot layouts
CREATE TABLE user_bulletin_defaults (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER REFERENCES profiles(id),
  template_id INTEGER REFERENCES bulletin_templates(id),
  is_enabled BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- system_bulletin_defaults: System-wide default layouts
CREATE TABLE system_bulletin_defaults (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES bulletin_templates(id),
  is_enabled BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Content Management

```sql
-- ads: Advertisement bookings
CREATE TABLE ads (
  id SERIAL PRIMARY KEY,
  client_name TEXT NOT NULL,
  ad_title TEXT NOT NULL,
  category TEXT DEFAULT 'regular',
  client_type TEXT DEFAULT 'direct',
  rate NUMERIC DEFAULT 0,
  start_date DATE,
  end_date DATE,
  slots_per_day INTEGER DEFAULT 1,
  total_slots INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  renewal_count INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- special_programs: Live coverage, interviews, events
CREATE TABLE special_programs (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  program_type TEXT DEFAULT 'special_program'
    CHECK (program_type IN (
      'live_coverage', 'special_program', 'interview', 'event'
    )),
  description TEXT,
  scheduled_date DATE,
  scheduled_time TIME,
  duration_minutes INTEGER,
  status TEXT DEFAULT 'scheduled',
  created_by INTEGER REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- archives: Archive footage/stock library
CREATE TABLE archives (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'footage',
  location TEXT,
  rel_path TEXT,
  file_size INTEGER,
  status TEXT DEFAULT 'online'
    CHECK (status IN ('online', 'offline')),
  availability TEXT DEFAULT 'available'
    CHECK (availability IN ('available', 'not_available')),
  stock_updated_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- locations: Geographic locations
CREATE TABLE locations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  region TEXT,
  created_by INTEGER REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- reporters: Reporter directory
CREATE TABLE reporters (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  location TEXT,
  specialization TEXT,
  status TEXT DEFAULT 'active',
  created_by INTEGER REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
```

#### Leave Management

```sql
-- leaves: Leave requests
CREATE TABLE leaves (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER REFERENCES profiles(id),
  reason TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  arrangement TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approved_by INTEGER REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### System Tables

```sql
-- activity_logs: Global audit trail
CREATE TABLE activity_logs (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER,
  profile_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- notifications: In-app notifications
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER REFERENCES profiles(id),
  title TEXT NOT NULL,
  message TEXT,
  type TEXT DEFAULT 'info',
  entity_type TEXT,
  entity_id INTEGER,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- channel_metadata: Channel branding
CREATE TABLE channel_metadata (
  id SERIAL PRIMARY KEY,
  name TEXT,
  display_name TEXT,
  website TEXT,
  editor_name TEXT,
  subscribe_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- backups: Backup file registry
CREATE TABLE backups (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  label TEXT,
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- backup_config: Backup settings
CREATE TABLE backup_config (
  id SERIAL PRIMARY KEY,
  auto_enabled BOOLEAN DEFAULT FALSE,
  interval_hours INTEGER DEFAULT 24,
  last_backup_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- user_activity: User-specific activity
CREATE TABLE user_activity (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER,
  action TEXT,
  entity_type TEXT,
  entity_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- system_activity: System-level activity
CREATE TABLE system_activity (
  id SERIAL PRIMARY KEY,
  action TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- telemetry_errors: Client-side error capture
CREATE TABLE telemetry_errors (
  id SERIAL PRIMARY KEY,
  page TEXT,
  message TEXT,
  stack TEXT,
  user_agent TEXT,
  profile_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### SQLite Mirror-Only Tables (not in PG)

```sql
-- toast_logs: LAN broadcast history
CREATE TABLE toast_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  payload TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- sync_log: Sync queue log
CREATE TABLE sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER,
  action TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- sync_outbox: Pending sync entries
CREATE TABLE sync_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  params_json TEXT,
  sql_text TEXT,
  applied_mirror INTEGER DEFAULT 0,
  applied_pg INTEGER DEFAULT 0,
  pg_error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- scheduled_notifications: Queued notifications
CREATE TABLE scheduled_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER,
  title TEXT,
  message TEXT,
  type TEXT,
  entity_type TEXT,
  entity_id INTEGER,
  send_at TEXT,
  sent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## 6. Backend Architecture

### Entry Point (`backend/src/index.ts`)

```typescript
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { initDatabase, mirrorReady } from './database/schema';

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize database (PG + SQLite mirror)
await initDatabase();

// Mount all routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
// ... 20+ more route mounts

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Start server
const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
});
```

### Database Adapter Layer

The key innovation is the `prepare()` function that returns a `SyncStatement`:

```typescript
// database/postgres.ts
export function prepare(sql: string, params?: any[]): SyncStatement {
  // Translates SQLite syntax → PG syntax
  const pgSql = convertSyntax(sql);
  return new SyncStatement(pgSql, params);
}

class SyncStatement {
  async run(...params: any[]) {
    // 1. Write to SQLite mirror
    mirrorDb.run(this.sql, params);
    // 2. Queue outbox entry
    const entryId = recordOutbox(tableName, 'run', this.sql, params);
    // 3. Fire-and-forget to PG
    pgPool.query(this.sql, params).then(() => {
      markOutbox(entryId, true);  // applied_pg = true
    }).catch(err => {
      markOutboxError(entryId, err.message);
    });
    return { lastInsertRowid: mirrorId, changes: 1 };
  }

  async get(...params: any[]) {
    // Try PG first, fall back to mirror
    try {
      return await pgPool.query(this.sql, params).then(r => r.rows[0]);
    } catch {
      return mirrorDb.get(this.sql, params);
    }
  }
}
```

### SQL Translation (`convertSyntax()`)

Converts SQLite SQL → PostgreSQL:

| SQLite | PostgreSQL |
|--------|-----------|
| `datetime('now')` | `NOW()` |
| `datetime('now', '+5 hours')` | `NOW() + INTERVAL '5 hours'` |
| `date('now')` | `CURRENT_DATE` |
| `time('now')` | `CURRENT_TIME` |
| `julianday(expr)` | `EXTRACT(EPOCH FROM expr)/86400.0` |
| `INSERT OR IGNORE` | `ON CONFLICT DO NOTHING` |
| `AUTOINCREMENT` | `SERIAL` |
| `?` (positional) | `$1`, `$2`, ... |

### Route Pattern

Every route follows this pattern:

```typescript
// routes/tasks.ts
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { prepare } from '../database/postgres';

const router = Router();

// GET all tasks
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await prepare('SELECT * FROM tasks WHERE deleted_at IS NULL').all();
    res.json(result);
  } catch (err) {
    console.error('GET /tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// POST create task
router.post('/', authenticate, authorize(1, 2), async (req, res) => {
  try {
    const { title, description, priority, task_type, assigned_to } = req.body;
    const result = await prepare(
      'INSERT INTO tasks (title, description, priority, task_type, assigned_to, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
    ).run(title, description, priority, task_type, assigned_to, req.user.profile_id);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('POST /tasks error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

export default router;
```

### Key Route Files

| File | Endpoints | Notes |
|------|-----------|-------|
| `auth.ts` | Login, signup, approve/reject, change-password, logout | Dev login is file-based |
| `tasks.ts` | CRUD, teleprompter, auto-approve, bulk approve, trash/restore/permanent | 17-status CHECK constraint |
| `stories.ts` | CRUD, workflow transitions, confirm, send-to-tasks, revert | 7 story types |
| `bulletins.ts` | CRUD | Links to bulletin_templates |
| `users.ts` | Seat/profile CRUD, activate/restore/offline/archive/terminate | First-admin protection |
| `profiles.ts` | PIN set/verify/request/remove, self-service PIN reset | bcrypt-hashed PINs |
| `settings.ts` | Database test/connect/switch, reset, clean-user-data/all-data | Restore vs Fresh Start |
| `backups.ts` | List/create/restore/delete backups, archive/unarchive | Returns RestoreSummary |
| `leaves.ts` | CRUD, approve/reject, cancel | Notifications on approve/reject |
| `analytics.ts` | Dashboard stats, reminders, landing stats | Aggregation queries |
| `activity.ts` | Activity logs, toast history | 5 tabs in frontend |
| `developer.ts` | Clean-all-data (danger) | Dev-only endpoint |

---

## 7. Authentication & Authorization

### JWT Token Structure

```typescript
interface TokenPayload {
  userId: number;      // users.id
  profileId: number;   // profiles.id
  accessLevel: number; // 1=admin, 2=senior, 3=staff, 4=viewer
  isDev?: boolean;     // true for dev-admin login
}
```

### Middleware

```typescript
// middleware/auth.ts
export const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const authorize = (...levels: number[]) => (req, res, next) => {
  if (!levels.includes(req.user.accessLevel)) {
    return res.status(403).json({ error: 'Insufficient access' });
  }
  next();
};

export const authorizeDev = (req, res, next) => {
  if (!req.user.isDev) return res.status(403).json({ error: 'Dev only' });
  next();
};

export const authorizeAdminOrDev = (req, res, next) => {
  if (req.user.accessLevel > 1 && !req.user.isDev) {
    return res.status(403).json({ error: 'Admin or dev required' });
  }
  next();
};
```

### Dev Login

- Credentials stored in `backend/.dev-credentials` (bcrypt hash)
- Works when DB is missing/corrupt
- Token: `access_level 3` + `is_dev: true`
- **Not an admin** — cannot manage users, change settings, or access Database tab
- Can access: Developer page, Backups tab, `clean-all-data`

### Role System

```typescript
// config/roles.ts
export const ROLES = [
  { level: 1, label: 'Admin', taskTypes: ['all'] },
  { level: 2, label: 'Senior Editor', taskTypes: ['all'] },
  { level: 3, label: 'Reporter', taskTypes: ['general_news', 'breaking', ...] },
  { level: 4, label: 'Viewer', taskTypes: [] },
  // 16 total roles
];
```

### First-Admin Protection

The only active admin (access_level=1, is_active=1) cannot be:
- Taken offline (except self-recovery: offline=false)
- Archived
- Terminated
- Deactivated
- Swapped out via activate

This prevents locking out all admins.

---

## 8. Real-Time System (Socket.IO)

### Setup

```typescript
// socket.ts
import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer;

export function initSocket(server) {
  io = new SocketIOServer(server, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    // Client identifies itself
    socket.on('status:update', ({ profileId, status }) => {
      // Track online users
      onlineUsers.set(profileId, { socketId: socket.id, status });
      io.emit('users:online', Array.from(onlineUsers.values()));
    });

    // Quick-login approval flow
    socket.on('login:request', (data) => {
      io.emit('login:approval-request', data);
    });
    socket.on('login:approve', (data) => {
      io.to(data.socketId).emit('login:approved', data);
    });
    socket.on('login:reject', (data) => {
      io.to(data.socketId).emit('login:rejected', data);
    });
  });
}

// Broadcast helper (filters self, logs to toast_logs)
export function emitEvent(eventName: string, data: any, excludeProfileId?: number) {
  if (!io) return;
  if (excludeProfileId) {
    socket.broadcast.emit(eventName, data);
  } else {
    io.emit(eventName, data);
  }
  logToastEvent(eventName, data);  // For Activity > Toasts tab
}
```

### Event Categories

**Inbound (client → server):**
- `status:update` — presence tracking
- `login:request` / `login:approve` / `login:reject` — quick-login flow
- `tasks:pending-approval` / `task:approve` — task approval flow
- `task:auto-approve-countdown` — auto-approve timer

**Outbound (server → client):**
- `user:login`, `user:logout`, `user:changed` — auth events
- `task:created`, `task:updated`, `task:deleted` — task events
- `story:created`, `story:updated`, `story:deleted` — story events
- `bulletin:created`, `bulletin:updated`, `bulletin:deleted` — bulletin events
- `leave:created`, `leave:updated` — leave events
- `notification:new` — new notification
- `db:synced`, `db:offline`, `db:online` — sync status
- `users:online` — presence list
- `force:logout` — admin forces logout

### Toast Coverage

Every app change broadcasts a toast event to all LAN-connected devices. The
Layout component listens for these and shows a toast notification (self-skips
the actor). This gives instant feedback across all connected devices.

---

## 9. Offline-First Sync Engine

### How It Works

```
┌─────────────────────────────────────────┐
│            ONLINE MODE                   │
│                                          │
│  User action → prepare().run()           │
│    ├→ 1. Write to SQLite mirror          │
│    ├→ 2. INSERT into sync_outbox         │
│    └→ 3. Fire-and-forget to PG           │
│         ├→ Success: mark applied_pg=1    │
│         └→ Failure: pg_error logged      │
│                                          │
│  Health monitor: ping PG every 5s        │
│    ├→ Online: replay pending + bootstrap │
│    └→ Offline: switch to mirror engine   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│            OFFLINE MODE                  │
│                                          │
│  User action → prepare().run()           │
│    ├→ 1. Write to SQLite mirror          │
│    ├→ 2. INSERT into sync_outbox         │
│    └→ 3. Skip PG (engine = mirror)       │
│                                          │
│  Reads: mirror only                      │
│  Outbox rows wait for reconnect          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│            RECONNECT                     │
│                                          │
│  Health ping succeeds →                  │
│    ├→ 1. replayPending():               │
│    │     SELECT WHERE applied_pg = 0     │
│    │     → apply to PG                   │
│    ├→ 2. bootstrapMirror():             │
│    │     Copy PG → SQLite (INSERT OR     │
│    │     REPLACE, idempotent)            │
│    └→ 3. Emit db:synced event           │
│                                          │
│  Banner shows "synced N changes"         │
└─────────────────────────────────────────┘
```

### Key Code Patterns

```typescript
// sync.ts — SyncStatement.run()
async run(...params: any[]) {
  const entryId = recordOutbox(this.table, 'run', this.sql, params);

  // Mirror write (always succeeds)
  mirrorDb.run(this.sql, params);

  // PG write (fire-and-forget)
  if (getActiveEngine() === 'pg') {
    pgPool.query(this.pgSql, params)
      .then(() => markOutbox(entryId, true))
      .catch(err => markOutboxError(entryId, err.message));
  }

  return { lastInsertRowid: mirrorId, changes: 1 };
}
```

### Critical Invariants

1. **Engine-internal statements never replicate** — only outbox-backed rows
2. **Replay selects `applied_pg = 0`** — regardless of mirror flag
3. **Bulk ops disable persist** — must `flush()` after re-enabling
4. **`synced` event only when `synced > 0`** — prevents reload loops
5. **Bootstrap is idempotent** — `INSERT OR REPLACE` handles duplicates
6. **Reset clears everything** — `resetMirrorAndQueue()` resets `bootstrapped`

### API Endpoints

- `GET /api/sync/status` — `{mode, engine, online, queuePending, syncedWrites, failedWrites, lastSyncAt, lastError}`
- `POST /api/sync/replay` — force replay past backoff

### Frontend: OfflineBanner

```tsx
// components/OfflineBanner.tsx
useEffect(() => {
  socket.on('db:synced', (data) => {
    if (data.synced > 0 && Date.now() - lastReloadRef.current > 10000) {
      window.location.reload();
      lastReloadRef.current = Date.now();
    }
  });
  socket.on('db:offline', () => setVisible(true));
  socket.on('db:online', () => setVisible(false));
}, []);
```

---

## 10. Frontend Architecture

### Entry Point

```tsx
// main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { DialogProvider } from './context/DialogContext';
import { initTelemetry } from './lib/telemetry';

initTelemetry();  // Capture client errors

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <ToastProvider>
      <DialogProvider>
        <App />
      </DialogProvider>
    </ToastProvider>
  </AuthProvider>
);
```

### Router + Auth

```tsx
// App.tsx
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />

        {/* Protected (require auth) */}
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/stories" element={<Stories />} />
          {/* ... 20+ more protected routes */}
        </Route>

        {/* Teleprompter (public, no auth) */}
        <Route path="/teleprompter/:id" element={<Teleprompter />} />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Context Providers

```tsx
// context/AuthContext.tsx
interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

// context/ToastContext.tsx
interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

// context/DialogContext.tsx
interface DialogContextType {
  confirm: (message: string) => Promise<boolean>;
  alert: (message: string) => Promise<void>;
  choose: (options: { key: string; label: string; description?: string }[]) => Promise<string | null>;
}
```

### API Client

```tsx
// utils/api.ts
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
```

### Layout Component

```tsx
// components/Layout.tsx
export default function Layout() {
  const { user } = useAuth();
  const location = useLocation();

  // Navigation items with access control
  const navItems = [
    { path: '/dashboard', label: 'Dashboard', minLevel: 1 },
    { path: '/tasks', label: 'Tasks', minLevel: 1 },
    { path: '/stories', label: 'Stories', minLevel: 1 },
    { path: '/bulletins', label: 'Bulletins', minLevel: 1 },
    { path: '/users', label: 'Users', minLevel: 2 },
    { path: '/backups', label: 'Backups', minLevel: 1 },
    { path: '/developer', label: 'Developer', devOnly: true },
    // ...
  ];

  return (
    <div className="flex h-screen">
      <Sidebar items={navItems.filter(i => canSee(i, user))} />
      <main className="flex-1 overflow-auto">
        <Header />
        <Outlet />  {/* Child route renders here */}
      </main>
    </div>
  );
}
```

---

## 11. Entity CRUD — Complete Reference

### Tasks (33 endpoints)

**Core workflow: 17 statuses**

```
draft → script_writing → footage_collection → waiting_confirmation
    ↓                                              ↓
    └── correction_required ←──────────────────────┘
                                              ↓
                                        approved → editor_assigned
                                              ↓
                                    teleprompter_ready → prompting
                                              ↓
                                        recording_done → editing
                                              ↓
                                        uploading → published
                                              ↓
                                        under_review → completed

Special transitions:
- approved → cancelled (admin override)
- any → trashed (soft delete)
- trashed → restored / permanent delete
```

**Endpoints:**

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/tasks` | auth | List tasks (filtered by role: level-3 sees own only) |
| GET | `/tasks/trashed` | auth | List trashed tasks |
| GET | `/tasks/published` | auth | List published/completed tasks |
| GET | `/tasks/pending-approval` | auth | List tasks awaiting approval |
| GET | `/tasks/:id` | auth | Get single task with anchor/editor subdata |
| POST | `/tasks` | auth | Create task (title, description, priority, type, assigned_to, deadline) |
| PUT | `/tasks/:id` | auth | Update task (all fields including script, social, reporter, graphics) |
| DELETE | `/tasks/:id` | auth | Soft-delete (move to trash) |
| DELETE | `/tasks/:id/permanent` | auth(1,2) | Permanent delete (cascades children) |
| POST | `/tasks/permanent-bulk` | auth(1,2) | Bulk permanent delete |
| POST | `/tasks/empty-trash` | auth(1,2) | Empty all trashed tasks |
| POST | `/tasks/:id/reassign` | auth(1) | Reassign to different reporter |
| PUT | `/tasks/:id/assign-editor` | auth | Assign video editor |
| PUT | `/tasks/:id/auto-approve` | auth | Auto-approve (requires priority=urgent) |
| POST | `/tasks/approve-urgent` | auth | Batch approve urgent tasks |
| PUT | `/tasks/:id/anchor` | auth | Update anchor subtask (script, teleprompter, recording) |
| PUT | `/tasks/:id/editor` | auth | Update editor subtask (video, thumbnail, tone) |
| GET | `/tasks/:id/news-items` | auth | List news items in task |
| POST | `/tasks/:id/news-items` | auth | Add news item to task |
| PUT | `/tasks/:id/news-items/:itemId` | auth | Update news item |
| DELETE | `/tasks/:id/news-items/:itemId` | auth | Delete news item |
| POST | `/tasks/:id/extend-deadline` | auth | Request deadline extension |
| GET | `/tasks/:id/extensions` | auth | List deadline extensions |
| GET | `/tasks/:id/activity` | auth | Task activity log |
| GET | `/tasks/:id/generate-metadata` | auth | Auto-generate YouTube metadata |
| GET | `/tasks/:id/detect-reuse` | auth | Detect similar/reuse tasks |
| GET | `/tasks/:id/teleprompter` | auth | Get teleprompter data |
| GET | `/tasks/teleprompter/script/:id` | public | Teleprompter script (no auth) |
| GET | `/tasks/teleprompter/ready` | public | Ready teleprompter scripts |
| GET | `/tasks/teleprompter/history` | public | Teleprompter history |
| POST | `/tasks/teleprompter/start/:id` | public | Start teleprompter display |
| POST | `/tasks/teleprompter/finish/:id` | public | Finish teleprompter display |

**Key fields:** title, description, status, priority (low/medium/high/urgent), task_type, assigned_to, video_editor_id, deadline, headline, slug, main_story, closing, visual_cues, pronunciation_notes, source_reference, duration, reporter_name, camera_operator, mobile_journalist, photographer, drone_operator, facebook_link, instagram_link, website_link, logos_link, graphics_link, footage_link, bulletin_date, location_id, archive_id, reporter_id, uid

**Soft-delete entities:** tasks, programs, ads, locations, reporters (all have `deleted_at` column and recycle bin)

---

### Stories (12 endpoints)

**Workflow: 9 statuses**

```
data_gathering → script_writing → plotting → add_ons → confirmation
    ↓                                              ↓
    └── send_to_tasks (creates task) ──────────────→ approved
                                                       ↓
                                                  completed → archived
```

**Endpoints:**

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/stories` | auth | List stories |
| GET | `/stories/:id` | auth | Get single story |
| POST | `/stories` | auth(1,2,3) | Create story (title, type, vo_artist) |
| PUT | `/stories/:id` | auth(1,2,3) | Update story |
| DELETE | `/stories/:id` | auth | Soft-delete |
| POST | `/stories/:id/confirm` | auth(1,2) | Confirm story (approved: true/false) |
| POST | `/stories/:id/send-to-tasks` | auth(1,2) | Convert to task, returns task_id |
| POST | `/stories/:id/revert` | auth(1,2,3) | Revert to previous status |
| POST | `/stories/:id/reassign` | auth(1,2) | Reassign VO artist |
| POST | `/stories/:id/assign` | auth(1,2,3) | Assign VO artist |
| GET | `/stories/teleprompter/approved` | public | Approved stories for teleprompter |
| GET | `/stories/teleprompter/:id` | public | Single story for teleprompter |

**Story types:** feature, investigation, series, documentary, interview, opinion, other

---

### Bulletins (5 endpoints)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/bulletins` | auth | List bulletins |
| GET | `/bulletins/:id` | auth(1,2,3) | Get single bulletin |
| POST | `/bulletins` | auth(1,2,3) | Create bulletin (title, content, type, template_id) |
| PUT | `/bulletins/:id` | auth(1,2) | Update bulletin |
| DELETE | `/bulletins/:id` | auth(1,2) | Delete bulletin |

**Bulletin types:** breaking, special_report, ground_report, general

---

### Bulletin Templates / Slots (11 endpoints)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/templates` | auth | List all slots |
| GET | `/templates/:id` | auth | Get single slot |
| POST | `/templates` | auth(1) | Create slot (name, publish_time, sort_order) |
| PUT | `/templates/:id` | auth(1) | Update slot |
| DELETE | `/templates/:id` | auth(1) | Delete slot |
| POST | `/templates/restore-defaults` | auth(1) | Restore factory defaults (10 hourly slots) |
| GET | `/templates/custom-defaults` | auth(1) | Get admin's saved custom layout |
| POST | `/templates/save-defaults` | auth(1) | Save custom layout |
| POST | `/templates/restore-custom-defaults` | auth(1) | Restore admin's custom layout |
| POST | `/templates/save-system-defaults` | auth(1) | Save system-wide default layout |
| GET | `/templates/system-defaults` | auth | Get system-wide defaults |

---

### Ads (10 endpoints)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/ads` | auth | List ads |
| GET | `/ads/trashed` | auth | List trashed ads |
| GET | `/ads/:id` | auth(1,2,3) | Get single ad |
| POST | `/ads` | auth(1,2,3) | Create ad (client, title, category, rate, dates, slots) |
| PUT | `/ads/:id` | auth(1,2) | Update ad |
| DELETE | `/ads/:id` | auth(1,2) | Soft-delete |
| POST | `/ads/:id/restore` | auth | Restore from trash |
| DELETE | `/ads/:id/permanent` | auth | Permanent delete |
| POST | `/ads/permanent-bulk` | auth | Bulk permanent delete |
| POST | `/ads/empty-trash` | auth | Empty all trashed ads |

**Ad categories:** regular, political, health, education, entertainment, festival_special, other
**Client types:** direct, agency

---

### Programs (9 endpoints)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/programs` | auth | List programs |
| GET | `/programs/trashed` | auth | List trashed programs |
| GET | `/programs/:id` | auth(1,2,3) | Get single program |
| POST | `/programs` | auth(1,2,3) | Create program (title, type, date, time, duration) |
| PUT | `/programs/:id` | auth(1,2) | Update program |
| DELETE | `/programs/:id` | auth(1,2) | Soft-delete |
| POST | `/programs/:id/restore` | auth | Restore from trash |
| DELETE | `/programs/:id/permanent` | auth | Permanent delete |
| POST | `/programs/permanent-bulk` | auth | Bulk permanent delete |

**Program types:** live_coverage, special_program, interview, event

---

### Archives (10 endpoints)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/archives` | auth | List archives |
| GET | `/archives/recent` | auth | Recently used archives |
| GET | `/archives/:id` | auth | Get single archive |
| POST | `/archives` | auth | Create archive (name, category, location, status, availability) |
| PUT | `/archives/:id` | auth | Update archive |
| PUT | `/archives/:id/stock` | auth(1,2) | Update stock status + availability + age |
| POST | `/archives/:id/use` | auth | Mark as used |
| POST | `/archives/scan-folder` | auth(1,2) | Scan folder on server (returns indexed files) |
| POST | `/archives/import-selected` | auth(1,2) | Import selected files from scan |
| DELETE | `/archives/:id` | auth | Delete archive |

**Archive categories:** footage, photo, audio, graphics
**Stock statuses:** online/offline, available/not_available
**Stock age:** tracked via `stock_updated_at`, warning at ≥30 days

---

### Locations (11 endpoints)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/locations` | auth | List locations |
| GET | `/locations/trashed` | auth | List trashed locations |
| GET | `/locations/recent` | auth | Recently used locations |
| GET | `/locations/:id` | auth | Get single location |
| POST | `/locations` | auth | Create location (name, description, region) |
| PUT | `/locations/:id` | auth | Update location |
| POST | `/locations/:id/use` | auth | Mark as used |
| DELETE | `/locations/:id` | auth(1,2) | Soft-delete |
| POST | `/locations/:id/restore` | auth | Restore from trash |
| DELETE | `/locations/:id/permanent` | auth | Permanent delete |
| POST | `/locations/permanent-bulk` | auth | Bulk permanent delete |

---

### Reporters (8 endpoints)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/reporters` | auth | List reporters |
| GET | `/reporters/trashed` | auth | List trashed reporters |
| GET | `/reporters/:id` | auth | Get single reporter |
| GET | `/reporters/:id/stats` | auth | Reporter stats (news count, stories, ads, programs) |
| POST | `/reporters` | auth | Create reporter (name, email, phone, location, specialization) |
| PUT | `/reporters/:id` | auth | Update reporter |
| DELETE | `/reporters/:id` | auth(1,2) | Soft-delete |
| POST | `/reporters/:id/restore` | auth | Restore from trash |

---

### Leaves (6 endpoints)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/leaves` | auth | List all leaves |
| GET | `/leaves/my` | auth | List own leaves |
| GET | `/leaves/:id` | auth | Get single leave |
| POST | `/leaves` | auth | Create leave request (reason, dates, arrangement) |
| PUT | `/leaves/:id` | auth(1,2) | Approve/reject leave (status: approved/rejected) |
| DELETE | `/leaves/:id` | auth | Cancel own pending leave |

**Leave statuses:** pending → approved/rejected/cancelled

---

### Users & Profiles (21 endpoints)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/users` | auth(1) | List all users |
| POST | `/users` | auth(1) | Create user + profile |
| GET | `/users/seat-limits` | auth(1) | Get seat limits |
| POST | `/users/regenerate-usernames` | auth(1) | Regenerate short usernames |
| GET | `/users/available` | auth | Available users for assignment |
| GET | `/users/available-editors` | auth | Available video editors |
| GET | `/users/assignable` | auth | Assignable profiles |
| GET | `/users/profiles` | auth(1) | List profiles |
| GET | `/users/profiles/archived` | auth(1) | List archived profiles |
| POST | `/users/profiles` | auth(1) | Create profile |
| PUT | `/users/profiles/:id` | auth(1) | Update profile |
| PUT | `/users/profiles/:id/activate` | auth(1) | Activate profile |
| PUT | `/users/profiles/:id/restore` | auth(1) | Restore archived profile |
| PUT | `/users/profiles/:id/offline` | auth(1) | Take user offline (first-admin protected) |
| PUT | `/users/profiles/:id/archive` | auth(1) | Archive profile (first-admin protected) |
| PUT | `/users/profiles/:id/terminate` | auth(1) | Terminate user (first-admin protected) |
| PUT | `/users/profiles/:id/reactivate` | auth(1) | Reactivate terminated user |
| PUT | `/users/:id` | auth(1) | Update user |
| PUT | `/users/:id/deactivate` | auth(1) | Deactivate user (frees seat) |
| PUT | `/users/:id/password` | auth(1) | Change user password |
| GET | `/users/:id/workload` | auth | Get user workload (tasks by status) |

**Profile statuses:** active → inactive/archived → terminated/reactivated
**First-admin protection:** the only active admin cannot be offlined, archived, terminated, or deactivated

---

### PINs (7 endpoints)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/profiles/level3` | public | List level-3 profiles for PIN login |
| PUT | `/profiles/:id/pin` | auth(1) | Set PIN for staff member |
| DELETE | `/profiles/:id/pin` | auth(1) | Remove PIN |
| POST | `/profiles/:id/verify-pin` | public (rate-limited) | Verify PIN (for login) |
| GET | `/profiles/:id/pin-status` | public | Check if PIN is set |
| POST | `/profiles/:id/request-pin` | public (rate-limited) | Request PIN reset from admin |
| POST | `/profiles/:id/set-pin` | public (rate-limited) | Self-service PIN set (verifies password first) |

---

### Notifications (5 endpoints)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/notifications` | auth | List notifications (unread first) |
| POST | `/notifications/read-all` | auth | Mark all as read |
| POST | `/notifications/read/:id` | auth | Mark single as read |
| POST | `/notifications/test` | auth | Send test notification |
| POST | `/notifications/custom` | auth(1) | Send custom notification (scheduled or immediate) |

---

### Backups (8 endpoints)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/backups` | auth(1) or dev | List backups |
| POST | `/backups` | auth(1) or dev | Create backup |
| GET | `/backups/config` | auth(1) or dev | Get auto-backup config |
| PUT | `/backups/config` | auth(1) or dev | Update auto-backup config |
| POST | `/backups/:id/restore` | auth(1) or dev | Restore backup (returns RestoreSummary) |
| PUT | `/backups/:id` | auth(1) or dev | Update backup label/archive |
| DELETE | `/backups/:id` | auth(1) or dev | Delete backup |
| DELETE | `/backups` | auth(1) or dev | Delete all backups |

---

### Database Management (5 endpoints)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/settings/database` | auth(1) | Test + connect to Supabase (action: fresh/restore) |
| POST | `/settings/database/use` | auth(1) | Switch to saved connection |
| POST | `/settings/database/test` | auth(1) | Test connection without switching |
| POST | `/settings/database/test-saved` | auth(1) | Test a saved connection by ID |
| GET | `/settings/database/state` | auth(1) | Live row counts + sync info |

---

### Auth (14 endpoints)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/auth/login` | public (rate-limited) | Login with username/password |
| POST | `/auth/login-with-pin` | public (rate-limited) | Login with profile ID + PIN |
| POST | `/auth/signup` | public (rate-limited) | Register new account |
| GET | `/auth/pending-signups` | auth | List pending signups |
| PUT | `/auth/approve-signup/:profileId` | auth(1,2) | Approve signup |
| DELETE | `/auth/reject-signup/:profileId` | auth(1,2) | Reject signup |
| GET | `/auth/me` | auth | Get current user + profile |
| PUT | `/auth/me/profile` | auth | Update own profile |
| POST | `/auth/change-password` | auth | Change own password |
| GET | `/auth/dev` | auth(dev) | Get dev info |
| PUT | `/auth/dev/password` | auth(dev) | Change dev password |
| POST | `/auth/onboard` | auth | Complete onboarding |
| GET | `/auth/login-attempts` | auth | Login attempt history |
| POST | `/auth/logout` | auth | Logout (broadcasts user:logout) |

---

### Activity & Telemetry (7 endpoints)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/activity/login` | auth | Login activity |
| GET | `/activity/user` | auth | User activity |
| GET | `/activity/system` | auth | System activity |
| GET | `/activity/all` | auth(1,2) | All activity |
| GET | `/activity/toasts` | auth | Toast broadcast history |
| POST | `/telemetry/errors` | auth | Client error capture |
| GET | `/telemetry/export` | auth(1) or dev | Research data export (JSON/CSV) |

---

### Other Endpoints

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/analytics/dashboard` | auth | Dashboard stats (task, user, bulletin, priority) |
| GET | `/analytics/reminders` | auth | Overdue tasks, pending approvals |
| GET | `/analytics/activity` | auth | Recent activity feed |
| GET | `/analytics/workload` | auth | Workload per user |
| GET | `/analytics/landing` | public | Landing page stats |
| GET | `/channel-metadata` | public | Channel branding info |
| PUT | `/channel-metadata` | auth(1) | Update channel branding |
| GET | `/pending-requests/summary` | auth(1,2) | Pending signups/leaves/tasks/PINs count |
| GET | `/pending-requests/signups` | auth(1) | Pending signup list |
| GET | `/roles` | auth | Role definitions |
| GET | `/sync/status` | auth | Sync status (engine, queue, online) |
| POST | `/sync/replay` | auth(1) | Force sync replay |
| GET | `/news/:id` | auth | Get news item |
| PUT | `/news/:id` | auth | Update news item correction notes |
| DELETE | `/developer/clean-all-data` | auth(1) or dev | Nuclear reset (all data except admin) |

---

### Quick-Login Flow (Level 3 staff)

```
1. Level-3 user clicks their name on Landing page
2. Sends login:request via socket
3. All higher-level users see approval request
4. Higher-level approves → login:approved via socket
5. Level-3 user is logged in with their token
```

### Recycle Bin (5 entities)

| Entity | Soft-delete | Restore | Permanent Delete | Bulk Delete | Empty Trash |
|--------|------------|---------|-----------------|-------------|-------------|
| Tasks | ✓ | ✓ | ✓ (cascades children) | ✓ | ✓ |
| Programs | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ads | ✓ | ✓ | ✓ | ✓ | ✓ |
| Locations | ✓ | ✓ | ✓ (unlinks tasks.location_id) | ✓ | ✓ |
| Reporters | ✓ | ✓ | ✓ | ✓ | ✓ |

**RecycleBin.tsx** page has 5 tabs (Tasks/Programs/Ads/Locations/Reporters) with delete UI only when `access_level ≤ 2`.

---

## 12. API Design Patterns

### Response Format

```typescript
// Success
res.json(data);                    // GET single/list
res.status(201).json({ id });     // POST create
res.json({ success: true });      // PUT/DELETE

// Error
res.status(400).json({ error: 'Message' });
res.status(401).json({ error: 'Unauthorized' });
res.status(403).json({ error: 'Insufficient access' });
res.status(404).json({ error: 'Not found' });
res.status(500).json({ error: 'Server error' });
```

### Common Patterns

```typescript
// Pagination (if needed)
router.get('/', async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  const items = await prepare('SELECT * FROM items LIMIT ? OFFSET ?').all(limit, offset);
  const total = await prepare('SELECT COUNT(*) as count FROM items').get();
  res.json({ items, total: total.count, page, limit });
});

// Soft delete (recycle bin)
router.delete('/:id', authenticate, async (req, res) => {
  await prepare('UPDATE items SET deleted_at = NOW() WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Restore from trash
router.post('/:id/restore', authenticate, async (req, res) => {
  await prepare('UPDATE items SET deleted_at = NULL WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Permanent delete (cascade children)
router.delete('/:id/permanent', authenticate, authorize(1, 2), async (req, res) => {
  await prepare('DELETE FROM child_items WHERE parent_id = ?').run(req.params.id);
  await prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});
```

### Database Connection Management

```typescript
// POST /settings/database — test + connect
router.post('/database', authenticate, authorize(1), async (req, res) => {
  const { url, action } = req.body;  // action: 'fresh' | 'restore'

  // Test the connection
  const testPool = new Pool({ connectionString: url });
  const result = await testPool.query('SELECT COUNT(*) FROM users');
  const hasData = result.rows[0].count > 0;

  if (hasData && action === 'restore') {
    // Pull online data into app
    await switchDatabase(url);
    await pullPostgresToMirror();
  } else if (action === 'fresh') {
    // Push local data to online
    await switchDatabase(url);
    await pushMirrorToPostgres();
  }

  res.json({ success: true, hasData, total: result.rows[0].count });
});
```

---

## 13. UI/UX Patterns

### Loading States

```tsx
// SplashLoader — boot/Suspense/full-page
<SplashLoader />

// SkeletonTable — list/table pages
loading ? <SkeletonTable rows={10} cols={5} /> : <Table data={items} />

// SkeletonList — detail/sidebar pages
loading ? <SkeletonList items={5} /> : <List items={items} />

// SkeletonStatCards — dashboard
loading ? <SkeletonStatCards count={4} /> : <StatCards stats={stats} />
```

### Dialog Pattern (no browser popups)

```tsx
// Confirm dialog
const { confirm } = useDialog();
const ok = await confirm('Are you sure?');
if (ok) { /* do action */ }

// Choose dialog (Restore vs Fresh Start)
const { choose } = useDialog();
const choice = await choose([
  { key: 'restore', label: 'Restore', description: 'Pull online data' },
  { key: 'fresh', label: 'Fresh Start', description: 'Push local data' },
]);
if (choice === 'restore') { /* ... */ }
```

### Toast Notifications

```tsx
const { addToast } = useToast();
addToast({ type: 'success', message: 'Task created' });
addToast({ type: 'error', message: 'Failed to save' });
addToast({ type: 'info', message: 'New notification' });
```

### Tab Styling Convention

```tsx
// Border-b underline tabs (consistent across all pages)
<div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
  {tabs.map(tab => (
    <button
      key={tab.key}
      onClick={() => setActiveTab(tab.key)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        activeTab === tab.key
          ? 'border-accent-600 text-accent-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {tab.label}
    </button>
  ))}
</div>
```

### Dark Mode

- Tailwind `dark:` prefix throughout
- CSS variables for theme colors
- Toggle in Settings → Appearance
- Stored in localStorage

---

## 14. Deployment & Launchers

### Server Requirements

- Node.js 18+
- Port 3002 (API + SPA)
- Optional: Caddy reverse proxy on port 80

### One-Click Launchers

| OS | Start | Stop | Features |
|----|-------|------|----------|
| Windows | `Start Server.bat` | `Stop Server.bat` | Self-healing, firewall heal, Caddy auto-start, browser open |
| macOS | `Start Server.command` | `Stop Server.command` | Auto-restart wrapper, health check, browser open |
| Ubuntu | `start.sh` / systemd | `stop.sh` | Background, firewall, Caddy, health check |
| RHEL | `start.sh` / systemd | `stop.sh` | Same as Ubuntu with firewalld |

### Self-Healing Launcher (Windows)

`windows/start-server.ps1` is the single source of truth:
1. Embeds canonical copies of launcher files
2. Auto-repairs corrupted bats/vbs on every start
3. Verifies server by HTTP (not just port)
4. Handles junk cleanup, firewall, Caddy, .env creation
5. Starts auto-restart wrapper (`start-server-core.ps1`)

### Environment Variables

```bash
# backend/.env
DATABASE_URL=postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:6543/postgres
JWT_SECRET=<random 64-hex>
PORT=3002
NODE_ENV=production
```

### Build & Deploy

```bash
# Backend
cd backend && npm ci && npm run build  # tsc → dist/

# Frontend
cd frontend && npm ci && npm run build  # vite build → dist/

# Run
node backend/dist/index.js  # Serves API + SPA on :3002
```

### Cloud (Render)

```yaml
# render.yaml
services:
  - type: web
    name: workstation-meva
    buildCommand: cd backend && npm install && npm run build
    startCommand: cd backend && node dist/index.js
    envVars:
      - DATABASE_URL
      - JWT_SECRET
```

---

## 15. Testing & Verification

### Health Check

```bash
curl http://localhost:3002/api/health
# → {"status":"ok","timestamp":"...","uptime":...}
```

### Sync Status

```bash
# After login (admin):
GET /api/sync/status
# → {"mode":"pg","engine":"pg","online":true,"queuePending":0,...}
```

### Smoke Test Pattern

```
1. Login (admin + dev + level-3)
2. CRUD each entity (tasks, stories, bulletins, ads, programs, archives, locations, reporters)
3. Verify recycle bin (soft-delete → restore → permanent)
4. Test access gates (level-3 gets 403 on admin routes)
5. Test PIN flow (set → verify → request → remove)
6. Test leave flow (create → approve → cancel)
7. Test sync (offline → create data → reconnect → verify PG)
8. Test backup/restore
```

### Offline Test

```bash
# 1. Set DATABASE_URL to unreachable host
# 2. Restart → log shows "starting OFFLINE on the local database"
# 3. Create data → sync status shows queuePending > 0
# 4. Restore .env → restart → "Startup replay: synced:N, failed:0"
# 5. Verify data in Supabase
```

### Frontend Build Check

```bash
cd frontend && npm run build
# Should complete with no TypeScript errors
# dist/ should contain index.html + assets/
```

---

## 16. OS Launchers — Complete File Inventory

### Windows (8 files)

| File | Purpose |
|------|---------|
| `windows/Start Server.bat` | Thin dispatcher → calls `start-server.ps1 -Mode visible` (double-click) |
| `windows/Stop Server.bat` | Kills wrapper PowerShell FIRST, then node on :3002, then caddy.exe |
| `windows/Start Server Hidden.vbs` | Silent launcher (no console) → calls `start-server.ps1 -Mode open` or `-Mode hidden` |
| `windows/Repair Launcher.bat` | Runs `start-server.ps1 -Mode repair` to restore corrupted launcher files |
| `windows/Install Autostart.bat` | Creates `.lnk` shortcut in Windows Startup folder pointing to `Start Server Hidden.vbs` |
| `windows/Remove Autostart.bat` | Deletes the Startup shortcut |
| `windows/firewall-heal.bat` | Elevated helper — adds inbound rule "Workstation Meva 3002" (TCP, all profiles) |
| `windows/Create .env.bat` | Creates `backend/.env` from `.env.example` with random JWT_SECRET; `silent` arg skips pauses |
| `windows/Clean Junk.bat` | Deletes `server.log`, `*.tsbuildinfo`, `smoke2*.log`, `caddy-out/err.log` older than 7 days |
| `windows/Control Panel.bat` | Launches the **Control Panel** (WPF: `Control Panel.ps1`) — server start/stop + live health, database URL + `db-probe.js` live test, autostart toggle, Caddy proxy toggle, LAN copy buttons, repair/heal/clean tools. Reads/writes the same state as the `.bat` files; `.ps1` also exposes a `WM_PANEL_TEST=1` headless smoke-test hook |

### macOS (5 .command + 2 .sh files)

| File | Purpose |
|------|---------|
| `mac/Start Server.command` | Main launcher — checks Node, installs deps, builds, creates .env, starts Caddy, starts server background, health check, opens browser, prints LAN URL |
| `mac/Stop Server.command` | Unloads LaunchAgent (`launchctl bootout`), kills node, kills Caddy |
| `mac/Install AutoStart.command` | Creates `~/Library/LaunchAgents/com.workstation.meva.plist` — runs `start-server-core.sh` with KeepAlive |
| `mac/Remove AutoStart.command` | Removes the LaunchAgent plist |
| `mac/Fix Permissions.command` | `chmod +x` all `.command`/`.sh` files, clears quarantine (`xattr -dr com.apple.quarantine`) |
| `mac/Fix Permissions.sh` | Terminal version of the above |
| `mac/start-server-core.sh` | Auto-restart watchdog — restarts `node dist/index.js` on crash, max 5 within 60s, honors `$LOG` env var |

### Ubuntu/Debian (4 files)

| File | Purpose |
|------|---------|
| `ubuntu/install.sh` | Full installer — deploys to `/opt/workstation-online`, creates `meva` user, installs Node (bundled offline → NodeSource fallback), builds, registers systemd service |
| `ubuntu/start.sh` | Manual launcher — firewall self-heal (ufw), .env creation, Caddy auto-start, hidden background with `start-server-core.sh`, health check, browser open |
| `ubuntu/stop.sh` | Kills wrapper FIRST, then node, then Caddy |
| `ubuntu/start-server-core.sh` | Auto-restart watchdog (bash) |
| `ubuntu/workstation-meva.service` | systemd unit — `User=meva`, `Restart=always`, `Wants=caddy.service`, loads `.env` |

### RHEL/CentOS/Rocky/AlmaLinux/Fedora (4 files)

| File | Purpose |
|------|---------|
| `redhat/install.sh` | Full installer — same as Ubuntu but uses `dnf` + `firewalld` |
| `redhat/start.sh` | Manual launcher — same as Ubuntu but `firewalld` port 3002 |
| `redhat/stop.sh` | Same as Ubuntu |
| `redhat/start-server-core.sh` | Auto-restart watchdog (bash) |
| `redhat/workstation-meva.service` | systemd unit (identical to Ubuntu) |

### Root Scripts (2 files)

| File | Purpose |
|------|---------|
| `create-env.sh` | One-time .env creator (Mac/Linux) — idempotent, `silent` arg, JWT_SECRET via `openssl rand -hex 32` → `node crypto` → `uuidgen` fallback |
| `clean-junk.sh` | Cross-platform junk cleanup — deletes logs/tsbuildinfo older than 7 days |

### Proxy (4 files)

| File | Purpose |
|------|---------|
| `proxy/Start Caddy.bat` | Starts `caddy.exe run --config Caddyfile` in background |
| `proxy/Stop Caddy.bat` | Kills caddy.exe process |
| `proxy/caddy/caddy.exe` | Bundled Caddy binary (Windows) |
| `proxy/caddy/Caddyfile` | Reverse proxy config — `:80` → `127.0.0.1:3002`, gzip+zstd, WebSocket upgrade |

### LAN (5 files)

| File | Purpose |
|------|---------|
| `lan/Add Workstation Hosts.bat` | Windows: adds `192.168.100.156 workstation` to hosts file (admin) |
| `lan/Add Workstation Hosts.command` | Mac: same |
| `lan/Open App.bat` | Windows: opens `http://workstation:3002` in browser |
| `lan/Open App.command` | Mac: same |
| `lan/README.md` | LAN setup guide |

---

## 17. Auto Functions — Complete List

### Auto-Start (on boot/login)

| OS | Mechanism | What Runs |
|----|-----------|-----------|
| Windows | `Install Autostart.bat` → `.lnk` in `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` | `Start Server Hidden.vbs` → `start-server.ps1 -Mode hidden` |
| macOS | `Install AutoStart.command` → `~/Library/LaunchAgents/com.workstation.meva.plist` | `start-server-core.sh` → `node dist/index.js` (KeepAlive) |
| Ubuntu | `install.sh` → `systemctl enable workstation-meva` | systemd `Restart=always` |
| RHEL | `install.sh` → `systemctl enable workstation-meva` | systemd `Restart=always` |

### Auto-Restart (on crash)

| OS | Mechanism | Behavior |
|----|-----------|----------|
| Windows | `start-server-core.ps1` | Restarts `node dist/index.js` up to 5 times within 60s, then gives up |
| macOS | `start-server-core.sh` + LaunchAgent KeepAlive | Same crash-limit logic |
| Ubuntu | systemd `Restart=always` | systemd handles restart (no crash limit) |
| RHEL | systemd `Restart=always` | Same as Ubuntu |

### Auto-Repair (Windows only)

`start-server.ps1` runs on every start:
1. Detects the layout: bundled portable Node goes on `PATH`, and `app.installed` (written by the installer at `$INSTDIR`) marks a **packaged layout** → skips `npm install`/builds (pre-built dist + `backend/node_modules` are bundled). Source checkouts build/install as needed.
2. Embeds canonical content for 5 files in `$canonical` hash
3. Compares each file (CRLF→LF + `.Trim()`)
4. Restores if missing/drifted → `REPAIR:` line in `server.log`
5. Files protected: `Start Server.bat`, `Stop Server.bat`, `Start Server Hidden.vbs`, `firewall-heal.bat`, `start-server-core.ps1`
6. `Repair Launcher.bat` provides manual `-Mode repair` entry
7. The **Control Panel** (`Control Panel.ps1`) is a utility, deliberately NOT self-repaired — reinstall or re-copy it from git if it gets corrupted

### Auto-Cleanup (junk)

| OS | Trigger | What Gets Deleted |
|----|---------|-------------------|
| Windows | `start-server.ps1` (every start) + `Clean Junk.bat` (manual) | `server.log`, `server-err.log`, `smoke2*.log`, `caddy-out.log`, `caddy-err.log`, `*.tsbuildinfo` older than 7 days |
| macOS | `Start Server.command` (every start) | Same via `clean-junk.sh` |
| Ubuntu | `start.sh` (every start) | Same via `clean-junk.sh` |
| RHEL | `start.sh` (every start) | Same via `clean-junk.sh` |

### Auto-.env Creation

| OS | Script | Behavior |
|----|--------|----------|
| Windows | `Create .env.bat` or `start-server.ps1` | Copies `.env.example` → `backend/.env`, generates random 64-hex JWT_SECRET via `[guid]::NewGuid()` pair |
| macOS | `Start Server.command` | Calls `create-env.sh` (or manual `openssl rand -hex 32` → `node crypto` → `uuidgen`) |
| Ubuntu | `start.sh` / `install.sh` | Calls `create-env.sh` or generates via `openssl rand` |
| RHEL | `start.sh` / `install.sh` | Same as Ubuntu |

### Auto-Firewall (Windows)

`start-server.ps1` checks if rule "Workstation Meva 3002" exists:
- If missing → relaunches `firewall-heal.bat` elevated (UAC `-Verb RunAs`)
- `firewall-heal.bat` adds inbound TCP rule for port 3002 on all profiles (Domain/Private/Public)

### Auto-Caddy (all OS)

| OS | Condition | Behavior |
|----|-----------|----------|
| Windows | `proxy\caddy\caddy.exe` exists + not running | `start-server.ps1` starts it in background |
| macOS | `brew list caddy` or caddy in PATH | `Start Server.command` starts it |
| Ubuntu | caddy available (manual or service) | `start.sh` starts it if not running |
| RHEL | caddy available | Same as Ubuntu |

### Auto-Browser-Open

| OS | Trigger | Behavior |
|----|---------|----------|
| Windows | `Start Server.bat` (visible/open modes) | Polls `GET /api/health` up to 60s → `Start-Process http://localhost:3002` |
| macOS | `Start Server.command` | Polls health → `open http://localhost:3002` |
| Ubuntu | `start.sh` (desktop only, `$DISPLAY` set) | Polls health → `xdg-open http://localhost:3002` |
| RHEL | Same as Ubuntu | Same |

### Auto-Already-Running Check

All launchers check if the server is already running before starting:
- **HTTP check** (not just port) — a port can show LISTENING while process is shutting down
- If up → just open browser (skip start)
- If listening but not answering → kill stale listener, start fresh

---

## 18. Android Wrapper

### Structure

```
android/
├── build.gradle              # Root Gradle build
├── settings.gradle           # Gradle settings
├── gradle.properties         # Gradle properties
├── gradlew / gradlew.bat    # Gradle wrapper
├── gradle/wrapper/           # Gradle wrapper JAR + properties
└── app/
    ├── build.gradle          # App module config
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/workstation/meva/
        │   ├── MainActivity.kt    # WebView wrapper + control panel
        │   └── NodeService.kt     # Foreground service running Node.js
        └── res/
            ├── layout/activity_main.xml
            ├── values/ (themes.xml, strings.xml, colors.xml)
            └── drawable/ (icons, status indicators, badges)
```

### App Config

| Setting | Value |
|---------|-------|
| Package | `com.workstation.meva` |
| Min SDK | 24 (Android 7.0) |
| Target SDK | 34 (Android 14) |
| Java/Kotlin | JVM target 17 |
| Node.js | v20.11.1 (linux-arm64 + linux-armv7l) |
| Server port | 3002 (localhost only) |

### How It Works

1. **First launch:** `NodeService.extractAssets()` copies bundled files from APK assets to `filesDir`:
   - `assets/server/dist/` → backend build output
   - `assets/server/node_modules/` → backend dependencies
   - `assets/frontend/dist/` → frontend build output
   - `assets/node/bin/node-arm64` or `node-armv7l` → Node runtime (detected by `os.arch`)

2. **Start Server:** `NodeService.startNode()` runs `node dist/index.js` as a foreground service with notification

3. **WebView:** `MainActivity.showWorkstation()` loads `http://127.0.0.1:3002` in a full-screen WebView

4. **Control Panel:** Start/Stop/Open buttons with status indicator (green pulse = running)

### Gradle Build Tasks

```bash
# Pre-build tasks (run automatically):
./gradlew prepareServerAssets    # Copies backend/dist, node_modules, frontend/dist into assets
./gradlew downloadNodeBinaries   # Downloads Node v20.11.1 for linux-arm64 and linux-armv7l

# Build APK:
./gradlew assembleDebug         # Debug APK
./gradlew assembleRelease       # Release APK
```

### NodeService Features

- **Foreground service** with persistent notification ("Server running on port 3002")
- **3-method executable fix:** tries `setExecutable()` → `chmod +x` → copy-to-cache fallback
- **Environment variables:** `NODE_ENV=production`, `PORT=3002`, `ANDROID=true`
- **Status persistence:** SharedPreferences (`server_status`, `server_status_message`)
- **Exit handling:** detects process exit, updates notification, stops self

### MainActivity Features

- **Control panel:** Start Server, Stop Server, Open Workstation buttons
- **Status indicator:** colored dot (green=running, yellow=starting, red=error, gray=stopped) with pulse animation
- **Uptime counter:** shows elapsed time while server is running
- **WebView:** JavaScript enabled, DOM storage, file access, auto-reload on error
- **Back button:** exits WebView → control panel → "Stop & Exit" / "Keep Running" dialog
- **Health check:** polls `GET /api/health` to detect server status
- **Notification permission:** requested on Android 13+ before starting service

### Key Detail

- `android/app/src/main/assets/node/` is git-ignored (~173 MB)
- Gradle re-downloads on fresh builds
- The app works offline (Node runs locally on the device)
- **Do NOT bump to Node v24** — it dropped armv7l support; many budget tablets are armv7l

---

## 18.1 Teleprompter System

### Overview

The teleprompter is a **public-facing studio screen** — no login required. It
displays scripts (from tasks or approved stories) in a black-background fullscreen
view with **velocity-based auto-scroll** (one signed speed axis controlling both
speed and direction, modeled on Imaginary Teleprompter), adjustable
font/spacing/alignment, mirror mode, and keyboard shortcuts. When the script
ends, the operator can mark "Finished" which advances the task to the editing
stage.

### Pages & Access

| Page | URL | Auth | Purpose |
|------|-----|------|---------|
| `TeleprompterList.tsx` | `/teleprompter` | public | List of available scripts (ready tasks, approved stories, today's history, built-in Test Script) |
| `Teleprompter.tsx` | `/teleprompter/:id` | public | Full teleprompter display with velocity auto-scroll |

- Menu entry visible only to `access_level === 1` or role `video_editor` /
  `anchor` (`showFor` predicate on the NavItem in `Layout.tsx`).
- Signed-out users stay on the landing page: the axios 401 interceptor
  redirects to `/` (never `/login`) and never redirects on `/teleprompter*`
  paths; desktop teleprompter routes also render on mobile user-agents.

### TeleprompterList Features

- **New Script** — paste/type a title + text and prompt it instantly; custom
  scripts are stored device-local in localStorage (`tp_custom_scripts`, ids
  `custom-<ts>`, newest 50 kept) and can be re-opened or deleted from the list
- **Ready to Record** — tasks with status `teleprompter_ready` (from task workflow)
- **Approved Stories** — stories with status `approved` (from story pipeline)
- **Today's Scripts** — scripts loaded today (from `script_imported_at` timestamp)
- Click any script → opens `/teleprompter/:id`

### Velocity Control Model (the core design)

One **signed speed value** (-10…+10, 0.5 steps, persisted in localStorage as
`tp_speed`) drives everything. Positive scrolls down, negative scrolls back up,
zero holds position. There are no separate "scroll position" and "speed" modes.

```
adjustSpeed(delta):            // wheel notch / arrow press / W / S
  speed = clamp(speed + delta, -10, +10)

animate(frame):                // requestAnimationFrame loop
  vel += (speed - vel) * (1 - exp(-delta/150))   // ease toward target
  pos += (vel * delta) / 75                       // own float accumulator
  el.scrollTop = pos                              // sub-pixel safe
```

- **Eased velocity** (`currentVelRef`, ~150 ms time constant): speed changes
  and zero-crossing reversals glide instead of jumping.
- **Float position accumulator** (`posRef`): `element.scrollTop` truncates
  fractions, which made speeds ≤ 2.0 appear dead; keeping our own float fixes
  it. Synced on nudges, start, and boundary clamps.

### Controls

| Input | Action |
|-------|--------|
| Wheel up / ↑ / W | `adjustSpeed(+0.5)` — faster forward |
| Wheel down / ↓ / S | `adjustSpeed(-0.5)` — slower → reverse |
| Space | Play / pause |
| Middle click | Reset speed to default (+3.0) |
| Shift + wheel | Free reposition ±90 px (auto-scroll holds 1.5 s via `manualHoldUntilRef`) |
| PgUp / PgDn | Jump ±0.8 × viewport |
| ← / → | Font size −/+ 2 px |
| R | Reset to top (speed → +3.0) |
| M | Mirror toggle |
| Escape | Close popups / show controls |

- **Wheel deltas accumulate** (`wheelAccumRef`, step = 100 deltaY per 0.5) so
  trackpads and free-spinning wheels ramp smoothly.
- **Adjusting speed while paused auto-resumes motion** via
  `beginScroll(false)` — no forced fullscreen (only the Start button requests
  fullscreen).
- Buttons blur themselves after click (`document.activeElement.blur()`) so
  keyboard shortcuts never die on stuck focus.
- Overlays (guide modal, history drawer, end popup) are marked
  `data-tp-overlay` and keep native scrolling.

### Boundary Parking

| Event | Behavior |
|-------|----------|
| Reach bottom while moving down | **Park**: stop, speed → **-3.0 ◀**, flash badge. One wheel roll / Space instantly reverses at full reverse speed. After a dwell (~2 s + font factor) the "Script Ended" popup appears — cancelled automatically if the operator reverses away first. |
| Reach top while reversing | **Park**: stop, speed → **+3.0 ▶**, flash badge. Restart button and R behave the same. |

The end popup offers **Finished** (`POST /tasks/teleprompter/finish/:id` → task
advances to `recording_done`, related bulletin tasks advance too), **Restart**
(top + resume), and **Close**.

### UI Details

- **Signed readouts everywhere:** badge and slider show `-3.0 ◀` style values,
  never absolute-with-arrow.
- **Close button** (top-left X): rendered whenever `!scrolling && finishState
  !== 'done'` — i.e. always visible when not actively prompting (never driven
  by a ref, which caused a "sometimes missing" bug).
- **Speed badge:** subtle toast (top-right, ~4 % white bg, 30 % text opacity).
- **Fullscreen:** only the explicit Start button enters fullscreen; velocity
  resumes do not.
- **Auto-hide controls bar**, scripts drawer (Today/Archived), built-in 7-section
  operating guide — all unchanged.
- Settings persist in localStorage: `tp_speed`, `tp_fontSize`, `tp_spacing`,
  `tp_mirror`, `tp_align`.

### Teleprompter Workflow

```
1. Task reaches "teleprompter_ready" status (or story is "approved")
2. Operator opens /teleprompter → sees script in "Ready to Record" list
3. Clicks script → opens /teleprompter/:id
4. Presses Start (or Space) → fullscreen + auto-scroll begins
5. Wheel/arrows adjust velocity live; rolling down past zero reverses
6. Bottom reached → parks at -3.0 ◀ → popup after dwell (or instant reverse)
7. Operator clicks "Finished" → POST /tasks/teleprompter/finish/:id
   → Task status advances to "recording_done" → sent to editor
   → Related bulletin tasks also advance
```

### Backend Teleprompter Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/tasks/teleprompter/script/:id` | public | Get task script for teleprompter |
| GET | `/tasks/teleprompter/ready` | public | List ready teleprompter scripts |
| GET | `/tasks/teleprompter/history` | public | Today's + archived script history |
| POST | `/tasks/teleprompter/start/:id` | public | Mark task as "prompting" (started) |
| POST | `/tasks/teleprompter/finish/:id` | public | Mark task as "recording_done" (finished) |
| GET | `/stories/teleprompter/approved` | public | List approved stories for teleprompter |
| GET | `/stories/teleprompter/:id` | public | Get story script for teleprompter |

---

## 19. Frontend Context Providers (5 total)

```tsx
// 1. AuthContext.tsx — login state, token, user
interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

// 2. ToastContext.tsx — toast notifications
interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

// 3. DialogContext.tsx — modal dialogs (no browser popups)
interface DialogContextType {
  confirm: (message: string) => Promise<boolean>;
  alert: (message: string) => Promise<void>;
  prompt: (message: string) => Promise<string | null>;
  choose: (options: { key: string; label: string; description?: string }[]) => Promise<string | null>;
}

// 4. SocketContext.tsx — Socket.IO connection, online users
interface SocketContextType {
  socket: Socket | null;
  onlineUsers: OnlineUser[];
  isConnected: boolean;
}

// 5. UndoContext.tsx — undo-toasts with countdown timers
interface UndoContextType {
  showUndo: (message: string, onUndo: () => void, duration?: number) => void;
}
```

### Provider Hierarchy (in main.tsx)

```tsx
<AuthProvider>
  <SocketProvider>
    <ToastProvider>
      <DialogProvider>
        <UndoProvider>
          <App />
        </UndoProvider>
      </DialogProvider>
    </ToastProvider>
  </SocketProvider>
</AuthProvider>
```

---

## 20. Backend Scripts & Dev Tools

### `backend/scripts/` (JS — run with `node`)

| Script | Purpose |
|--------|---------|
| `check-admins.js` | Lists all users + admin users from SQLite DB |
| `reset-db.js` | Resets SQLite — deletes all except admin (id=1), resets admin credentials |
| `reset-fixed.js` | Same as reset-db + clears bulletin_templates |
| `db-reset.js` | Truncates ALL PostgreSQL tables in dependency order |
| `drop-tables.js` | Drops ALL PostgreSQL tables (nuclear option) |
| `inspect-db.js` | Reads SQLite schema, tables, structures, user data |
| `test-db.js` | Quick DB connectivity test — initializes and lists users |

### `backend/src/scripts/` (TS — run with `npx tsx`)

| Script | Purpose |
|--------|---------|
| `check-state.ts` | Diagnostic — prints Bulletin Templates, Profiles, active Stories |
| `clear-tasks.ts` | Clears task-related data (with backup), resets bulletin templates |
| `import-full-version.ts` | One-time migration — imports users/profiles/templates from SQLite → PG |

---

## 21. Configuration Files

| File | Purpose |
|------|---------|
| `backend/tsconfig.json` | Backend TypeScript config |
| `frontend/tsconfig.json` | Frontend TypeScript config |
| `frontend/vite.config.ts` | Vite build config (dev proxy to :3003) |
| `frontend/tailwind.config.js` | Tailwind CSS config |
| `frontend/postcss.config.js` | PostCSS — tailwindcss + autoprefixer |
| `package.json` (root) | Monorepo scripts: `build`, `start`, `dev` |
| `render.yaml` | Render.com deployment blueprint |
| `.env.example` (root + backend/) | Environment template |
| `.gitignore` | Excludes node_modules, dist, .env, *.db, backups, telemetry/, logs, data-snapshots/ |

---

## 22. CSS & Styling

### `frontend/src/index.css`

Global styles including:
- Tailwind directives (`@tailwind base/components/utilities`)
- `:focus-visible` outline for accessibility
- `flat-btn` / `flat-btn-primary` / `flat-btn-danger` / `flat-btn-surface` button classes
- `icon-btn` / `icon-btn-danger` / `icon-btn-success` / `icon-btn-warning` icon buttons
- `toggle-track` / `toggle-knob` with `data-on` attribute
- Full dark mode chip palette (bg-*-50/100, text-*-400..800, border-*-200/300)
- Skeleton/toggle dark overrides
- `prefers-reduced-motion` media query

### `frontend/src/mobile.css`

Mobile-specific overrides and responsive adjustments.

### Public Assets

| File | Purpose |
|------|---------|
| `frontend/public/favicon.svg` | App favicon |
| `frontend/public/logo.svg` | App logo (light mode) |
| `frontend/public/logo-dark.svg` | App logo (dark mode) |

---

## 23. Notifications & Tracking

### In-App Notifications

```sql
-- notifications table
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER REFERENCES profiles(id),
  title TEXT NOT NULL,
  message TEXT,
  type TEXT DEFAULT 'info',  -- info, warning, success, error
  entity_type TEXT,          -- task, story, leave, etc.
  entity_id INTEGER,         -- ID of the related entity
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Notification creation points:**
- Leave request → notify admins
- Leave approve/reject → notify staff
- Task assigned → notify assignee
- Task status change → notify creator
- Signup request → notify admins
- PIN request → notify admins
- Custom scheduled notifications (via `scheduled_notifications` table)

**Frontend:** `NotificationBell.tsx` — bell icon with unread count badge, dropdown list

### Activity Logs (Audit Trail)

```sql
-- activity_logs: Global audit trail
CREATE TABLE activity_logs (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER,
  profile_name TEXT,
  action TEXT NOT NULL,         -- login, create_task, update_story, etc.
  entity_type TEXT,             -- task, story, bulletin, etc.
  entity_id INTEGER,
  details TEXT,                 -- JSON with additional context
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Logged actions:** every CRUD operation, login/logout, approval/rejection, status changes

**Frontend:** `Activity.tsx` with 5 tabs:
1. Activity (global audit)
2. User Activity (per-user)
3. System Activity (system-level)
4. Errors (telemetry)
5. Toasts (LAN broadcast history — from `toast_logs` mirror-only table)

### Telemetry (Client Errors)

```typescript
// lib/telemetry.ts
initTelemetry();  // In main.tsx

// Captures:
// - window.error events
// - unhandledrejection events
// Batched (20 items / 10s), POST to /api/telemetry/errors
// Skips /api/telemetry URLs (feedback loop guard)
```

**Backend:** `telemetry_errors` table + `POST /api/telemetry/errors` + `GET /api/telemetry/export`

### Request Logging

- Daily `telemetry/requests-YYYY-MM-DD.ndjson` files
- Fields: timestamp, method, URL, status, duration, user_id, level, user-agent
- Auto-pruned at boot (>30 days)

---

## 24. Export & Import

### User Data Export/Import (Settings page)

```typescript
// Export: downloads JSON with all user data
GET /api/users/export
// → { users, profiles, bulletins, tasks, stories, ... }

// Import: uploads JSON to restore user data
POST /api/users/import
// Body: JSON file with user data
```

### Backup Export/Import (Backups page)

```typescript
// Export: downloads full database backup
GET /api/backups/:id/export
// → JSON blob with all table data

// Import: uploads backup file
POST /api/backups/import
// Body: multipart form with backup file
// Returns: { success, restored, summary: { tables, rows, warnings } }
```

### Backup Summary (Restore)

```typescript
interface RestoreSummary {
  restoredFile: string;
  restoredDate: string;
  tables: { name: string; rows: number }[];
  preservedTables: string[];
  syncQueueCleared: boolean;
  warnings: string[];
}
```

### Research Data Export (Backups page → Research Data tab)

```typescript
// Full report (JSON)
GET /api/telemetry/export?format=json&since=90
// → { activity_logs, task_audit_log, sync_log, errors }

// Per-table CSV
GET /api/telemetry/export?format=csv&table=activity&since=90
// → CSV file download
```

### Database Connection Export

Saved connections stored in `backend/saved-connections.json` (git-ignored):
```json
[
  {
    "id": "uuid",
    "url": "postgresql://...",
    "label": "Production",
    "createdAt": "2026-08-01T00:00:00Z"
  }
]
```

---

## 25. Developer Options

### Developer Login

- Credentials: `dev-admin` / `Dev@Meva2026`
- Stored in `backend/.dev-credentials` (bcrypt hash, file-based)
- Works when DB is missing/corrupt
- Token: `access_level 3` + `is_dev: true`
- **NOT an admin** — cannot manage users, change settings, access Database tab

### Developer Page (`pages/Developer.tsx`)

**Combined card with sub-tabs:**
1. **Dev Account tab** — login form, change password
2. **Saved Passwords tab** — list of saved logins with PIN management

**Other tabs on the page:**
- Connection Help — database connection diagnostics
- Dev Tools — `clean-all-data`, `fix-db`, `/auth/dev*` endpoints
- App Settings — app name, channel name

### Backend Dev Routes

| Route | Access | Purpose |
|-------|--------|---------|
| `POST /api/developer/clean-all-data` | `authorizeDev` | Truncates all tables except admin users, resets mirror |
| `POST /api/backups/fix-db` | `authorizeDev` | Repairs database inconsistencies |
| `POST /api/auth/dev-login` | public | Dev login endpoint |
| `POST /api/auth/dev-change-password` | `authorizeDev` | Change dev password |

### Dev-Only UI Visibility

```typescript
// Developer page computes:
const isAdmin = !user?.is_dev && access_level <= 1;

// Non-admin devs see:
// ✓ Connection Help tab
// ✓ Dev Tools tab
// ✓ Saved Passwords tab
// ✗ Activity Logs tab (hidden)
// ✗ Users tab (hidden)
```

---

## 26. Settings Page

### What's on Settings (NOT on Backups)

| Section | Features |
|---------|----------|
| **App Name** | Change the displayed app name (stored in localStorage) |
| **Appearance** | Dark mode toggle |
| **Channel Metadata** | Channel name, display name, website, editor, subscribe URL |
| **User Data Export** | Download all user data as JSON |
| **User Data Import** | Upload JSON to restore user data |
| **Bulletin Defaults** | Per-user saved slot layouts, system-wide defaults |
| **Clean User Data** | Remove content but keep structure |
| **Clean All Data** | Full reset (admin only) |

### What Moved to Backups Page

All database panels are on the **Backups page** (not Settings):
- Backups tab: snapshot list, auto-settings, restore, export, archive
- Database tab: live sync status, connection management, row counts, fresh start

**Rule:** Do not re-add database panels to Settings.

---

## 27. File System

### Runtime Files (git-ignored)

| File | Purpose |
|------|---------|
| `backend/.env` | Environment variables (secrets) |
| `backend/workstation.db` | SQLite mirror database |
| `backend/saved-connections.json` | Saved Supabase connection URLs |
| `backend/backups/` | Database backup files |
| `backend/server.log` | Runtime log (stdout + stderr) |
| `backend/telemetry/` | Request logs (NDJSON, daily, auto-pruned) |
| `backend/.dev-credentials` | Dev login password hash |
| `frontend/dist/` | Built frontend assets |
| `backend/dist/` | Built backend JS |
| `*.tsbuildinfo` | TypeScript incremental build cache |

### Build Output

```
frontend/dist/
├── index.html
└── assets/
    ├── index-[hash].js      (~300 KB)
    ├── index-[hash].css     (~50 KB)
    └── [other hashed assets]

backend/dist/
├── index.js
├── config/
├── database/
├── middleware/
├── routes/
└── utils/
```

### Data Flow

```
User action
    ↓
Frontend (React)
    ↓ HTTP request + Socket.IO event
Backend (Express)
    ↓ prepare(sql).run()
    ├── SQLite mirror (immediate, always works)
    ├── sync_outbox (queue entry)
    └── PostgreSQL (fire-and-forget)
         ↓ on success
    mark applied_pg = 1
         ↓ on failure
    pg_error logged, retry on next health check
```

---

## Appendix: Role Definitions

```typescript
export const ROLES = [
  { level: 1, label: 'Admin', taskTypes: ['all'] },
  { level: 2, label: 'Senior Editor', taskTypes: ['all'] },
  { level: 3, label: 'Output Editor', taskTypes: ['general_news', 'breaking', 'interview', 'live_coverage'] },
  { level: 3, label: 'Reporter', taskTypes: ['general_news', 'breaking', 'field_report'] },
  { level: 3, label: 'Assignment Editor', taskTypes: ['general_news', 'breaking'] },
  { level: 3, label: 'Output Producer', taskTypes: ['general_news', 'breaking'] },
  { level: 3, label: 'Video Editor', taskTypes: ['general_news', 'breaking'] },
  { level: 3, label: 'Graphics Designer', taskTypes: ['general_news'] },
  { level: 3, label: 'Teleprompter Operator', taskTypes: ['general_news'] },
  { level: 3, label: 'Floor Manager', taskTypes: ['general_news'] },
  { level: 3, label: 'Viewer', taskTypes: [] },
  // ... 16 total roles
];

export const SEAT_LIMITS = {
  free: 5,
  basic: 10,
  pro: 25,
  enterprise: 100,
};
```

## Appendix: Frontend Type Definitions

```typescript
// Inline types (frontend/src/utils/roles.ts)
interface RoleDefinition {
  level: number;
  label: string;
  taskTypes: string[];
}

// Saved login (frontend/src/utils/quickLogin.ts)
interface SavedLogin {
  profileId: number;
  fullName: string;
  role: string;
  accessLevel: number;
  pin?: string;
  username?: string;
}

// Telemetry (frontend/src/lib/telemetry.ts)
interface TelemetryItem {
  page: string;
  message: string;
  stack?: string;
  userAgent: string;
  profileId?: number;
}
```

## Appendix: Key Gotchas

1. **`res.json(<Promise>)` silently serializes to `{}`** — always `await` before responding
2. **PG `COUNT(*)` returns strings** — `"0"` not `0`; use `|| 0` in frontend
3. **Never leave trailing `;` in SQL** — `RETURNING id` gets appended
4. **`process.on('unhandledRejection')` must be log-only** — never exit
5. **Bulk ops must `flush()` after re-enabling persist** — stale disk = resurrected data
6. **SQLite `createTables()` must not use PG syntax** — no `SERIAL`, `TIMESTAMPTZ`, `DEFAULT NOW()`
7. **`video_editor_id` must be awaited** — missing await passes Promise → PG `22P02`
8. **Stop wrapper FIRST** — else it respawns node
9. **`Stop Server.bat` match must require `-File`** — bare LIKE matches itself
10. **OfflineBanner reload only when `synced > 0`** — prevents infinite reload loops

---

**End of from-scratch.md**
