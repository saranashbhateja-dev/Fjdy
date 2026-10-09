-- Technical Builder OS initial schema.
-- Applied to the existing Supabase project under tbo_* names.
-- Does not modify the existing JEE tracker_state table.

create or replace function public.tbo_set_server_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;

create table if not exists public.tbo_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  theme text not null default 'system' check (theme in ('system','light','dark')),
  current_section text not null default 'dashboard',
  compact_mode boolean not null default false,
  created_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

create table if not exists public.tbo_topic_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id text not null,
  status text not null default 'AVAILABLE' check (status in ('LOCKED','AVAILABLE','LEARNING','PRACTICING','BUILDING','ASSESSED','MASTERED')),
  knowledge boolean not null default false,
  problems boolean not null default false,
  derivation boolean not null default false,
  implementation boolean not null default false,
  project boolean not null default false,
  assessment boolean not null default false,
  transfer boolean not null default false,
  depth_level text not null default 'FOUNDATION' check (depth_level in ('FOUNDATION','STRONG','ADVANCED','OVERKILL','FRONTIER')),
  notes text not null default '',
  client_updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, concept_id)
);

create table if not exists public.tbo_project_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  status text not null default 'NOT_STARTED' check (status in ('NOT_STARTED','IN_PROGRESS','SHIPPED','ABANDONED')),
  notes text not null default '',
  proof_url text not null default '',
  client_updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create table if not exists public.tbo_research_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  stage text not null default 'IDEA' check (stage in ('IDEA','QUESTION','LITERATURE','REPRODUCTION','BASELINE','EXPERIMENT','EXTENSION','NOVEL_RESULT','WRITEUP','RELEASED')),
  question text not null default '',
  hypothesis text not null default '',
  notes text not null default '',
  artifact_url text not null default '',
  created_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

create table if not exists public.tbo_frontier_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  frontier_key text not null,
  status text not null default 'WATCH' check (status in ('WATCH','EXPLORE','DEEPEN','PROMOTE','ARCHIVE')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  unique(user_id, frontier_key)
);

create table if not exists public.tbo_product_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  stage text not null default 'IDEA' check (stage in ('IDEA','EXPERIMENT','MVP','USERS','REVENUE','PRODUCT','OWNERSHIP','SCALE','ARCHIVED')),
  description text not null default '',
  url text not null default '',
  revenue numeric(14,2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

create table if not exists public.tbo_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('TOPIC','PROJECT','COURSE','RESEARCH','FRONTIER','PRODUCT','GENERAL')),
  entity_id text not null default '',
  title text not null default '',
  content text not null default '',
  created_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

-- Enable RLS before granting authenticated access.
alter table public.tbo_user_settings enable row level security;
alter table public.tbo_topic_progress enable row level security;
alter table public.tbo_project_progress enable row level security;
alter table public.tbo_research_items enable row level security;
alter table public.tbo_frontier_items enable row level security;
alter table public.tbo_product_items enable row level security;
alter table public.tbo_notes enable row level security;

-- Policies are created by the migration used for the packaged app.

-- Ownership policies. Every table is user-private.
drop policy if exists "tbo_settings_select_own" on public.tbo_user_settings;
create policy "tbo_settings_select_own" on public.tbo_user_settings for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "tbo_settings_insert_own" on public.tbo_user_settings;
create policy "tbo_settings_insert_own" on public.tbo_user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "tbo_settings_update_own" on public.tbo_user_settings;
create policy "tbo_settings_update_own" on public.tbo_user_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "tbo_settings_delete_own" on public.tbo_user_settings;
create policy "tbo_settings_delete_own" on public.tbo_user_settings for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "tbo_topic_select_own" on public.tbo_topic_progress;
create policy "tbo_topic_select_own" on public.tbo_topic_progress for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "tbo_topic_insert_own" on public.tbo_topic_progress;
create policy "tbo_topic_insert_own" on public.tbo_topic_progress for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "tbo_topic_update_own" on public.tbo_topic_progress;
create policy "tbo_topic_update_own" on public.tbo_topic_progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "tbo_topic_delete_own" on public.tbo_topic_progress;
create policy "tbo_topic_delete_own" on public.tbo_topic_progress for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "tbo_project_select_own" on public.tbo_project_progress;
create policy "tbo_project_select_own" on public.tbo_project_progress for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "tbo_project_insert_own" on public.tbo_project_progress;
create policy "tbo_project_insert_own" on public.tbo_project_progress for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "tbo_project_update_own" on public.tbo_project_progress;
create policy "tbo_project_update_own" on public.tbo_project_progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "tbo_project_delete_own" on public.tbo_project_progress;
create policy "tbo_project_delete_own" on public.tbo_project_progress for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "tbo_research_select_own" on public.tbo_research_items;
create policy "tbo_research_select_own" on public.tbo_research_items for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "tbo_research_insert_own" on public.tbo_research_items;
create policy "tbo_research_insert_own" on public.tbo_research_items for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "tbo_research_update_own" on public.tbo_research_items;
create policy "tbo_research_update_own" on public.tbo_research_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "tbo_research_delete_own" on public.tbo_research_items;
create policy "tbo_research_delete_own" on public.tbo_research_items for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "tbo_frontier_select_own" on public.tbo_frontier_items;
create policy "tbo_frontier_select_own" on public.tbo_frontier_items for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "tbo_frontier_insert_own" on public.tbo_frontier_items;
create policy "tbo_frontier_insert_own" on public.tbo_frontier_items for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "tbo_frontier_update_own" on public.tbo_frontier_items;
create policy "tbo_frontier_update_own" on public.tbo_frontier_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "tbo_frontier_delete_own" on public.tbo_frontier_items;
create policy "tbo_frontier_delete_own" on public.tbo_frontier_items for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "tbo_product_select_own" on public.tbo_product_items;
create policy "tbo_product_select_own" on public.tbo_product_items for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "tbo_product_insert_own" on public.tbo_product_items;
create policy "tbo_product_insert_own" on public.tbo_product_items for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "tbo_product_update_own" on public.tbo_product_items;
create policy "tbo_product_update_own" on public.tbo_product_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "tbo_product_delete_own" on public.tbo_product_items;
create policy "tbo_product_delete_own" on public.tbo_product_items for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "tbo_notes_select_own" on public.tbo_notes;
create policy "tbo_notes_select_own" on public.tbo_notes for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "tbo_notes_insert_own" on public.tbo_notes;
create policy "tbo_notes_insert_own" on public.tbo_notes for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "tbo_notes_update_own" on public.tbo_notes;
create policy "tbo_notes_update_own" on public.tbo_notes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "tbo_notes_delete_own" on public.tbo_notes;
create policy "tbo_notes_delete_own" on public.tbo_notes for delete to authenticated using ((select auth.uid()) = user_id);

-- Data API privileges. RLS remains the row-level boundary.
grant select, insert, update, delete on public.tbo_user_settings to authenticated;
grant select, insert, update, delete on public.tbo_topic_progress to authenticated;
grant select, insert, update, delete on public.tbo_project_progress to authenticated;
grant select, insert, update, delete on public.tbo_research_items to authenticated;
grant select, insert, update, delete on public.tbo_frontier_items to authenticated;
grant select, insert, update, delete on public.tbo_product_items to authenticated;
grant select, insert, update, delete on public.tbo_notes to authenticated;
