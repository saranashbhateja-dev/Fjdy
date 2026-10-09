# Technical Builder OS

A local-first personal capability OS for the audited Technical Builder curriculum.

## What is included

- 14 learning phases
- 12 domains
- RC-4 curriculum dataset: 1,043 topic placements / 942 canonical concepts
- Course/resource library
- Dependency-aware syllabus
- Evidence-based mastery
- Smart overkill depth model
- Projects
- AI Lab
- Security
- Research Lab
- Builder / products
- Earning tracking
- Frontier tracker
- Mastery dashboard
- Portfolio
- Live clock
- No calendar and no fixed-date curriculum
- Local-first browser state
- Optional Supabase account/sync
- Capacitor Android packaging configuration

## PC

1. Install Node.js 22+.
2. Double-click `start.bat`.
3. The app waits for the server and opens `http://localhost:3001` automatically in your default browser.

Do not open `index.html` directly because the app loads `curriculum.json` using HTTP.

## Supabase

The app uses the existing Supabase project configured for the JEE ecosystem, but all new tables are prefixed `tbo_` and are isolated from `tracker_state`.

New tables:

- `tbo_user_settings`
- `tbo_topic_progress`
- `tbo_project_progress`
- `tbo_research_items`
- `tbo_frontier_items`
- `tbo_product_items`
- `tbo_notes`

RLS is enabled on every table and policies restrict rows to the authenticated user's own `user_id`.

See `SUPABASE-SCHEMA.sql` for the schema applied to the project.

## Sync model

The app is local-first.

Without an account:

`browser/device → localStorage`

With an account:

`local state ↔ Supabase`

Progress rows use `client_updated_at` and merge by latest client edit. Curriculum content is bundled locally and is not stored as mutable user data.

## Android

The repo contains Capacitor configuration and scripts.

Run:

`android-setup.bat`

once to install Capacitor, create the Android project and sync it.

Then:

`android-build.bat`

to build a debug APK.

Android Studio / Android SDK must be installed on the PC. The build environment used to prepare this package does not contain the Android SDK, so an APK binary is not included in this source package.

## Architecture

```text
                Technical Builder OS
                         │
          ┌──────────────┴──────────────┐
          │                             │
       PC Web                       Android APK
          │                             │
          └──────────────┬──────────────┘
                         │
                    local-first
                         │
                      Supabase
                         │
          ┌──────────────┼──────────────┐
          │              │              │
      curriculum      progress      projects/research
```

## Canonical information architecture

`Learning Phase`
→ `Domain`
→ `Module`
→ `Topic`

Courses and resources map onto topics.
Projects and assessments demonstrate topics.
Mastery is evidence, not course completion.

## Safety / security model

- Publishable Supabase key only; no service-role key is shipped in the client.
- RLS is enabled on all new user-data tables.
- User-data rows are limited to the authenticated user's own `user_id`.
- Security testing content is intended only for authorized labs/owned systems.

## Current build note

The PC server uses port `3001` by default so it does not collide with the JEE Tracker running on port `3000`. You can override the port with the `PORT` environment variable.

Capacitor 8 requires Node.js 22+ and Android Studio 2025.2.1+ for Android development.
