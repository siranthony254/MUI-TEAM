-- MUI Team App: core schema (v1).
-- Runs against the SAME Supabase project as the public website.
-- The website only uses public.profiles; everything here is namespaced by
-- table name (team_*, tasks, projects, ...) and never touches profiles.role.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type team_role as enum ('super_admin', 'executive', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum
    ('not_started', 'in_progress', 'submitted', 'under_review', 'needs_revision', 'completed', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_priority as enum ('low', 'normal', 'high', 'urgent');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Departments
-- ---------------------------------------------------------------------------
create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Team members. A row here is what grants access to the app; public site
-- sign-ups (which only get a `profiles` row) have no team_members row and
-- therefore see nothing.
-- ---------------------------------------------------------------------------
create table if not exists public.team_members (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text not null,
  email          text not null,
  phone          text,
  role           team_role not null default 'member',
  title          text,                 -- e.g. "Deputy Executive Director"
  department_id  uuid references public.departments (id) on delete set null,
  mandate        text,                 -- why the role exists
  responsibilities text[] not null default '{}',
  authority      text,                 -- what they can decide alone
  deliverables   text[] not null default '{}',
  reports_to     uuid references public.team_members (id) on delete set null,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists team_members_department_idx on public.team_members (department_id);
create index if not exists team_members_reports_to_idx on public.team_members (reports_to);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  department_id uuid references public.departments (id) on delete set null,
  owner_id      uuid references public.team_members (id) on delete set null,
  status        text not null default 'active' check (status in ('active', 'at_risk', 'paused', 'done')),
  start_date    date,
  due_date      date,
  created_by    uuid references public.team_members (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  member_id  uuid not null references public.team_members (id) on delete cascade,
  primary key (project_id, member_id)
);

-- ---------------------------------------------------------------------------
-- Tasks (delegation chain via parent_task_id / delegated_from)
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  project_id      uuid references public.projects (id) on delete set null,
  assignee_id     uuid references public.team_members (id) on delete set null,
  assigned_by     uuid references public.team_members (id) on delete set null,
  parent_task_id  uuid references public.tasks (id) on delete set null,
  status          task_status not null default 'not_started',
  priority        task_priority not null default 'normal',
  start_date      date,
  due_at          timestamptz,
  requires_evidence boolean not null default false,
  evidence_note   text,
  review_note     text,
  submitted_at    timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tasks_assignee_idx on public.tasks (assignee_id, status);
create index if not exists tasks_project_idx on public.tasks (project_id);
create index if not exists tasks_due_idx on public.tasks (due_at);

-- ---------------------------------------------------------------------------
-- Notifications (the central event -> channel engine writes here first;
-- email / push / SMS are delivered from this table later).
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.team_members (id) on delete cascade,
  kind         text not null,           -- task_assigned, task_due, task_overdue, mention, announcement, ...
  title        text not null,
  body         text,
  link         text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, read_at, created_at desc);

-- ---------------------------------------------------------------------------
-- Activity log (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.team_members (id) on delete set null,
  action      text not null,            -- e.g. task.created, task.status_changed
  entity_type text not null,
  entity_id   uuid,
  summary     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists activity_log_created_idx on public.activity_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Web-push subscriptions (PWA)
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.team_members (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so RLS policies can use them without
-- recursing into team_members' own policies).
-- ---------------------------------------------------------------------------
create or replace function public.current_team_role()
returns team_role
language sql stable security definer set search_path = public
as $$
  select role from public.team_members where id = auth.uid() and active
$$;

create or replace function public.is_team_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.team_members where id = auth.uid() and active)
$$;

create or replace function public.is_exec_or_above()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_team_role() in ('super_admin', 'executive'), false)
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_team_role() = 'super_admin', false)
$$;

-- Is `target` the caller, or (transitively) someone who reports to the caller?
create or replace function public.in_my_reporting_line(target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  with recursive line as (
    select id from public.team_members where id = auth.uid()
    union
    select m.id from public.team_members m join line l on m.reports_to = l.id
  )
  select exists (select 1 from line where id = target)
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.departments        enable row level security;
alter table public.team_members       enable row level security;
alter table public.projects           enable row level security;
alter table public.project_members    enable row level security;
alter table public.tasks              enable row level security;
alter table public.notifications      enable row level security;
alter table public.activity_log       enable row level security;
alter table public.push_subscriptions enable row level security;

-- departments: any team member reads; super_admin manages
drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments for select to authenticated
  using (public.is_team_member());
drop policy if exists departments_write on public.departments;
create policy departments_write on public.departments for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- team_members: any team member reads the directory; a member may edit
-- only their own contact fields via the function below; super_admin manages.
drop policy if exists team_members_read on public.team_members;
create policy team_members_read on public.team_members for select to authenticated
  using (public.is_team_member());
drop policy if exists team_members_write on public.team_members;
create policy team_members_write on public.team_members for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- projects: members see projects they belong to / own; execs+ see all
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated
  using (
    public.is_exec_or_above()
    or owner_id = auth.uid()
    or exists (select 1 from public.project_members pm
               where pm.project_id = projects.id and pm.member_id = auth.uid())
  );
drop policy if exists projects_write on public.projects;
create policy projects_write on public.projects for all to authenticated
  using (public.is_exec_or_above()) with check (public.is_exec_or_above());

drop policy if exists project_members_read on public.project_members;
create policy project_members_read on public.project_members for select to authenticated
  using (public.is_team_member());
drop policy if exists project_members_write on public.project_members;
create policy project_members_write on public.project_members for all to authenticated
  using (public.is_exec_or_above()) with check (public.is_exec_or_above());

-- tasks:
--   super_admin sees all; executives see tasks in their reporting line;
--   members see tasks assigned to them or assigned by them.
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated
  using (
    public.is_super_admin()
    or assignee_id = auth.uid()
    or assigned_by = auth.uid()
    or (public.current_team_role() = 'executive'
        and (public.in_my_reporting_line(assignee_id) or public.in_my_reporting_line(assigned_by)))
  );

-- any team member may create a task they assign; members may only assign
-- to themselves, executives+ may assign anyone.
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    public.is_team_member()
    and assigned_by = auth.uid()
    and (public.is_exec_or_above() or assignee_id = auth.uid())
  );

-- assignee may update their task (status moves are also guarded in the app);
-- assigner and super_admin may update too.
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (
    public.is_super_admin() or assignee_id = auth.uid() or assigned_by = auth.uid()
  )
  with check (
    public.is_super_admin() or assignee_id = auth.uid() or assigned_by = auth.uid()
  );

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_super_admin() or assigned_by = auth.uid());

