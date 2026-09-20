-- MUI Team App: meetings, decisions register, department reports.
-- Safe to re-run. Requires 20260920000001 and 20260920000002.

-- ---------------------------------------------------------------------------
-- Meetings
-- ---------------------------------------------------------------------------
create table if not exists public.meetings (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  location      text,
  agenda        text,
  minutes       text,
  status        text not null default 'scheduled' check (status in ('scheduled', 'held', 'cancelled')),
  project_id    uuid references public.projects (id) on delete set null,
  created_by    uuid references public.team_members (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists meetings_starts_idx on public.meetings (starts_at desc);

create table if not exists public.meeting_attendees (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  member_id  uuid not null references public.team_members (id) on delete cascade,
  attended   boolean,
  primary key (meeting_id, member_id)
);
create index if not exists meeting_attendees_member_idx on public.meeting_attendees (member_id);

-- Action items from a meeting are ordinary tasks that remember where they came from.
alter table public.tasks
  add column if not exists meeting_id uuid references public.meetings (id) on delete set null;
create index if not exists tasks_meeting_idx on public.tasks (meeting_id);

-- ---------------------------------------------------------------------------
-- Decisions register (institutional memory)
-- ---------------------------------------------------------------------------
create table if not exists public.decisions (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  decision       text not null,
  rationale      text,
  decided_on     date not null default current_date,
  decided_by     text,                       -- e.g. "Executive Team"
  status         text not null default 'active' check (status in ('active', 'superseded', 'reversed')),
  superseded_by  uuid references public.decisions (id) on delete set null,
  meeting_id     uuid references public.meetings (id) on delete set null,
  created_by     uuid references public.team_members (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists decisions_decided_idx on public.decisions (decided_on desc);

-- ---------------------------------------------------------------------------
-- Reports (monthly department / personal reports)
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  author_id       uuid not null references public.team_members (id) on delete cascade,
  department_id   uuid references public.departments (id) on delete set null,
  period_start    date not null,
  period_end      date not null,
  activities      text,
  completed       text,
  challenges      text,
  metrics         text,
  recommendations text,
  status          text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (author_id, period_start)
);
create index if not exists reports_period_idx on public.reports (period_start desc);

-- ---------------------------------------------------------------------------
-- Visibility helper. SECURITY DEFINER so the meetings and meeting_attendees
-- policies can both use it without recursing into each other.
-- ---------------------------------------------------------------------------
create or replace function public.can_see_meeting(mid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_super_admin()
      or exists (select 1 from public.meetings m where m.id = mid and m.created_by = auth.uid())
      or exists (select 1 from public.meeting_attendees a where a.meeting_id = mid and a.member_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.meetings          enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.decisions         enable row level security;
alter table public.reports           enable row level security;

-- meetings: attendees, creator and super admin read; executives+ create/edit their own
drop policy if exists meetings_read on public.meetings;
create policy meetings_read on public.meetings for select to authenticated
  using (public.can_see_meeting(id));
drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings for insert to authenticated
  with check (public.is_exec_or_above() and created_by = auth.uid());
drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings for update to authenticated
  using (public.is_super_admin() or (public.is_exec_or_above() and created_by = auth.uid()))
  with check (public.is_super_admin() or (public.is_exec_or_above() and created_by = auth.uid()));
drop policy if exists meetings_delete on public.meetings;
create policy meetings_delete on public.meetings for delete to authenticated
  using (public.is_super_admin() or created_by = auth.uid());

drop policy if exists attendees_read on public.meeting_attendees;
create policy attendees_read on public.meeting_attendees for select to authenticated
  using (public.can_see_meeting(meeting_id));
-- write: whoever can edit the meeting; attendees may record only their own attendance
drop policy if exists attendees_write on public.meeting_attendees;
create policy attendees_write on public.meeting_attendees for all to authenticated
  using (
    public.is_super_admin()
    or exists (select 1 from public.meetings m where m.id = meeting_id and m.created_by = auth.uid())
  )
  with check (
    public.is_super_admin()
    or exists (select 1 from public.meetings m where m.id = meeting_id and m.created_by = auth.uid())
  );

-- decisions: every active team member can read the register; executives+ write
drop policy if exists decisions_read on public.decisions;
create policy decisions_read on public.decisions for select to authenticated
  using (public.is_team_member());
drop policy if exists decisions_write on public.decisions;
create policy decisions_write on public.decisions for all to authenticated
  using (public.is_exec_or_above()) with check (public.is_exec_or_above());

-- reports: author; their reporting-line executives; super admin
drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select to authenticated
  using (
    author_id = auth.uid()
    or public.is_super_admin()
    or (public.current_team_role() = 'executive' and public.in_my_reporting_line(author_id) and status = 'submitted')
  );
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (author_id = auth.uid() and public.is_team_member());
-- a report can be edited only while it is still a draft; submitting locks it
drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports for update to authenticated
  using (author_id = auth.uid() and status = 'draft')
  with check (author_id = auth.uid());
drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports for delete to authenticated
  using (author_id = auth.uid() and status = 'draft');

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists meetings_touch on public.meetings;
create trigger meetings_touch before update on public.meetings
  for each row execute function public.touch_updated_at();
drop trigger if exists reports_touch on public.reports;
create trigger reports_touch before update on public.reports
  for each row execute function public.touch_updated_at();

-- Invite notification when someone is added to a meeting.
create or replace function public.on_meeting_attendee_added()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare m record;
begin
  select title, starts_at, created_by into m from public.meetings where id = new.meeting_id;
  if m.created_by is distinct from new.member_id then
    insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
    values (
      new.member_id, 'meeting_invite', 'Meeting invitation',
      '"' || m.title || '" — ' || to_char(m.starts_at at time zone 'Africa/Nairobi', 'Dy DD Mon, HH24:MI'),
      '/meetings/' || new.meeting_id,
      'meeting_invite:' || new.meeting_id || ':' || new.member_id
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists attendee_added on public.meeting_attendees;
create trigger attendee_added after insert on public.meeting_attendees
  for each row execute function public.on_meeting_attendee_added();

-- Tell the author's line manager (or the super admins) when a report is submitted.
create or replace function public.on_report_submitted()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare author record; target uuid;
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    select full_name, reports_to into author from public.team_members where id = new.author_id;
    for target in
      select coalesce(author.reports_to, id) from public.team_members
       where (author.reports_to is not null and id = author.reports_to)
          or (author.reports_to is null and role = 'super_admin' and active)
    loop
      if target <> new.author_id then
        insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
        values (
          target, 'report_submitted', 'Report submitted',
          author.full_name || ' submitted their report for ' || to_char(new.period_start, 'Mon YYYY') || '.',
          '/reports/' || new.id,
          'report_submitted:' || new.id || ':' || target
        )
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
      end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists report_submitted on public.reports;
create trigger report_submitted after update on public.reports
  for each row execute function public.on_report_submitted();
