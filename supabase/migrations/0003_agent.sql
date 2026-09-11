-- ============================================================================
-- CMS Lab — agent support, project links on meetings, publications, digests
-- ============================================================================

-- Meetings can be about a project; PI gets an AI brief before each one.
alter table meetings
  add column project_id         uuid references projects (id) on delete set null,
  add column pi_brief           text,
  add column brief_generated_at timestamptz;

alter table meeting_notes
  add column next_focus text,
  add column extracted_at timestamptz,
  add constraint meeting_notes_one_per_meeting unique (meeting_id);

-- Both participants may edit the shared notes document.
drop policy "notes: update" on meeting_notes;
create policy "notes: update" on meeting_notes for update to authenticated using (
  is_pi() or exists (select 1 from meetings m where m.id = meeting_id and m.requester_id = auth.uid())
);

-- Membership check without self-referencing RLS (which Postgres rejects as recursive).
create or replace function is_project_member(p uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from project_members where project_id = p and profile_id = auth.uid());
$$;
grant execute on function is_project_member(uuid) to authenticated;

drop policy "members managed" on project_members;
create policy "members managed" on project_members for all to authenticated
  using (is_pi() or is_project_member(project_id)) with check (is_active_member());
drop policy "projects edit" on projects;
create policy "projects edit" on projects for update to authenticated using (is_pi() or is_project_member(id));

-- Project members see each other's action items and weekly updates for shared projects.
create policy "items: project members" on action_items for select to authenticated
  using (project_id is not null and is_project_member(project_id));
create policy "updates: project members" on weekly_updates for select to authenticated
  using (project_id is not null and is_project_member(project_id));

-- Weekly / on-demand "state of the lab" digests (PI only).
create table digests (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'weekly',
  content    text not null,
  created_at timestamptz not null default now()
);
alter table digests enable row level security;
create policy "digests PI only" on digests for all to authenticated using (is_pi()) with check (is_pi());

-- Ask-the-lab history so answers can be revisited.
create table agent_queries (
  id         uuid primary key default gen_random_uuid(),
  asked_by   uuid not null references profiles (id),
  question   text not null,
  answer     text,
  created_at timestamptz not null default now()
);
alter table agent_queries enable row level security;
create policy "own queries" on agent_queries for select to authenticated using (asked_by = auth.uid() or is_pi());

-- Publications: paste a DOI, metadata is fetched from Crossref in the browser.
create table publications (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  authors     text,
  journal     text,
  year        int,
  doi         text unique,
  url         text,
  arxiv_id    text,
  status      text not null default 'published' check (status in ('preprint','published')),
  project_id  uuid references projects (id) on delete set null,
  added_by    uuid references profiles (id),
  created_at  timestamptz not null default now()
);
alter table publications enable row level security;
create policy "pubs readable"  on publications for select to authenticated using (is_active_member());
create policy "pubs insert"    on publications for insert to authenticated with check (is_active_member());
create policy "pubs update"    on publications for update to authenticated using (is_pi() or added_by = auth.uid());
create policy "pubs delete"    on publications for delete to authenticated using (is_pi() or added_by = auth.uid());

-- Allow members to link a project when booking.
create or replace function book_meeting(
  p_start  timestamptz,
  p_end    timestamptz,
  p_mode   meeting_mode,
  p_type   meeting_type,
  p_agenda text,
  p_project uuid default null
) returns meetings
language plpgsql security definer set search_path = public as $$
declare
  s        lab_settings%rowtype;
  r        availability_rules%rowtype;
  v_host   uuid;
  v_local_start timestamp;
  v_local_end   timestamp;
  v_rule_ok boolean := false;
  v_location text;
  m        meetings%rowtype;
begin
  if not is_active_member() then
    raise exception 'Your account is not active yet.' using errcode = '42501';
  end if;

  select * into s from lab_settings where id = 1;
  v_host := pi_id();
  if v_host is null then raise exception 'No active PI account found.'; end if;

  if p_start < now() + make_interval(hours => s.min_notice_hours) then
    raise exception 'Slots must be booked at least % hours in advance.', s.min_notice_hours;
  end if;
  if p_start > now() + make_interval(days => s.booking_horizon_days) then
    raise exception 'You can only book up to % days ahead.', s.booking_horizon_days;
  end if;

  v_local_start := p_start at time zone s.timezone;
  v_local_end   := p_end   at time zone s.timezone;

  for r in
    select * from availability_rules
    where active
      and weekday = extract(dow from v_local_start)::int
      and v_local_start::time >= start_time
      and v_local_end::time   <= end_time
      and (mode = 'both' or mode = p_mode::text)
  loop
    if v_local_end - v_local_start = make_interval(mins => r.slot_minutes)
       and (extract(epoch from (v_local_start::time - r.start_time))::int % (r.slot_minutes * 60)) = 0
    then
      v_rule_ok := true; v_location := r.location; exit;
    end if;
  end loop;

  if not v_rule_ok then
    select true into v_rule_ok from availability_blocks
    where kind = 'open' and start_at <= p_start and end_at >= p_end limit 1;
  end if;
  if not coalesce(v_rule_ok, false) then
    raise exception 'That time is not within the PI''s available hours.';
  end if;
  if exists (select 1 from availability_blocks
             where kind = 'blocked' and tstzrange(start_at, end_at) && tstzrange(p_start, p_end)) then
    raise exception 'The PI is unavailable at that time.';
  end if;

  begin
    insert into meetings (host_id, requester_id, start_at, end_at, mode, type, agenda, location, project_id)
    values (v_host, auth.uid(), p_start, p_end, p_mode, p_type, p_agenda,
            case when p_mode = 'offline' then coalesce(v_location, s.default_location) else null end,
            p_project)
    returning * into m;
  exception when exclusion_violation then
    raise exception 'Sorry, that slot was just taken by someone else.' using errcode = '23P01';
  end;
  return m;
