-- ============================================================================
-- CMS Lab — core schema: members, approval, availability, meetings
-- Run with: supabase db push   (or paste into the Supabase SQL editor)
-- ============================================================================

create extension if not exists btree_gist;   -- needed for the slot-lock constraint
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums ----
create type member_role   as enum ('pi','postdoc','phd','mtech','srf_jrf','intern','ugp','alumni');
create type member_status as enum ('pending','active','rejected','left');
create type meeting_mode  as enum ('online','offline');
create type meeting_type  as enum ('progress','paper','thesis','urgent','other');
create type meeting_status as enum ('confirmed','cancelled','completed','no_show');
create type block_kind    as enum ('open','blocked');

-- ------------------------------------------------------------ settings ----
-- Single-row table. Edit pi_email BEFORE the PI signs in for the first time.
create table lab_settings (
  id                   int primary key default 1 check (id = 1),
  lab_name             text not null default 'CMS Lab',
  pi_email             text,
  pi_display_name      text default 'Prof. Somnath Bhowmick',
  default_location     text default 'PI office',
  timezone             text not null default 'Asia/Kolkata',
  booking_horizon_days int  not null default 21,   -- how far ahead students may book
  min_notice_hours     int  not null default 12,   -- earliest a slot can be booked
  cancel_notice_hours  int  not null default 2     -- cancellations later than this are flagged
);
insert into lab_settings (id, pi_email) values (1, 'REPLACE_WITH_PI_EMAIL@iitk.ac.in');

-- ------------------------------------------------------------ profiles ----
create table profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text not null unique,
  full_name           text,
  avatar_url          text,
  role                member_role   not null default 'phd',
  status              member_status not null default 'pending',
  requested_role      member_role,                 -- what the person asked for at signup
  mentor_id           uuid references profiles (id),
  joined_on           date,
  expected_completion date,
  research_interests  text,
  bio                 text,
  phone               text,
  scholar_url         text,
  orcid               text,
  created_at          timestamptz not null default now(),
  approved_at         timestamptz,
  approved_by         uuid references profiles (id)
);
create index profiles_status_idx on profiles (status);

-- Auto-create a profile on first sign-in. The PI (matched by email) is
-- activated immediately; everyone else waits for approval.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pi text;
begin
  select pi_email into v_pi from lab_settings where id = 1;
  insert into profiles (id, email, full_name, avatar_url, role, status, approved_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    case when lower(new.email) = lower(v_pi) then 'pi'::member_role   else 'phd'::member_role end,
    case when lower(new.email) = lower(v_pi) then 'active'::member_status else 'pending'::member_status end,
    case when lower(new.email) = lower(v_pi) then now() else null end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ------------------------------------------------------------- helpers ----
-- security definer so they can be used inside RLS policies without recursion
create or replace function is_pi() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'pi' and status = 'active');
$$;

create or replace function is_active_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

create or replace function pi_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where role = 'pi' and status = 'active' limit 1;
$$;

-- Members may edit their own profile, but never their own role/status.
create or replace function protect_profile_columns()
returns trigger language plpgsql as $$
begin
  if not is_pi() then
    new.role        := old.role;
    new.status      := old.status;
    new.mentor_id   := old.mentor_id;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    new.email       := old.email;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on profiles
  for each row execute function protect_profile_columns();

