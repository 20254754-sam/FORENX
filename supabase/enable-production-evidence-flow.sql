-- Run this after production-schema.sql.
-- It enables durable investigator drafts and secure barcode assignment.

alter table public.evidence
  alter column barcode drop not null,
  alter column case_number drop not null,
  alter column offense_type drop not null,
  alter column item_category drop not null,
  alter column item_description drop not null,
  alter column recovery_at drop not null,
  alter column gps_coordinates drop not null,
  alter column location_details drop not null;

do $$
declare
  legacy_column text;
begin
  foreach legacy_column in array array[
    'evidence_type',
    'category',
    'subtype',
    'serial_number',
    'description',
    'collector',
    'collected_at_text',
    'gps_location'
  ] loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'evidence'
        and column_name = legacy_column
    ) then
      execute format('alter table public.evidence alter column %I drop not null', legacy_column);
    end if;
  end loop;
end;
$$;

alter table public.evidence
  add column if not exists recovered_by_name text,
  add column if not exists three_d_capture_requested boolean not null default false,
  add column if not exists spatial_capture_note text;

alter table public.evidence drop constraint if exists evidence_id_check;
alter table public.evidence
  add constraint evidence_id_check
  check (id ~ '^EV-(DRAFT-[0-9]{6}|[0-9]{4}-[0-9]{4})$');

create or replace function public.generate_barcode_batch(requested_quantity integer)
returns table (batch_id uuid, barcode_value text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_batch_id uuid;
  start_number integer;
  item_number integer;
begin
  if not public.is_system_admin() then
    raise exception 'System Admin role required';
  end if;

  if requested_quantity < 1 or requested_quantity > 500 then
    raise exception 'Barcode quantity must be between 1 and 500';
  end if;

  select coalesce(max(substring(value from 4)::integer), 100) + 1
  into start_number
  from public.barcodes;

  insert into public.barcode_batches (created_by, quantity)
  values (auth.uid(), requested_quantity)
  returning id into new_batch_id;

  for item_number in 0..requested_quantity - 1 loop
    insert into public.barcodes (batch_id, value)
    values (new_batch_id, 'FX-' || lpad((start_number + item_number)::text, 6, '0'));
  end loop;

  return query
  select new_batch_id, barcode.value, now()
  from public.barcodes as barcode
  where barcode.batch_id = new_batch_id
  order by barcode.value;
end;
$$;

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
    select 1
    from public.barcodes
    where value = normalized_barcode
      and assigned_evidence_id is null
  ) then
    raise exception 'Barcode is unavailable or already assigned';
  end if;

  next_evidence_id := 'EV-' || to_char(current_date, 'YYYY') || '-' || right(normalized_barcode, 4);

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

grant execute on function public.generate_barcode_batch(integer) to authenticated;
grant execute on function public.assign_barcode_to_evidence(text, text) to authenticated;

alter table public.custody_events drop constraint if exists custody_events_action_check;
alter table public.custody_events
  add constraint custody_events_action_check
  check (action in ('Evidence collected', 'Transfer started', 'Lab custody accepted', 'Evidence closed', 'Status updated'));

drop policy if exists "laboratory closes evidence" on public.evidence;
create policy "laboratory closes evidence"
on public.evidence for update to authenticated
using (public.current_role() = 'Laboratory Analyst' and status = 'In Lab Custody')
with check (public.current_role() = 'Laboratory Analyst' and status = 'Closed');

drop policy if exists "investigators delete their drafts" on public.evidence;
create policy "investigators delete their drafts"
on public.evidence for delete to authenticated
using (public.current_role() = 'Investigator' and recovered_by = auth.uid() and status = 'Draft');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('forenx-evidence-media', 'forenx-evidence-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']),
  ('forenx-signatures', 'forenx-signatures', false, 2097152, array['image/png'])
on conflict (id) do nothing;

drop policy if exists "active users read FORENX evidence files" on storage.objects;
create policy "active users read FORENX evidence files"
on storage.objects for select to authenticated
using (
  bucket_id in ('forenx-evidence-media', 'forenx-signatures')
  and public.current_role() is not null
);

drop policy if exists "field users upload FORENX evidence files" on storage.objects;
create policy "field users upload FORENX evidence files"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('forenx-evidence-media', 'forenx-signatures')
  and public.current_role() in ('Investigator', 'Laboratory Analyst')
  and owner_id = auth.uid()::text
);

drop policy if exists "owners delete FORENX evidence files" on storage.objects;
create policy "owners delete FORENX evidence files"
on storage.objects for delete to authenticated
using (
  bucket_id in ('forenx-evidence-media', 'forenx-signatures')
  and owner_id = auth.uid()::text
);
