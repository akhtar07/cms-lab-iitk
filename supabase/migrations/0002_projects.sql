-- ============================================================================
-- CMS Lab — research tracking: projects, meeting notes, action items,
-- weekly updates. These feed the lab agent (phase 2).
-- ============================================================================

create type project_stage as enum (
  'idea','literature','calculations','analysis','writing',
  'submitted','under_review','revision','accepted','published','shelved'
);
create type item_status as enum ('open','done','dropped');

create table projects (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  short_code     text unique,                 -- e.g. "MoS2-defects"
  stage          project_stage not null default 'idea',
  lead_id        uuid references profiles (id),
  target_journal text,
  arxiv_id       text,
  doi            text,
  manuscript_url text,                        -- Overleaf / Drive
  repo_url       text,
  summary        text,
  external_collaborators text,
  submitted_on   date,
  revision_due   date,
  last_activity  timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  created_by     uuid references profiles (id)
);

create table project_members (
  project_id uuid references projects (id) on delete cascade,
  profile_id uuid references profiles (id) on delete cascade,
  role       text not null default 'contributor',   -- lead | contributor | mentor
  primary key (project_id, profile_id)
);

-- Notes attached to a meeting; raw text or transcript plus agent summary.
create table meeting_notes (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references meetings (id) on delete cascade,
  author_id    uuid not null references profiles (id),
  raw_notes    text,
  summary      text,          -- agent generated
  decisions    text[],        -- agent generated
  confirmed_by_pi        boolean not null default false,
  confirmed_by_requester boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index meeting_notes_meeting_idx on meeting_notes (meeting_id);

create table action_items (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects (id) on delete set null,
  meeting_id  uuid references meetings (id) on delete set null,
  owner_id    uuid not null references profiles (id),
  title       text not null,
  due_on      date,
  status      item_status not null default 'open',
  created_by  uuid references profiles (id),
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index action_items_owner_idx on action_items (owner_id, status);

-- The Friday "2-minute update". One row per person per project per week.
create table weekly_updates (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references profiles (id),
  project_id  uuid references projects (id) on delete set null,
  week_start  date not null,                 -- Monday
  did         text,
  blocked     text,
  next        text,
  hours_compute numeric,                     -- cluster hours, optional
  created_at  timestamptz not null default now(),
  unique (author_id, project_id, week_start)
);

-- Keep projects.last_activity fresh whenever anything touches them.
create or replace function touch_project() returns trigger language plpgsql as $$
begin
  update projects set last_activity = now() where id = coalesce(new.project_id, old.project_id);
  return null;
end $$;
create trigger action_items_touch after insert or update on action_items  for each row execute function touch_project();
create trigger weekly_updates_touch after insert or update on weekly_updates for each row execute function touch_project();

-- ------------------------------------------------------------------ RLS ----
alter table projects        enable row level security;
alter table project_members enable row level security;
alter table meeting_notes   enable row level security;
alter table action_items    enable row level security;
alter table weekly_updates  enable row level security;

-- Everyone active can see the lab's project board; only members + PI edit.
create policy "projects readable"     on projects for select to authenticated using (is_active_member());
create policy "projects insert"       on projects for insert to authenticated with check (is_active_member());
create policy "projects edit"         on projects for update to authenticated using (
  is_pi() or exists (select 1 from project_members pm where pm.project_id = id and pm.profile_id = auth.uid())
);
create policy "projects delete by PI" on projects for delete to authenticated using (is_pi());

create policy "members readable"      on project_members for select to authenticated using (is_active_member());
create policy "members managed"       on project_members for all to authenticated using (
  is_pi() or exists (select 1 from project_members pm where pm.project_id = project_id and pm.profile_id = auth.uid())
) with check (is_active_member());

create policy "notes: participants"   on meeting_notes for select to authenticated using (
  is_pi() or exists (select 1 from meetings m where m.id = meeting_id and m.requester_id = auth.uid())
);
create policy "notes: write"          on meeting_notes for insert to authenticated with check (
  is_pi() or exists (select 1 from meetings m where m.id = meeting_id and m.requester_id = auth.uid())
);
create policy "notes: update"         on meeting_notes for update to authenticated using (
  is_pi() or author_id = auth.uid()
);

create policy "items: own or PI"      on action_items for select to authenticated using (is_pi() or owner_id = auth.uid() or created_by = auth.uid());
create policy "items: create"         on action_items for insert to authenticated with check (is_active_member());
create policy "items: update"         on action_items for update to authenticated using (is_pi() or owner_id = auth.uid() or created_by = auth.uid());

create policy "updates: own or PI"    on weekly_updates for select to authenticated using (is_pi() or author_id = auth.uid());
create policy "updates: write own"    on weekly_updates for insert to authenticated with check (author_id = auth.uid());
create policy "updates: edit own"     on weekly_updates for update to authenticated using (author_id = auth.uid());
