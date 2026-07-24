-- Run this once in the existing FORENX Supabase project.
-- It adds self-service Investigator and Laboratory Analyst signup requests.

begin;

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles
  add constraint profiles_account_status_check check (account_status in ('Active', 'Inactive', 'Pending'));
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists last_active_at timestamptz not null default now();
alter table public.profiles add column if not exists inactive_since timestamptz;
update public.profiles
set inactive_since = now()
where account_status = 'Inactive' and inactive_since is null;
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and account_status = 'Active'
$$;

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

create index if not exists access_requests_status_idx on public.access_requests(status, created_at);

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

create index if not exists support_requests_status_idx on public.support_requests(status, created_at desc);

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

create index if not exists custody_event_feed_created_idx on public.custody_event_feed(created_at desc);

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

alter table public.access_requests enable row level security;

drop policy if exists "applicants read own access request" on public.access_requests;
create policy "applicants read own access request"
on public.access_requests for select to authenticated
using (auth_user_id = auth.uid() or public.is_system_admin());

drop policy if exists "admins manage access requests" on public.access_requests;
create policy "admins manage access requests"
on public.access_requests for all to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

grant execute on function public.approve_access_request(uuid) to authenticated;
grant execute on function public.reject_access_request(uuid) to authenticated;

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

grant execute on function public.set_profile_account_status(uuid, text) to authenticated;

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

alter table public.support_requests enable row level security;
alter table public.custody_event_feed enable row level security;

drop policy if exists "public submits support requests" on public.support_requests;
create policy "public submits support requests"
on public.support_requests for insert to anon, authenticated
with check (
  char_length(full_name) between 2 and 120
  and char_length(message) between 5 and 2000
  and request_type in ('Reactivation request', 'Sign-in issue', 'Other report')
);

drop policy if exists "admins manage support requests" on public.support_requests;
create policy "admins manage support requests"
on public.support_requests for all to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

drop policy if exists "active users read shared custody feed" on public.custody_event_feed;
create policy "active users read shared custody feed"
on public.custody_event_feed for select to authenticated
using (public.current_role() is not null);

drop policy if exists "active users append shared custody feed" on public.custody_event_feed;
create policy "active users append shared custody feed"
on public.custody_event_feed for insert to authenticated
with check (created_by = auth.uid() and public.current_role() is not null);

grant execute on function public.touch_my_profile_activity() to authenticated;
grant execute on function public.resolve_support_request(uuid) to authenticated;
grant select, insert on public.custody_event_feed to authenticated;

commit;
