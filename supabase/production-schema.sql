-- Run this script in a new Supabase project before connecting FORENX to live data.
-- This script defines the three-role pilot model. Do not use local demo records in production.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('System Admin', 'Investigator', 'Laboratory Analyst')),
  badge_id text not null unique,
  agency text not null,
  email text,
  account_status text not null default 'Active' check (account_status in ('Active', 'Inactive', 'Pending')),
  last_active_at timestamptz not null default now(),
  inactive_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.barcode_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  barcode_prefix text not null default 'FX',
  quantity integer not null check (quantity between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  requested_role text not null check (requested_role in ('Investigator', 'Laboratory Analyst')),
  badge_id text not null,
  agency text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text not null,
  request_type text not null check (request_type in ('Reactivation request', 'Sign-in issue', 'Other report')),
  message text not null check (char_length(message) between 5 and 2000),
  status text not null default 'Open' check (status in ('Open', 'Resolved')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.barcodes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.barcode_batches(id) on delete cascade,
  value text not null unique check (value ~ '^FX-[0-9]{6}$'),
  assigned_evidence_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.evidence (
  id text primary key check (id ~ '^EV-[0-9]{4}-[0-9]{4}$'),
  barcode text not null unique references public.barcodes(value),
  case_number text not null,
  offense_type text not null,
  item_category text not null,
  item_description text not null,
  recovery_at timestamptz not null,
  gps_coordinates text not null,
  location_details text not null,
  recovered_by uuid not null references public.profiles(id),
  investigator_signature_path text,
  lab_signature_path text,
  spatial_capture_status text not null default 'Not Started' check (spatial_capture_status in ('Not Started', 'Captured')),
  spatial_capture_preview_path text,
  status text not null default 'Draft' check (status in ('Draft', 'Logged', 'In Transit', 'In Lab Custody', 'Closed')),
  destination_lab text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.barcodes
  add constraint barcodes_evidence_link
  foreign key (assigned_evidence_id) references public.evidence(id) on delete set null;

create table if not exists public.custody_events (
  id uuid primary key default gen_random_uuid(),
  evidence_id text not null references public.evidence(id) on delete cascade,
  action text not null check (action in ('Evidence collected', 'Transfer started', 'Lab custody accepted', 'Status updated')),
  from_user uuid references public.profiles(id),
  to_user uuid references public.profiles(id),
  actor_role text not null check (actor_role in ('System Admin', 'Investigator', 'Laboratory Analyst')),
  occurred_at timestamptz not null default now(),
  location text not null,
  signature_path text,
  status text not null check (status in ('Draft', 'Logged', 'In Transit', 'In Lab Custody', 'Closed'))
);

create table if not exists public.custody_event_feed (
  id text primary key,
  evidence_id text not null,
  action text not null,
  from_user_name text not null,
  to_user_name text not null,
  actor_role text not null check (actor_role in ('System Admin', 'Investigator', 'Laboratory Analyst')),
  event_time text not null,
  location text not null,
  signature_data text not null default '',
  status text not null check (status in ('Draft', 'Logged', 'In Transit', 'In Lab Custody', 'Closed')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.evidence_media (
  id uuid primary key default gen_random_uuid(),
  evidence_id text not null references public.evidence(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  media_type text not null check (media_type in ('Photo', 'Spatial Capture', 'Document')),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists evidence_status_idx on public.evidence(status);
create index if not exists evidence_case_number_idx on public.evidence(case_number);
create index if not exists custody_events_evidence_idx on public.custody_events(evidence_id, occurred_at desc);
create index if not exists custody_event_feed_created_idx on public.custody_event_feed(created_at desc);
create index if not exists barcodes_batch_idx on public.barcodes(batch_id);
create index if not exists access_requests_status_idx on public.access_requests(status, created_at);
create index if not exists support_requests_status_idx on public.support_requests(status, created_at desc);

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and account_status = 'Active'
$$;

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'System Admin'
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.create_access_request_for_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'requested_role';
begin
  if requested_role in ('Investigator', 'Laboratory Analyst') then
    insert into public.access_requests (auth_user_id, full_name, email, requested_role, badge_id, agency)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Pending FORENX user'),
      new.email,
      requested_role,
      coalesce(nullif(new.raw_user_meta_data ->> 'badge_id', ''), 'PENDING-' || substr(new.id::text, 1, 8)),
      coalesce(nullif(new.raw_user_meta_data ->> 'agency', ''), 'Unassigned agency')
    )
    on conflict (auth_user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists create_access_request_for_signup on auth.users;
create trigger create_access_request_for_signup
after insert on auth.users
for each row execute procedure public.create_access_request_for_signup();

create or replace function public.approve_access_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.access_requests;
begin
  if not public.is_system_admin() then
    raise exception 'System Admin role required';
  end if;

  select * into request_row from public.access_requests where id = request_id for update;
  if request_row.id is null or request_row.status <> 'Pending' then
    raise exception 'Pending access request not found';
  end if;

  insert into public.profiles (id, full_name, role, badge_id, agency, email, account_status)
  values (
    request_row.auth_user_id,
    request_row.full_name,
    request_row.requested_role,
    request_row.badge_id,
    request_row.agency,
    request_row.email,
    'Active'
  );

  update public.access_requests
  set status = 'Approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = request_id;
end;
$$;

create or replace function public.reject_access_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_system_admin() then
    raise exception 'System Admin role required';
  end if;

  update public.access_requests
  set status = 'Rejected', reviewed_by = auth.uid(), reviewed_at = now()
  where id = request_id and status = 'Pending';
end;
$$;

create or replace function public.set_profile_account_status(target_user_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_system_admin() then
    raise exception 'System Admin role required';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'System Admin accounts cannot change their own access status';
  end if;

  if next_status not in ('Active', 'Inactive') then
    raise exception 'Invalid account status';
  end if;

  update public.profiles
  set account_status = next_status,
      inactive_since = case when next_status = 'Inactive' then now() else null end
  where id = target_user_id;

  if not found then
    raise exception 'User profile not found';
  end if;
end;
$$;

create or replace function public.touch_my_profile_activity()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set last_active_at = now()
  where id = auth.uid() and account_status = 'Active';
end;
$$;

create or replace function public.resolve_support_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_system_admin() then
    raise exception 'System Admin role required';
  end if;

  update public.support_requests
  set status = 'Resolved', resolved_by = auth.uid(), resolved_at = now()
  where id = request_id and status = 'Open';

  if not found then
    raise exception 'Open support request not found';
  end if;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists evidence_updated_at on public.evidence;
create trigger evidence_updated_at before update on public.evidence
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.barcode_batches enable row level security;
alter table public.access_requests enable row level security;
alter table public.support_requests enable row level security;
alter table public.barcodes enable row level security;
alter table public.evidence enable row level security;
alter table public.custody_events enable row level security;
alter table public.custody_event_feed enable row level security;
alter table public.evidence_media enable row level security;

create policy "profiles read own or admin"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_system_admin());

create policy "admins manage profiles"
on public.profiles for all to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

create policy "admins manage barcode batches"
on public.barcode_batches for all to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

create policy "applicants read own access request"
on public.access_requests for select to authenticated
using (auth_user_id = auth.uid() or public.is_system_admin());

create policy "admins manage access requests"
on public.access_requests for all to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

create policy "public submits support requests"
on public.support_requests for insert to anon, authenticated
with check (
  char_length(full_name) between 2 and 120
  and char_length(message) between 5 and 2000
  and request_type in ('Reactivation request', 'Sign-in issue', 'Other report')
);

create policy "admins manage support requests"
on public.support_requests for all to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

create policy "active users read shared custody feed"
on public.custody_event_feed for select to authenticated
using (public.current_role() is not null);

create policy "active users append shared custody feed"
on public.custody_event_feed for insert to authenticated
with check (created_by = auth.uid() and public.current_role() is not null);

grant execute on function public.approve_access_request(uuid) to authenticated;
grant execute on function public.reject_access_request(uuid) to authenticated;
grant execute on function public.set_profile_account_status(uuid, text) to authenticated;
grant execute on function public.touch_my_profile_activity() to authenticated;
grant execute on function public.resolve_support_request(uuid) to authenticated;
grant select, insert on public.custody_event_feed to authenticated;

create policy "authenticated users read barcodes"
on public.barcodes for select to authenticated
using (true);

create policy "admins manage barcodes"
on public.barcodes for all to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

create policy "authenticated users read evidence"
on public.evidence for select to authenticated
using (true);

create policy "investigators create their evidence"
on public.evidence for insert to authenticated
with check (public.current_role() = 'Investigator' and recovered_by = auth.uid() and status = 'Draft');

create policy "investigators update their evidence"
on public.evidence for update to authenticated
using (public.current_role() = 'Investigator' and recovered_by = auth.uid())
with check (public.current_role() = 'Investigator' and recovered_by = auth.uid());

create policy "laboratory accepts in-transit evidence"
on public.evidence for update to authenticated
using (public.current_role() = 'Laboratory Analyst' and status = 'In Transit')
with check (public.current_role() = 'Laboratory Analyst' and status = 'In Lab Custody');

create policy "admins read evidence"
on public.evidence for update to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

create policy "authenticated users read custody history"
on public.custody_events for select to authenticated
using (true);

create policy "investigator and lab write custody events"
on public.custody_events for insert to authenticated
with check (actor_role = public.current_role());

create policy "authenticated users read evidence media"
on public.evidence_media for select to authenticated
using (true);

create policy "investigators and lab upload evidence media"
on public.evidence_media for insert to authenticated
with check (uploaded_by = auth.uid() and public.current_role() in ('Investigator', 'Laboratory Analyst'));

-- Create private buckets through the Supabase Storage dashboard:
-- forenx-signatures and forenx-evidence-media.
-- Add Storage policies before accepting user uploads.
