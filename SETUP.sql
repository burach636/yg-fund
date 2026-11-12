-- =====================================================================
--  YG Fund – Supabase setup.  Paste ALL of this into:
--  Supabase > SQL Editor > New query > Run
--  BEFORE running: change the e-mail and name on the line marked  <<<
-- =====================================================================

-- 1. Team: only these e-mails can see anything
create table if not exists public.team (
  email    text primary key,
  name     text not null,
  is_admin boolean not null default false,
  added_at timestamptz default now()
);
insert into public.team (email, name, is_admin)
values ('YOUR-EMAIL@gmail.com', 'YOUR NAME', true)          -- <<< change these two
on conflict (email) do nothing;

create or replace function public.is_team() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team where lower(email) = lower(auth.jwt() ->> 'email'));
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team where lower(email) = lower(auth.jwt() ->> 'email') and is_admin);
$$;

alter table public.team enable row level security;
drop policy if exists team_read on public.team;
drop policy if exists team_admin_ins on public.team;
drop policy if exists team_admin_upd on public.team;
drop policy if exists team_admin_del on public.team;
create policy team_read      on public.team for select to authenticated using (public.is_team());
create policy team_admin_ins on public.team for insert to authenticated with check (public.is_admin());
create policy team_admin_upd on public.team for update to authenticated using (public.is_admin());
create policy team_admin_del on public.team for delete to authenticated using (public.is_admin());

-- 2. Events: every change in the app (to-dos, notes, calls, settings) – append only
create table if not exists public.events (
  id   bigint generated always as identity primary key,
  k    text not null,
  eid  text not null,
  p    jsonb not null default '{}'::jsonb,
  by   text,
  at   timestamptz not null default now(),
  uid  uuid default auth.uid()
);
create index if not exists events_id_idx on public.events (id);
alter table public.events enable row level security;
drop policy if exists ev_read on public.events;
drop policy if exists ev_ins on public.events;
create policy ev_read on public.events for select to authenticated using (public.is_team());
create policy ev_ins  on public.events for insert to authenticated with check (public.is_team());

-- 3. JLS import info (one row)
create table if not exists public.jls_meta (
  id          int primary key default 1,
  version     bigint not null default 0,
  imported_at timestamptz,
  imported_by text,
  summary     jsonb
);
insert into public.jls_meta (id) values (1) on conflict do nothing;
alter table public.jls_meta enable row level security;
drop policy if exists jm_read on public.jls_meta;
drop policy if exists jm_upd on public.jls_meta;
create policy jm_read on public.jls_meta for select to authenticated using (public.is_team());
create policy jm_upd  on public.jls_meta for update to authenticated using (public.is_team());

-- 4. Private file storage for the imported JLS data
insert into storage.buckets (id, name, public) values ('jls', 'jls', false)
on conflict (id) do nothing;
drop policy if exists jls_read on storage.objects;
drop policy if exists jls_ins on storage.objects;
drop policy if exists jls_upd on storage.objects;
create policy jls_read on storage.objects for select to authenticated using (bucket_id = 'jls' and public.is_team());
create policy jls_ins  on storage.objects for insert to authenticated with check (bucket_id = 'jls' and public.is_team());
create policy jls_upd  on storage.objects for update to authenticated using (bucket_id = 'jls' and public.is_team());

-- Done.

-- 5. (v1.2) Private To-Do items: only the person who made them can read them
drop policy if exists ev_read on public.events;
create policy ev_read on public.events for select to authenticated
  using (public.is_team() and (coalesce(p->>'priv', 'false') <> 'true' or uid = auth.uid()));

-- 6. (v1.6) Cell phone per team member, for the SMS bot (only these numbers get answers)
alter table public.team add column if not exists phone text;

-- 7. (v1.10) Which main sections each user may open (null = all; admins always see all)
alter table public.team add column if not exists perms text[];
