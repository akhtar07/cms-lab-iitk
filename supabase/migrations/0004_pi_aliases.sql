-- ============================================================================
-- CMS Lab — the PI may sign in from more than one Google account
-- ============================================================================
-- Prof. Bhowmick has an institutional address and a personal Gmail. Either
-- should land him in the lab as PI. Everything that needs *one* PI (the
-- booking host, the calendar that events land on) still resolves to a single
-- account: the one in lab_settings.pi_email.

alter table lab_settings add column pi_alt_emails text[] not null default '{}';

comment on column lab_settings.pi_email is
  'Primary PI address. This account is the booking host and owns the linked Google Calendar.';
comment on column lab_settings.pi_alt_emails is
  'Additional addresses auto-approved as PI on first sign-in.';

-- First sign-in from any of the PI's addresses activates a PI profile.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pi  text;
  v_alt text[];
  v_is_pi boolean;
begin
  select pi_email, pi_alt_emails into v_pi, v_alt from lab_settings where id = 1;
  v_is_pi := lower(new.email) = lower(coalesce(v_pi, ''))
             or lower(new.email) = any (select lower(e) from unnest(coalesce(v_alt, '{}')) e);

  insert into profiles (id, email, full_name, avatar_url, role, status, approved_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    case when v_is_pi then 'pi'::member_role        else 'phd'::member_role end,
    case when v_is_pi then 'active'::member_status  else 'pending'::member_status end,
    case when v_is_pi then now() else null end
  );
  return new;
end $$;

-- With several PI profiles the old "limit 1" was non-deterministic, and the
-- slot lock is per host_id — two hosts would mean double-bookable slots.
-- The primary address wins; otherwise the longest-standing PI account.
create or replace function pi_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.id
  from profiles p, lab_settings s
  where s.id = 1 and p.role = 'pi' and p.status = 'active'
  order by (lower(p.email) = lower(coalesce(s.pi_email, ''))) desc, p.created_at
  limit 1;
$$;
