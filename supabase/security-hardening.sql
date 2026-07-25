-- Run after enable-production-evidence-flow.sql.
-- This migration preserves existing rows and moves custody integrity into PostgreSQL.

begin;

-- Earlier pilot installs may not have the shared history projection yet.
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

create index if not exists custody_event_feed_created_idx
on public.custody_event_feed(created_at desc);

alter table public.custody_event_feed enable row level security;

-- Active role checks stay in the database. Browser state never decides permissions.
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.account_status = 'Active'
$$;

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_role() = 'System Admin'
$$;

revoke all on function public.current_role() from public;
revoke all on function public.is_system_admin() from public;
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_system_admin() to authenticated;

-- Reject malformed values for all new and updated evidence. Existing records remain unchanged.
alter table public.evidence drop constraint if exists evidence_barcode_format_check;
alter table public.evidence add constraint evidence_barcode_format_check
  check (barcode is null or barcode ~ '^FX-[0-9]{6}$') not valid;
alter table public.evidence drop constraint if exists evidence_case_number_length_check;
alter table public.evidence add constraint evidence_case_number_length_check
  check (case_number is null or char_length(case_number) between 1 and 80) not valid;
alter table public.evidence drop constraint if exists evidence_description_length_check;
alter table public.evidence add constraint evidence_description_length_check
  check (item_description is null or char_length(item_description) between 1 and 2000) not valid;
alter table public.evidence drop constraint if exists evidence_location_length_check;
alter table public.evidence add constraint evidence_location_length_check
  check (location_details is null or char_length(location_details) between 1 and 500) not valid;

-- Only this trusted procedure may rename a draft and bind an issued barcode.
create or replace function public.assign_barcode_to_evidence(draft_evidence_id text, scanned_barcode text)
returns public.evidence
language plpgsql
security definer
set search_path = public
as $$
declare
  draft_record public.evidence;
  assigned_record public.evidence;
  next_evidence_id text;
  normalized_barcode text := upper(trim(scanned_barcode));
begin
  if public.current_role() <> 'Investigator' then
    raise exception 'Investigator role required';
  end if;

  if normalized_barcode !~ '^FX-[0-9]{6}$' then
    raise exception 'Use a FORENX barcode in the FX-000000 format';
  end if;

  select * into draft_record
  from public.evidence
  where id = draft_evidence_id
    and recovered_by = auth.uid()
    and status = 'Draft'
  for update;

  if not found then
    raise exception 'Draft evidence record was not found';
  end if;

  if not exists (
    select 1 from public.barcodes
    where value = normalized_barcode and assigned_evidence_id is null
  ) then
    raise exception 'Barcode is unavailable or already assigned';
  end if;

  next_evidence_id := 'EV-' || to_char(current_date, 'YYYY') || '-' || right(normalized_barcode, 4);
  perform set_config('forenx.trusted_barcode_assignment', 'on', true);

  update public.evidence
  set id = next_evidence_id,
      barcode = normalized_barcode
  where id = draft_record.id
  returning * into assigned_record;

  update public.barcodes
  set assigned_evidence_id = next_evidence_id
  where value = normalized_barcode;

  return assigned_record;
end;
$$;

revoke all on function public.assign_barcode_to_evidence(text, text) from public;
grant execute on function public.assign_barcode_to_evidence(text, text) to authenticated;

