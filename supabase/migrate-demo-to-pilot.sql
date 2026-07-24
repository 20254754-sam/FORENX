-- Run this script only in a Supabase project where the earlier FORENX demo schema
-- from supabase/schema.sql already exists. Run production-schema.sql after this script.
-- Legacy text fields stay in place so demo history remains readable.

begin;

alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'System Admin' where role = 'Admin';
alter table public.profiles
  add column if not exists account_status text not null default 'Active',
  add column if not exists updated_at timestamptz not null default now();
alter table public.profiles
  add constraint profiles_role_check check (role in ('System Admin', 'Investigator', 'Laboratory Analyst'));
alter table public.profiles
  add constraint profiles_account_status_check check (account_status in ('Active', 'Inactive', 'Pending'));

alter table public.evidence
  add column if not exists case_number text,
  add column if not exists offense_type text,
  add column if not exists item_category text,
  add column if not exists item_description text,
  add column if not exists recovery_at timestamptz,
  add column if not exists gps_coordinates text,
  add column if not exists location_details text,
  add column if not exists recovered_by uuid references public.profiles(id),
  add column if not exists investigator_signature_path text,
  add column if not exists lab_signature_path text,
  add column if not exists spatial_capture_status text not null default 'Not Started',
  add column if not exists spatial_capture_preview_path text,
  add column if not exists destination_lab text,
  add column if not exists legacy_status text;

update public.evidence
set
  case_number = coalesce(nullif(case_number, ''), 'LEGACY-' || id),
  offense_type = coalesce(nullif(offense_type, ''), evidence_type),
  item_category = coalesce(nullif(item_category, ''), category),
  item_description = coalesce(nullif(item_description, ''), description),
  recovery_at = coalesce(recovery_at, created_at),
  gps_coordinates = coalesce(nullif(gps_coordinates, ''), gps_location),
  location_details = coalesce(nullif(location_details, ''), 'Legacy location record'),
  recovered_by = coalesce(recovered_by, owner_id),
  spatial_capture_status = case when spatial_capture_status = '' then 'Not Started' else spatial_capture_status end;

update public.evidence
set legacy_status = status
where status not in ('Draft', 'Logged', 'In Transit', 'In Lab Custody', 'Closed')
  and legacy_status is null;

update public.evidence
set status = case
  when status in ('Draft', 'Logged', 'In Transit', 'In Lab Custody', 'Closed') then status
  when lower(trim(status)) in ('collected', 'evidence collected', 'new') then 'Logged'
  when lower(trim(status)) in ('pending', 'pending review', 'unprocessed') then 'Draft'
  when lower(trim(status)) like '%transit%' then 'In Transit'
  when lower(trim(status)) like '%lab%' then 'In Lab Custody'
  when lower(trim(status)) like '%custody%' then 'In Lab Custody'
  when lower(trim(status)) like '%receiv%' then 'In Lab Custody'
  when lower(trim(status)) like '%clos%' then 'Closed'
  else 'Draft'
end;

alter table public.evidence drop constraint if exists evidence_status_check;
alter table public.evidence
  add constraint evidence_status_check check (status in ('Draft', 'Logged', 'In Transit', 'In Lab Custody', 'Closed'));
alter table public.evidence drop constraint if exists evidence_spatial_capture_status_check;
alter table public.evidence
  add constraint evidence_spatial_capture_status_check check (spatial_capture_status in ('Not Started', 'Captured'));

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'custody_events' and column_name = 'from_user'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'custody_events' and column_name = 'from_user_name'
  ) then
    alter table public.custody_events rename column from_user to from_user_name;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'custody_events' and column_name = 'to_user'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'custody_events' and column_name = 'to_user_name'
  ) then
    alter table public.custody_events rename column to_user to to_user_name;
  end if;
end $$;

alter table public.custody_events
  add column if not exists actor_role text,
  add column if not exists occurred_at timestamptz,
  add column if not exists signature_path text,
  add column if not exists from_user uuid references public.profiles(id),
  add column if not exists to_user uuid references public.profiles(id);

update public.custody_events
set
  actor_role = coalesce(
    nullif(actor_role, ''),
    case when action ilike 'Lab%' then 'Laboratory Analyst' else 'Investigator' end
  ),
  occurred_at = coalesce(occurred_at, created_at);

alter table public.custody_events drop constraint if exists custody_events_actor_role_check;
alter table public.custody_events
  add constraint custody_events_actor_role_check check (actor_role in ('System Admin', 'Investigator', 'Laboratory Analyst'));

drop policy if exists "profiles read own" on public.profiles;
drop policy if exists "profiles admin read" on public.profiles;
drop policy if exists "evidence read authenticated" on public.evidence;
drop policy if exists "evidence insert authenticated" on public.evidence;
drop policy if exists "evidence update authenticated" on public.evidence;
drop policy if exists "custody read authenticated" on public.custody_events;
drop policy if exists "custody insert authenticated" on public.custody_events;

commit;