-- notifications: recipient only
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
-- inserts happen server-side (service role) or via the triggers below.

-- activity log: super_admin reads everything; others read their own actions
-- plus the history of any task they can already see (tasks RLS applies inside).
drop policy if exists activity_read on public.activity_log;
create policy activity_read on public.activity_log for select to authenticated
  using (
    public.is_super_admin()
    or actor_id = auth.uid()
    or (entity_type = 'task' and exists (select 1 from public.tasks t where t.id = entity_id))
  );

-- push subscriptions: owner only
drop policy if exists push_owner on public.push_subscriptions;
create policy push_owner on public.push_subscriptions for all to authenticated
  using (member_id = auth.uid()) with check (member_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Triggers: updated_at, task lifecycle -> notifications + activity log
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists team_members_touch on public.team_members;
create trigger team_members_touch before update on public.team_members
  for each row execute function public.touch_updated_at();
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- Enforce the accountability workflow in the database, so it cannot be
-- bypassed by calling the API directly with a member's own session.
create or replace function public.guard_task_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  is_assignee boolean;
  is_reviewer boolean;
  ok boolean := false;
begin
  -- service role / SQL editor (no JWT user) is trusted
  if uid is null or public.is_super_admin() then return new; end if;

  is_assignee := old.assignee_id = uid;
  is_reviewer := old.assigned_by = uid;

  -- only the assigner may reassign or re-parent
  if (new.assignee_id is distinct from old.assignee_id
      or new.assigned_by is distinct from old.assigned_by
      or new.parent_task_id is distinct from old.parent_task_id) and not is_reviewer then
    raise exception 'Only the person who assigned this task can change who it belongs to.';
  end if;

  if new.status is distinct from old.status then
    if is_assignee then
      ok := ok
        or (old.status in ('not_started', 'needs_revision') and new.status = 'in_progress')
        or (old.status = 'in_progress' and new.status = 'submitted')
        or (old.status = 'in_progress' and new.status = 'completed' and is_reviewer);
    end if;
    if is_reviewer then
      ok := ok
        or (old.status = 'submitted' and new.status = 'under_review')
        or (old.status in ('submitted', 'under_review') and new.status in ('completed', 'needs_revision'))
        or (old.status = 'completed' and new.status = 'closed');
    end if;
    if not ok then
      raise exception 'You cannot move this task from % to %.', old.status, new.status;
    end if;
  end if;

  -- review outcome fields are the reviewer's alone
  if (new.review_note is distinct from old.review_note) and not is_reviewer then
    raise exception 'Only the reviewer can write a review note.';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before update on public.tasks
  for each row execute function public.guard_task_update();

create or replace function public.on_task_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare actor_name text;
begin
  select full_name into actor_name from public.team_members where id = auth.uid();

  if tg_op = 'INSERT' then
    insert into public.activity_log (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'task.created', 'task', new.id,
            coalesce(actor_name, 'Someone') || ' created "' || new.title || '"');
    if new.assignee_id is not null and new.assignee_id is distinct from auth.uid() then
      insert into public.notifications (recipient_id, kind, title, body, link)
      values (new.assignee_id, 'task_assigned',
              'New assignment',
              coalesce(actor_name, 'Someone') || ' assigned you "' || new.title || '"',
              '/tasks/' || new.id);
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.activity_log (actor_id, action, entity_type, entity_id, summary)
      values (auth.uid(), 'task.status_changed', 'task', new.id,
              coalesce(actor_name, 'Someone') || ' moved "' || new.title || '" to ' || new.status);
      -- tell the assigner when work is submitted, tell the assignee on review outcome
      if new.status = 'submitted' and new.assigned_by is not null and new.assigned_by is distinct from auth.uid() then
        insert into public.notifications (recipient_id, kind, title, body, link)
        values (new.assigned_by, 'task_submitted', 'Task submitted for review',
                coalesce(actor_name, 'Someone') || ' submitted "' || new.title || '"', '/tasks/' || new.id);
      elsif new.status in ('completed', 'needs_revision') and new.assignee_id is not null
            and new.assignee_id is distinct from auth.uid() then
        insert into public.notifications (recipient_id, kind, title, body, link)
        values (new.assignee_id,
                case when new.status = 'completed' then 'task_completed' else 'task_revision' end,
                case when new.status = 'completed' then 'Task approved' else 'Revision requested' end,
                '"' || new.title || '"', '/tasks/' || new.id);
      end if;
    end if;
    if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null
       and new.assignee_id is distinct from auth.uid() then
      insert into public.notifications (recipient_id, kind, title, body, link)
      values (new.assignee_id, 'task_assigned', 'New assignment',
              coalesce(actor_name, 'Someone') || ' assigned you "' || new.title || '"', '/tasks/' || new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_notify on public.tasks;
create trigger tasks_notify after insert or update on public.tasks
  for each row execute function public.on_task_change();

-- ---------------------------------------------------------------------------
-- Bootstrap: make the founder a super_admin once their auth user exists.
-- ---------------------------------------------------------------------------
insert into public.team_members (id, full_name, email, role, title)
select u.id,
       coalesce(u.raw_user_meta_data ->> 'full_name', 'Founder'),
       u.email,
       'super_admin',
       'Executive Director'
from auth.users u
where lower(u.email) = 'micdupinitiative@gmail.com'
on conflict (id) do update set role = 'super_admin';