-- This trigger blocks illegal workflow transitions even for direct PostgREST requests.
create or replace function public.enforce_evidence_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor_role text := public.current_role();
begin
  if tg_op = 'INSERT' then
    if actor_role <> 'Investigator' or new.recovered_by <> auth.uid() or new.status <> 'Draft' then
      raise exception 'Only an Investigator may create an owned Draft record';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if actor_role <> 'Investigator' or old.recovered_by <> auth.uid() or old.status <> 'Draft' then
      raise exception 'Only an Investigator may delete an owned Draft record';
    end if;
    return old;
  end if;

  if current_setting('forenx.trusted_barcode_assignment', true) = 'on' then
    return new;
  end if;

  if old.status = 'Closed' then
    raise exception 'Closed evidence is immutable';
  end if;

  if old.status = 'Draft' and new.status = 'Draft' then
    if actor_role <> 'Investigator' or old.recovered_by <> auth.uid() or new.recovered_by <> old.recovered_by then
      raise exception 'Only the owning Investigator may update a Draft record';
    end if;
    if new.id <> old.id or coalesce(new.barcode, '') <> coalesce(old.barcode, '') then
      raise exception 'Barcode assignment requires the approved barcode procedure';
    end if;
    return new;
  end if;

  if old.status = 'Draft' and new.status = 'Logged' then
    if actor_role <> 'Investigator' or old.recovered_by <> auth.uid() then
      raise exception 'Only the owning Investigator may log evidence';
    end if;
    if new.barcode is null or new.case_number is null or new.offense_type is null
      or new.item_category is null or new.item_description is null or new.recovery_at is null
      or new.gps_coordinates is null or new.location_details is null
      or new.investigator_signature_path is null or new.spatial_capture_status <> 'Captured' then
      raise exception 'Required collection details, capture, and signature are missing';
    end if;
    return new;
  end if;

  if old.status = 'Logged' and new.status = 'In Transit' then
    if actor_role <> 'Investigator' or old.recovered_by <> auth.uid() or nullif(trim(new.destination_lab), '') is null then
      raise exception 'Only the owning Investigator may transfer signed evidence to a destination lab';
    end if;
    return new;
  end if;

  if old.status = 'In Transit' and new.status = 'In Lab Custody' then
    if actor_role <> 'Laboratory Analyst' or new.lab_signature_path is null then
      raise exception 'Laboratory acceptance requires an active analyst and signature';
    end if;
    return new;
  end if;

  if old.status = 'In Lab Custody' and new.status = 'Closed' then
    if actor_role <> 'Laboratory Analyst' then
      raise exception 'Only a Laboratory Analyst may close lab custody';
    end if;
    return new;
  end if;

  raise exception 'Invalid evidence status transition';
end;
$$;

drop trigger if exists evidence_security_transition on public.evidence;
create trigger evidence_security_transition
before insert or update or delete on public.evidence
for each row execute procedure public.enforce_evidence_transition();

-- Server-generated audit records prevent client supplied times, actors, and status entries.
create or replace function public.append_custody_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_id uuid := gen_random_uuid();
  actor_name text;
  actor_role text := public.current_role();
  event_action text;
  source_name text;
  destination_name text;
  event_location text;
  signature_value text;
begin
  if old.status = new.status then
    return new;
  end if;

  select full_name into actor_name from public.profiles where id = auth.uid();

  if old.status = 'Draft' and new.status = 'Logged' then
    event_action := 'Evidence collected';
    source_name := 'Crime scene';
    destination_name := actor_name;
    event_location := new.location_details;
    signature_value := new.investigator_signature_path;
  elsif old.status = 'Logged' and new.status = 'In Transit' then
    event_action := 'Transfer started';
    source_name := actor_name;
    destination_name := new.destination_lab;
    event_location := 'Field transfer point';
    signature_value := new.investigator_signature_path;
  elsif old.status = 'In Transit' and new.status = 'In Lab Custody' then
    event_action := 'Lab custody accepted';
    source_name := coalesce(new.recovered_by_name, 'Assigned investigator');
    destination_name := actor_name;
    event_location := 'Forensic Lab';
    signature_value := new.lab_signature_path;
  elsif old.status = 'In Lab Custody' and new.status = 'Closed' then
    event_action := 'Evidence closed';
    source_name := actor_name;
    destination_name := 'Evidence archive';
    event_location := 'Forensic Lab';
    signature_value := new.lab_signature_path;
  else
    raise exception 'Unsupported custody transition';
  end if;

  insert into public.custody_events (
    id, evidence_id, action, from_user, to_user, actor_role, occurred_at, location, signature_path, status
  ) values (
    event_id,
    new.id,
    event_action,
    case when actor_role = 'Investigator' then auth.uid() else new.recovered_by end,
    case when actor_role = 'Laboratory Analyst' then auth.uid() else null end,
    actor_role,
    now(),
    event_location,
    signature_value,
    new.status
  );

  insert into public.custody_event_feed (
    id, evidence_id, action, from_user_name, to_user_name, actor_role, event_time, location, signature_data, status, created_by
  ) values (
    event_id::text,
    new.id,
    event_action,
    source_name,
    destination_name,
    actor_role,
    to_char(now(), 'FMMonth FMDD, YYYY HH12:MI AM'),
    event_location,
    coalesce(signature_value, ''),
    new.status,
    auth.uid()
  );

  return new;