-- -------------------------------------------------------- availability ----
-- Weekly recurring office-hour rules owned by the PI.
create table availability_rules (
  id           uuid primary key default gen_random_uuid(),
  weekday      int  not null check (weekday between 0 and 6),   -- 0 = Sunday
  start_time   time not null,
  end_time     time not null check (end_time > start_time),
  slot_minutes int  not null default 20 check (slot_minutes between 5 and 240),
  mode         text not null default 'both' check (mode in ('online','offline','both')),
  location     text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- One-off exceptions: extra open windows or blocked time (leave, travel,
-- Google-Calendar busy times pulled in by the sync function).
create table availability_blocks (
  id         uuid primary key default gen_random_uuid(),
  kind       block_kind not null,
  start_at   timestamptz not null,
  end_at     timestamptz not null check (end_at > start_at),
  reason     text,
  source     text not null default 'manual',   -- manual | gcal
  gcal_id    text unique,
  created_at timestamptz not null default now()
);
create index availability_blocks_range_idx on availability_blocks using gist (tstzrange(start_at, end_at));

-- ------------------------------------------------------------ meetings ----
create table meetings (
  id             uuid primary key default gen_random_uuid(),
  host_id        uuid not null references profiles (id),
  requester_id   uuid not null references profiles (id),
  start_at       timestamptz not null,
  end_at         timestamptz not null check (end_at > start_at),
  mode           meeting_mode not null,
  type           meeting_type not null default 'progress',
  agenda         text not null check (length(agenda) >= 10),
  status         meeting_status not null default 'confirmed',
  location       text,
  meet_link      text,
  gcal_event_id  text,
  cancelled_by   uuid references profiles (id),
  cancel_reason  text,
  cancelled_at   timestamptz,
  late_cancel    boolean not null default false,
  created_at     timestamptz not null default now(),

  -- THE LOCK: no two live meetings with the same host may overlap in time.
  -- Postgres enforces this atomically, so concurrent bookings cannot collide.
  constraint meetings_no_overlap exclude using gist (
    host_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (status = 'confirmed')
);
create index meetings_requester_idx on meetings (requester_id, start_at desc);
create index meetings_host_idx on meetings (host_id, start_at);

-- Google OAuth refresh token for the PI. No RLS policies => only the
-- service role (edge functions) can read it.
create table google_tokens (
  profile_id    uuid primary key references profiles (id) on delete cascade,
  refresh_token text not null,
  calendar_id   text not null default 'primary',
  connected_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------- RPCs ----

-- Book a slot. All validation happens here, server-side, inside one
-- transaction. Returns the new meeting row.
create or replace function book_meeting(
  p_start  timestamptz,
  p_end    timestamptz,
  p_mode   meeting_mode,
  p_type   meeting_type,
  p_agenda text
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
  if v_host is null then
    raise exception 'No active PI account found.';
  end if;

  if p_start < now() + make_interval(hours => s.min_notice_hours) then
    raise exception 'Slots must be booked at least % hours in advance.', s.min_notice_hours;
  end if;
  if p_start > now() + make_interval(days => s.booking_horizon_days) then
    raise exception 'You can only book up to % days ahead.', s.booking_horizon_days;
  end if;

  v_local_start := p_start at time zone s.timezone;
  v_local_end   := p_end   at time zone s.timezone;

  -- Must sit inside an active weekly rule, on the slot grid, with allowed mode
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
      v_rule_ok := true;
      v_location := r.location;
      exit;
    end if;
  end loop;

  -- ...or inside a one-off "open" window
  if not v_rule_ok then
    select true into v_rule_ok
    from availability_blocks
    where kind = 'open' and start_at <= p_start and end_at >= p_end
    limit 1;
  end if;

  if not coalesce(v_rule_ok, false) then
    raise exception 'That time is not within the PI''s available hours.';
  end if;

  -- Not inside a blocked window (leave, travel, calendar busy)
  if exists (
    select 1 from availability_blocks
    where kind = 'blocked' and tstzrange(start_at, end_at) && tstzrange(p_start, p_end)
  ) then
    raise exception 'The PI is unavailable at that time.';
  end if;

  begin
    insert into meetings (host_id, requester_id, start_at, end_at, mode, type, agenda, location)
    values (v_host, auth.uid(), p_start, p_end, p_mode, p_type, p_agenda,
            case when p_mode = 'offline' then coalesce(v_location, s.default_location) else null end)
    returning * into m;
  exception when exclusion_violation then
    raise exception 'Sorry, that slot was just taken by someone else.' using errcode = '23P01';
  end;

  return m;
end $$;

-- Cancel a meeting (requester or PI).
create or replace function cancel_meeting(p_id uuid, p_reason text default null)
returns meetings
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

  update meetings set
    status        = 'cancelled',
    cancelled_by  = auth.uid(),
    cancel_reason = p_reason,
    cancelled_at  = now(),
    late_cancel   = (m.start_at - now() < make_interval(hours => s.cancel_notice_hours))
                    and m.requester_id = auth.uid()
  where id = p_id
  returning * into m;
  return m;
end $$;

-- PI: approve / reject a pending member.
create or replace function review_member(
  p_id      uuid,
  p_approve boolean,
  p_role    member_role default null,
  p_mentor  uuid default null
) returns profiles
language plpgsql security definer set search_path = public as $$
declare p profiles%rowtype;
begin
  if not is_pi() then raise exception 'PI only.' using errcode = '42501'; end if;
  update profiles set
    status      = case when p_approve then 'active'::member_status else 'rejected'::member_status end,
    role        = coalesce(p_role, requested_role, role),
    mentor_id   = coalesce(p_mentor, mentor_id),
    approved_at = case when p_approve then now() else null end,
    approved_by = case when p_approve then auth.uid() else null end,
    joined_on   = coalesce(joined_on, current_date)
  where id = p_id
  returning * into p;
  return p;
end $$;

-- Has the PI connected Google Calendar? (token itself is never exposed)
create or replace function calendar_connected() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from google_tokens where profile_id = pi_id());
$$;

-- ------------------------------------------------------------------ RLS ----
alter table lab_settings        enable row level security;
alter table profiles            enable row level security;
alter table availability_rules  enable row level security;
alter table availability_blocks enable row level security;
alter table meetings            enable row level security;
alter table google_tokens       enable row level security;   -- no policies: service role only

create policy "settings readable by signed-in"  on lab_settings for select to authenticated using (true);
create policy "settings editable by PI"         on lab_settings for update to authenticated using (is_pi());

create policy "own profile"                    on profiles for select to authenticated using (id = auth.uid());
create policy "members see members"            on profiles for select to authenticated using (is_active_member());
create policy "edit own profile"               on profiles for update to authenticated using (id = auth.uid());
create policy "PI edits any profile"           on profiles for update to authenticated using (is_pi());

create policy "rules readable"                 on availability_rules  for select to authenticated using (is_active_member());
create policy "rules managed by PI"            on availability_rules  for all    to authenticated using (is_pi()) with check (is_pi());
create policy "blocks readable"                on availability_blocks for select to authenticated using (is_active_member());
create policy "blocks managed by PI"           on availability_blocks for all    to authenticated using (is_pi()) with check (is_pi());

-- Members see when the PI is busy (needed to grey out slots) but only the
-- details of their own meetings; the UI hides other people's agendas via
-- the meetings_public view below.
create policy "own meetings"                   on meetings for select to authenticated using (requester_id = auth.uid());
create policy "PI sees all meetings"           on meetings for select to authenticated using (is_pi());
create policy "PI updates meetings"            on meetings for update to authenticated using (is_pi());

-- Busy-slot view: exposes only time ranges, no agenda / names.
create view meetings_busy with (security_invoker = false) as
  select id, start_at, end_at from meetings where status = 'confirmed';
grant select on meetings_busy to authenticated;

grant execute on function book_meeting   to authenticated;
grant execute on function cancel_meeting to authenticated;
grant execute on function review_member  to authenticated;
grant execute on function is_pi, is_active_member, pi_id, calendar_connected to authenticated;