end $$;
grant execute on function book_meeting(timestamptz, timestamptz, meeting_mode, meeting_type, text, uuid) to authenticated;

-- Members may see meetings on projects they belong to (for the project page).
create policy "project members see project meetings" on meetings for select to authenticated using (
  project_id is not null and exists (
    select 1 from project_members pm where pm.project_id = meetings.project_id and pm.profile_id = auth.uid())
);

-- Members can mark their own past meetings completed (used by the notes flow).
create policy "requester completes own meeting" on meetings for update to authenticated
  using (requester_id = auth.uid()) with check (requester_id = auth.uid());

-- Weekly-update summary for the PI: who has / hasn't posted this week.
create or replace view weekly_update_status with (security_invoker = true) as
  select p.id as profile_id, p.full_name, p.email, p.role,
         bool_or(w.id is not null) as submitted,
         max(w.created_at) as last_update
  from profiles p
  left join weekly_updates w
    on w.author_id = p.id and w.week_start = date_trunc('week', (now() at time zone (select timezone from lab_settings where id = 1)))::date
  where p.status = 'active' and p.role <> 'pi'
  group by p.id;
grant select on weekly_update_status to authenticated;

-- The requester's update right above must not let them move a meeting or
-- silently cancel it — only mark a past meeting as completed.
create or replace function protect_meeting_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_pi() then return new; end if;
  if new.start_at is distinct from old.start_at
     or new.end_at is distinct from old.end_at
     or new.host_id is distinct from old.host_id
     or new.requester_id is distinct from old.requester_id
     or new.mode is distinct from old.mode
     or new.meet_link is distinct from old.meet_link
     or new.gcal_event_id is distinct from old.gcal_event_id
     or (new.status is distinct from old.status and new.status <> 'completed')
  then
    raise exception 'Use the booking or cancellation actions to change a meeting.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists protect_meeting on meetings;
create trigger protect_meeting before update on meetings for each row execute function protect_meeting_columns();

-- cancel_meeting is the sanctioned path, so it flags itself to the trigger.
create or replace function cancel_meeting(p_id uuid, p_reason text default null) returns meetings
language plpgsql security definer set search_path = public as $$
declare
  m meetings%rowtype;
  s lab_settings%rowtype;
begin
  select * into m from meetings where id = p_id for update;
  if m.id is null then raise exception 'Meeting not found.'; end if;
  if not (m.requester_id = auth.uid() or is_pi()) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if m.status <> 'confirmed' then
    raise exception 'Meeting is already %.', m.status;
  end if;
  select * into s from lab_settings where id = 1;

  perform set_config('cms.trusted', 'on', true);
  update meetings set
    status        = 'cancelled',
    cancelled_by  = auth.uid(),
    cancel_reason = p_reason,
    cancelled_at  = now(),
    late_cancel   = (m.start_at - now() < make_interval(hours => s.cancel_notice_hours))
                    and m.requester_id = auth.uid()
  where id = p_id
  returning * into m;
  perform set_config('cms.trusted', 'off', true);
  return m;
end $$;

create or replace function protect_meeting_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_pi() or coalesce(current_setting('cms.trusted', true), 'off') = 'on' then return new; end if;
  if new.start_at is distinct from old.start_at
     or new.end_at is distinct from old.end_at
     or new.host_id is distinct from old.host_id
     or new.requester_id is distinct from old.requester_id
     or new.mode is distinct from old.mode
     or new.meet_link is distinct from old.meet_link
     or new.gcal_event_id is distinct from old.gcal_event_id
     or (new.status is distinct from old.status and new.status <> 'completed')
  then
    raise exception 'Use the booking or cancellation actions to change a meeting.' using errcode = '42501';
  end if;
  return new;
end $$;

-- Edge functions run as service_role (RLS is bypassed, triggers are not).
create or replace function protect_meeting_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), current_user) in ('service_role', 'postgres', 'supabase_admin')
     or is_pi()
     or coalesce(current_setting('cms.trusted', true), 'off') = 'on'
  then return new; end if;
  if new.start_at is distinct from old.start_at
     or new.end_at is distinct from old.end_at
     or new.host_id is distinct from old.host_id
     or new.requester_id is distinct from old.requester_id
     or new.mode is distinct from old.mode
     or new.meet_link is distinct from old.meet_link
     or new.gcal_event_id is distinct from old.gcal_event_id
     or (new.status is distinct from old.status and new.status <> 'completed')
  then
    raise exception 'Use the booking or cancellation actions to change a meeting.' using errcode = '42501';
  end if;
  return new;
end $$;
