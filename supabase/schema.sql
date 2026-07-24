create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('Investigator', 'Admin')),
  badge_id text not null,
  agency text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.evidence (
  id text primary key,
  barcode text not null unique,
  evidence_type text not null,
  category text not null,
  subtype text not null,
  serial_number text not null,
  description text not null,
  collector text not null,
  collected_at_text text not null,
  gps_location text not null,
  status text not null,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.custody_events (
  id uuid primary key default gen_random_uuid(),
  evidence_id text not null references public.evidence(id) on delete cascade,
  action text not null,
  from_user text not null,
  to_user text not null,
  event_time_text text not null,
  location text not null,
  signature_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.evidence enable row level security;
alter table public.custody_events enable row level security;

create policy "profiles read own"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "profiles admin read"
on public.profiles for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'Admin'
  )
);

create policy "evidence read authenticated"
on public.evidence for select
to authenticated
using (true);

create policy "evidence insert authenticated"
on public.evidence for insert
to authenticated
with check (true);

create policy "evidence update authenticated"
on public.evidence for update
to authenticated
using (true)
with check (true);

create policy "custody read authenticated"
on public.custody_events for select
to authenticated
using (true);

create policy "custody insert authenticated"
on public.custody_events for insert
to authenticated
with check (true);
