-- Run after security-hardening.sql. This only adds optional guided-tour state.
begin;

alter table public.profiles
  add column if not exists tour_dismissed_at timestamptz,
  add column if not exists tour_completed_at timestamptz;

-- The active account can read only its own tour state. Roles stay in profiles.
create or replace function public.get_my_tour_state()
returns table(tour_dismissed_at timestamptz, tour_completed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  select p.tour_dismissed_at, p.tour_completed_at
  from public.profiles p
  where p.id = auth.uid()
    and p.account_status = 'Active';
end;
$$;

-- This accepts a fixed state list and never writes evidence or custody data.
create or replace function public.record_my_tour_response(response text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if response not in ('dismissed', 'completed') then
    raise exception 'Invalid tour response';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'Active'
  ) then
    raise exception 'Active account required';
  end if;

  update public.profiles
  set tour_dismissed_at = case
        when response = 'dismissed' then coalesce(tour_dismissed_at, now())
        else tour_dismissed_at
      end,
      tour_completed_at = case
        when response = 'completed' then now()
        else tour_completed_at
      end
  where id = auth.uid();
end;
$$;

revoke all on function public.get_my_tour_state() from public;
revoke all on function public.record_my_tour_response(text) from public;
grant execute on function public.get_my_tour_state() to authenticated;
grant execute on function public.record_my_tour_response(text) to authenticated;

commit;
