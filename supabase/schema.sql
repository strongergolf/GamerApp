-- StrongerGolf: your data in your own Supabase project. Same script as Settings -> The App -> Your Data -> Cloud.
-- See src/state/cloud.js (SG_SCHEMA_SQL) for the copy the app shows.
-- StrongerGolf: your data in your own Supabase project.
-- Run once in the Supabase SQL editor. Safe to run again.
create table if not exists public.player_docs (
  user_id    uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  profile_id text   not null,
  name       text,
  doc        jsonb  not null,
  saved_at   bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id)
);
create table if not exists public.player_snapshots (
  id         bigint generated always as identity primary key,
  user_id    uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  profile_id text   not null,
  kind       text   not null,
  taken_at   bigint not null,
  doc        jsonb  not null,
  created_at timestamptz not null default now()
);
create index if not exists player_snapshots_by_profile on public.player_snapshots (user_id, profile_id, taken_at desc);
alter table public.player_docs      enable row level security;
alter table public.player_snapshots enable row level security;
drop policy if exists "own docs" on public.player_docs;
create policy "own docs" on public.player_docs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own snapshots" on public.player_snapshots;
create policy "own snapshots" on public.player_snapshots for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