end;
$$;

drop trigger if exists evidence_custody_audit on public.evidence;
create trigger evidence_custody_audit
after update on public.evidence
for each row execute procedure public.append_custody_transition();

-- Direct inserts or edits would permit forged audit history, so only the trigger writes these tables.
drop policy if exists "active users append shared custody feed" on public.custody_event_feed;
drop policy if exists "investigator and lab write custody events" on public.custody_events;
revoke insert, update, delete on public.custody_event_feed from authenticated;
revoke insert, update, delete on public.custody_events from authenticated;

-- Replace broad read policies with least-privilege evidence access.
drop policy if exists "authenticated users read evidence" on public.evidence;
drop policy if exists "investigators create their evidence" on public.evidence;
drop policy if exists "investigators update their evidence" on public.evidence;
drop policy if exists "laboratory accepts in-transit evidence" on public.evidence;
drop policy if exists "laboratory closes evidence" on public.evidence;
drop policy if exists "admins read evidence" on public.evidence;
drop policy if exists "investigators delete their drafts" on public.evidence;

create policy "secure evidence read"
on public.evidence for select to authenticated
using (
  public.is_system_admin()
  or (public.current_role() = 'Investigator' and recovered_by = auth.uid())
  or (public.current_role() = 'Laboratory Analyst' and status in ('In Transit', 'In Lab Custody', 'Closed'))
);

create policy "secure investigator evidence insert"
on public.evidence for insert to authenticated
with check (public.current_role() = 'Investigator' and recovered_by = auth.uid() and status = 'Draft');

create policy "secure investigator evidence update"
on public.evidence for update to authenticated
using (public.current_role() = 'Investigator' and recovered_by = auth.uid())
with check (public.current_role() = 'Investigator' and recovered_by = auth.uid());

create policy "secure laboratory evidence update"
on public.evidence for update to authenticated
using (public.current_role() = 'Laboratory Analyst' and status in ('In Transit', 'In Lab Custody'))
with check (public.current_role() = 'Laboratory Analyst');

create policy "secure investigator draft delete"
on public.evidence for delete to authenticated
using (public.current_role() = 'Investigator' and recovered_by = auth.uid() and status = 'Draft');

drop policy if exists "active users read shared custody feed" on public.custody_event_feed;
create policy "secure custody feed read"
on public.custody_event_feed for select to authenticated
using (
  public.is_system_admin()
  or exists (
    select 1 from public.evidence e
    where e.id = custody_event_feed.evidence_id
      and (
        (public.current_role() = 'Investigator' and e.recovered_by = auth.uid())
        or (public.current_role() = 'Laboratory Analyst' and e.status in ('In Transit', 'In Lab Custody', 'Closed'))
      )
  )
);

drop policy if exists "authenticated users read custody history" on public.custody_events;
create policy "secure custody event read"
on public.custody_events for select to authenticated
using (
  public.is_system_admin()
  or exists (
    select 1 from public.evidence e
    where e.id = custody_events.evidence_id
      and (
        (public.current_role() = 'Investigator' and e.recovered_by = auth.uid())
        or (public.current_role() = 'Laboratory Analyst' and e.status in ('In Transit', 'In Lab Custody', 'Closed'))
      )
  )
);

commit;
