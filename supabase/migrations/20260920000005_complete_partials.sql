-- MUI Team App: completes the partly-built areas.
--   * delegation as true reassignment (original vs current assignee)
--   * richer tasks: department, tags, weight, recurrence, "require approval"
--   * attachments (tasks, reports, decisions), project files
--   * structured activity log across the whole system
--   * decision numbering/owner/project, report kinds and periods
--   * scheduler run log for the admin health panel
-- Safe to re-run. Requires migrations 1-4.

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------
create or replace function public.member_name(uid uuid)
returns text language sql stable security definer set search_path = public
as $$ select coalesce((select full_name from public.team_members where id = uid), 'Someone') $$;

-- ---------------------------------------------------------------------------
-- Tasks: new fields
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists department_id        uuid references public.departments (id) on delete set null,
  add column if not exists tags                 text[] not null default '{}',
  add column if not exists weight               int not null default 1 check (weight between 1 and 100),
  add column if not exists require_approval     boolean not null default true,
  add column if not exists recurrence           text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  add column if not exists recurrence_until     date,
  add column if not exists recurrence_parent_id uuid references public.tasks (id) on delete set null,
  add column if not exists recurrence_spawned   boolean not null default false,
  add column if not exists original_assignee_id uuid references public.team_members (id) on delete set null,
  add column if not exists delegated_by         uuid references public.team_members (id) on delete set null,
  add column if not exists delegated_at         timestamptz,
  add column if not exists delegation_note      text,
  add column if not exists assign_channels      text[];

create index if not exists tasks_delegated_by_idx on public.tasks (delegated_by);
create index if not exists tasks_department_idx   on public.tasks (department_id);

-- Which channels the sender chose for an assignment/delegation notice (null = the recipient's defaults).
alter table public.notifications add column if not exists channels text[];

-- A delegator keeps sight of what they handed on.
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated
  using (
    public.is_super_admin()
    or assignee_id = auth.uid()
    or assigned_by = auth.uid()
    or delegated_by = auth.uid()
    or original_assignee_id = auth.uid()
    or (public.current_team_role() = 'executive'
        and (public.in_my_reporting_line(assignee_id) or public.in_my_reporting_line(assigned_by)))
  );

-- ---------------------------------------------------------------------------
-- Structured activity log
-- ---------------------------------------------------------------------------
alter table public.activity_log
  add column if not exists field      text,
  add column if not exists from_value text,
  add column if not exists to_value   text,
  add column if not exists project_id uuid references public.projects (id) on delete set null;
create index if not exists activity_project_idx on public.activity_log (project_id, created_at desc);
create index if not exists activity_actor_idx   on public.activity_log (actor_id, created_at desc);

create or replace function public.log_activity(
  p_actor uuid, p_action text, p_type text, p_id uuid, p_summary text,
  p_field text default null, p_from text default null, p_to text default null, p_project uuid default null
) returns void
language sql security definer set search_path = public
as $$
  insert into public.activity_log (actor_id, action, entity_type, entity_id, summary, field, from_value, to_value, project_id)
  values (p_actor, p_action, p_type, p_id, p_summary, p_field, p_from, p_to, p_project)
$$;
revoke all on function public.log_activity(uuid, text, text, uuid, text, text, text, text, uuid) from public, anon, authenticated;

drop policy if exists activity_read on public.activity_log;
create policy activity_read on public.activity_log for select to authenticated
  using (
    public.is_super_admin()
    or actor_id = auth.uid()
    or (entity_type = 'task'     and exists (select 1 from public.tasks t     where t.id = entity_id))
    or (entity_type = 'project'  and exists (select 1 from public.projects p  where p.id = entity_id))
    or (entity_type = 'meeting'  and exists (select 1 from public.meetings m  where m.id = entity_id))
    or (entity_type = 'report'   and exists (select 1 from public.reports r   where r.id = entity_id))
    or (entity_type in ('decision', 'resource') and public.is_team_member())
  );

-- ---------------------------------------------------------------------------
-- Task guard + change trigger (replaces the versions from migration 1)
-- ---------------------------------------------------------------------------
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
  if uid is null or public.is_super_admin() then return new; end if;

  is_assignee := old.assignee_id = uid;
  is_reviewer := old.assigned_by = uid;

  -- Only the person who set the work may change its terms.
  if not is_reviewer and (
       new.assigned_by is distinct from old.assigned_by
    or new.parent_task_id is distinct from old.parent_task_id
    or new.project_id is distinct from old.project_id
    or new.department_id is distinct from old.department_id
    or new.weight is distinct from old.weight
    or new.require_approval is distinct from old.require_approval
    or new.recurrence is distinct from old.recurrence
    or new.recurrence_until is distinct from old.recurrence_until
    or new.review_note is distinct from old.review_note
  ) then
    raise exception 'Only the person who assigned this task can change its terms or write a review note.';
  end if;

  -- Reassigning: the assigner may reassign freely. An executive who currently holds
  -- the task may DELEGATE it, which must be recorded as such.
  if new.assignee_id is distinct from old.assignee_id and not is_reviewer then
    if not (is_assignee and public.is_exec_or_above()
            and new.delegated_by = uid
            and new.original_assignee_id is not distinct from coalesce(old.original_assignee_id, old.assignee_id)) then
      raise exception 'Only the assigner, or an executive delegating their own task, can change the assignee.';
    end if;
  end if;

  if new.status is distinct from old.status then
    if is_assignee then
      ok := ok
        or (old.status in ('not_started', 'needs_revision') and new.status = 'in_progress')
        or (old.status = 'in_progress' and new.status = 'submitted')
        or (old.status = 'in_progress' and new.status = 'completed' and (is_reviewer or not old.require_approval));
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

  return new;
end;
$$;

create or replace function public.on_task_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  actor uuid;
  actor_name text;
  delegated boolean;
begin
  if tg_op = 'INSERT' then
    actor := coalesce(auth.uid(), new.assigned_by);
    actor_name := public.member_name(actor);
    perform public.log_activity(actor, 'task.created', 'task', new.id,
      actor_name || ' created "' || new.title || '"', null, null, null, new.project_id);

    if new.assignee_id is not null and new.assignee_id is distinct from actor then
      insert into public.notifications (recipient_id, kind, title, body, link, channels)
      values (new.assignee_id, 'task_assigned', 'New assignment',
              actor_name || ' assigned you "' || new.title || '"', '/tasks/' || new.id, new.assign_channels);
    end if;
    return new;
  end if;

  -- UPDATE
  actor := auth.uid();
  actor_name := public.member_name(actor);

  if new.status is distinct from old.status then
    perform public.log_activity(actor, 'task.status_changed', 'task', new.id,
      actor_name || ' moved "' || new.title || '" from ' || replace(old.status::text, '_', ' ') || ' to ' || replace(new.status::text, '_', ' '),
      'status', old.status::text, new.status::text, new.project_id);

    if new.status = 'submitted' and new.assigned_by is not null and new.assigned_by is distinct from actor then
      insert into public.notifications (recipient_id, kind, title, body, link)
      values (new.assigned_by, 'task_submitted', 'Task submitted for review',
              actor_name || ' submitted "' || new.title || '"', '/tasks/' || new.id);
    elsif new.status in ('completed', 'needs_revision') and new.assignee_id is not null
          and new.assignee_id is distinct from actor then
      insert into public.notifications (recipient_id, kind, title, body, link)
      values (new.assignee_id,
              case when new.status = 'completed' then 'task_completed' else 'task_revision' end,
              case when new.status = 'completed' then 'Task approved' else 'Revision requested' end,
              '"' || new.title || '"', '/tasks/' || new.id);
    end if;
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    delegated := new.delegated_by is not null and new.delegated_by is distinct from old.delegated_by;
    perform public.log_activity(actor,
      case when delegated then 'task.delegated' else 'task.reassigned' end, 'task', new.id,
      actor_name || case when delegated then ' delegated "' else ' reassigned "' end || new.title || '" from '
        || public.member_name(old.assignee_id) || ' to ' || public.member_name(new.assignee_id),
      'assignee', public.member_name(old.assignee_id), public.member_name(new.assignee_id), new.project_id);

    if new.assignee_id is not null and new.assignee_id is distinct from actor then
      insert into public.notifications (recipient_id, kind, title, body, link, channels)
      values (new.assignee_id, 'task_assigned',
              case when delegated then 'Task delegated to you' else 'New assignment' end,
              actor_name || case when delegated then ' delegated "' else ' assigned you "' end || new.title || '"',
              '/tasks/' || new.id, new.assign_channels);
    end if;
    -- The original assigner is kept in the loop when someone else re-delegates their work.
    if delegated and new.assigned_by is not null
       and new.assigned_by is distinct from actor and new.assigned_by is distinct from new.assignee_id then
      insert into public.notifications (recipient_id, kind, title, body, link)
      values (new.assigned_by, 'task_delegated', 'Task delegated',
              actor_name || ' delegated "' || new.title || '" to ' || public.member_name(new.assignee_id),
              '/tasks/' || new.id);
    end if;
  end if;

  if new.due_at is distinct from old.due_at then
    perform public.log_activity(actor, 'task.due_changed', 'task', new.id,
      actor_name || ' changed the deadline of "' || new.title || '"',
      'due_at', old.due_at::text, new.due_at::text, new.project_id);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recurring tasks: when an occurrence is finished, the next one is created.
-- Called by the scheduler (service role).
-- ---------------------------------------------------------------------------
create or replace function public.spawn_recurring_tasks()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  step interval;
  next_due timestamptz;
  guard int;
  made int := 0;
begin
  for r in
    select * from public.tasks
     where recurrence <> 'none' and not recurrence_spawned
       and status in ('completed', 'closed') and due_at is not null
  loop
    step := case r.recurrence when 'daily' then interval '1 day' when 'weekly' then interval '7 days' else interval '1 month' end;
    next_due := r.due_at + step;
    guard := 0;
    -- Skip occurrences that would already be in the past (e.g. finished very late).
    while next_due < now() and guard < 400 loop next_due := next_due + step; guard := guard + 1; end loop;

    if r.recurrence_until is null or (next_due at time zone 'Africa/Nairobi')::date <= r.recurrence_until then
      insert into public.tasks (
        title, description, project_id, department_id, assignee_id, assigned_by, priority,
        start_date, due_at, requires_evidence, require_approval, weight, tags,
        recurrence, recurrence_until, recurrence_parent_id, meeting_id, status
      ) values (
        r.title, r.description, r.project_id, r.department_id,
        coalesce(r.original_assignee_id, r.assignee_id), r.assigned_by, r.priority,
        case when r.start_date is null then null else (r.start_date + (next_due::date - r.due_at::date)) end,
        next_due, r.requires_evidence, r.require_approval, r.weight, r.tags,
        r.recurrence, r.recurrence_until, r.id, r.meeting_id, 'not_started'
      );
      made := made + 1;
    end if;
    update public.tasks set recurrence_spawned = true where id = r.id;
  end loop;
  return made;
end;
$$;
revoke all on function public.spawn_recurring_tasks() from public, anon, authenticated;
grant execute on function public.spawn_recurring_tasks() to service_role;

-- ---------------------------------------------------------------------------
-- Scheduler run log (read by the admin health panel via the service role)
-- ---------------------------------------------------------------------------
create table if not exists public.system_runs (
  id        uuid primary key default gen_random_uuid(),
  ran_at    timestamptz not null default now(),
  reminders int not null default 0,
  spawned   int not null default 0,
  sent      jsonb,
  failed    int not null default 0,
  error     text
);
create index if not exists system_runs_ran_idx on public.system_runs (ran_at desc);
alter table public.system_runs enable row level security;   -- no policies: service role only

-- ---------------------------------------------------------------------------
-- Attachments (tasks, reports, decisions) + project files
-- ---------------------------------------------------------------------------
create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('task', 'report', 'decision')),
  entity_id    uuid not null,
  kind         text not null check (kind in ('file', 'link')),
  url          text,
  storage_path text,
  file_name    text,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references public.team_members (id) on delete set null,
  created_at   timestamptz not null default now(),
  check ((kind = 'link' and url is not null) or (kind = 'file' and storage_path is not null))
);
create index if not exists attachments_entity_idx on public.attachments (entity_type, entity_id);
alter table public.attachments enable row level security;

drop policy if exists attachments_read on public.attachments;
create policy attachments_read on public.attachments for select to authenticated
  using (
    (entity_type = 'task'     and exists (select 1 from public.tasks t   where t.id = entity_id))
    or (entity_type = 'report'   and exists (select 1 from public.reports r where r.id = entity_id))
    or (entity_type = 'decision' and public.is_team_member())
  );
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      (entity_type = 'task' and exists (
         select 1 from public.tasks t
          where t.id = entity_id and (t.assignee_id = auth.uid() or t.assigned_by = auth.uid() or public.is_super_admin())))
      or (entity_type = 'report' and exists (
         select 1 from public.reports r where r.id = entity_id and r.author_id = auth.uid() and r.status = 'draft'))
      or (entity_type = 'decision' and public.is_exec_or_above())
    )
  );
drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_super_admin());

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)
on conflict (id) do nothing;

-- Project-scoped files live in the resource library, visible only to people who can see the project.
alter table public.resources
  add column if not exists project_id uuid references public.projects (id) on delete set null;
create index if not exists resources_project_idx on public.resources (project_id);

drop policy if exists resources_read on public.resources;
create policy resources_read on public.resources for select to authenticated
  using (
    public.is_team_member()
    and (visibility = 'everyone' or public.is_exec_or_above())
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id))
  );

-- ---------------------------------------------------------------------------
-- Decisions: number, implementation owner, related project
-- ---------------------------------------------------------------------------
create sequence if not exists public.decision_number_seq;
alter table public.decisions
  add column if not exists number int,
  add column if not exists implementation_owner_id uuid references public.team_members (id) on delete set null,
  add column if not exists project_id uuid references public.projects (id) on delete set null;

update public.decisions d
   set number = s.rn + coalesce((select max(number) from public.decisions), 0)
  from (select id, row_number() over (order by created_at) as rn from public.decisions where number is null) s
 where d.id = s.id;
select setval('public.decision_number_seq', greatest(coalesce((select max(number) from public.decisions), 0), 1),
              (select max(number) from public.decisions) is not null);
alter table public.decisions alter column number set default nextval('public.decision_number_seq');
create unique index if not exists decisions_number_idx on public.decisions (number);

-- ---------------------------------------------------------------------------
-- Reports: personal or department, any period
-- ---------------------------------------------------------------------------
alter table public.reports
  add column if not exists kind text not null default 'personal' check (kind in ('personal', 'department'));
alter table public.reports drop constraint if exists reports_author_id_period_start_key;
create unique index if not exists reports_unique_idx
  on public.reports (author_id, kind, coalesce(department_id::text, ''), period_start, period_end);
do $$ begin
  alter table public.reports add constraint reports_period_check check (period_end >= period_start);
exception when duplicate_object then null; end $$;

drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select to authenticated
  using (
    author_id = auth.uid()
    or public.is_super_admin()
    or (status = 'submitted' and public.current_team_role() = 'executive' and (
          public.in_my_reporting_line(author_id)
          or (kind = 'department' and department_id is not null and department_id =
                (select tm.department_id from public.team_members tm where tm.id = auth.uid()))))
  );
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (
    author_id = auth.uid() and public.is_team_member()
    and (kind = 'personal' or public.is_exec_or_above())
  );

-- ---------------------------------------------------------------------------
-- Activity triggers for the rest of the system
-- ---------------------------------------------------------------------------
create or replace function public.log_project_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(auth.uid(), 'project.created', 'project', new.id,
      public.member_name(auth.uid()) || ' created project "' || new.name || '"', null, null, null, new.id);
  else
    if new.status is distinct from old.status then
      perform public.log_activity(auth.uid(), 'project.status_changed', 'project', new.id,
        public.member_name(auth.uid()) || ' set project "' || new.name || '" to ' || replace(new.status, '_', ' '),
        'status', old.status, new.status, new.id);
    end if;
    if new.due_date is distinct from old.due_date then
      perform public.log_activity(auth.uid(), 'project.due_changed', 'project', new.id,
        public.member_name(auth.uid()) || ' changed the due date of "' || new.name || '"',
        'due_date', old.due_date::text, new.due_date::text, new.id);
    end if;
    if new.owner_id is distinct from old.owner_id then
      perform public.log_activity(auth.uid(), 'project.owner_changed', 'project', new.id,
        public.member_name(auth.uid()) || ' changed the owner of "' || new.name || '"',
        'owner', public.member_name(old.owner_id), public.member_name(new.owner_id), new.id);
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists project_activity on public.projects;
create trigger project_activity after insert or update on public.projects
  for each row execute function public.log_project_change();

create or replace function public.log_project_member()
returns trigger language plpgsql security definer set search_path = public
as $$
declare pid uuid; mid uuid; pname text; added boolean := (tg_op = 'INSERT');
begin
  pid := case when added then new.project_id else old.project_id end;
  mid := case when added then new.member_id else old.member_id end;
  select name into pname from public.projects where id = pid;
  perform public.log_activity(auth.uid(),
    case when added then 'project.member_added' else 'project.member_removed' end, 'project', pid,
    public.member_name(mid) || case when added then ' joined project "' else ' left project "' end || coalesce(pname, '') || '"',
    'member', null, public.member_name(mid), pid);
  return null;
end; $$;
drop trigger if exists project_member_activity on public.project_members;
create trigger project_member_activity after insert or delete on public.project_members
  for each row execute function public.log_project_member();

create or replace function public.log_meeting_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(auth.uid(), 'meeting.created', 'meeting', new.id,
      public.member_name(auth.uid()) || ' scheduled "' || new.title || '"', null, null, null, new.project_id);
  elsif new.status is distinct from old.status then
    perform public.log_activity(auth.uid(), 'meeting.status_changed', 'meeting', new.id,
      '"' || new.title || '" marked ' || new.status, 'status', old.status, new.status, new.project_id);
  end if;
  return new;
end; $$;
drop trigger if exists meeting_activity on public.meetings;
create trigger meeting_activity after insert or update on public.meetings
  for each row execute function public.log_meeting_change();

create or replace function public.log_decision_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(auth.uid(), 'decision.recorded', 'decision', new.id,
      public.member_name(auth.uid()) || ' recorded decision #' || lpad(new.number::text, 3, '0') || ': ' || new.title,
      null, null, null, new.project_id);
  elsif new.status is distinct from old.status then
    perform public.log_activity(auth.uid(), 'decision.status_changed', 'decision', new.id,
      'Decision #' || lpad(new.number::text, 3, '0') || ' marked ' || new.status,
      'status', old.status, new.status, new.project_id);
  end if;
  return new;
end; $$;
drop trigger if exists decision_activity on public.decisions;
create trigger decision_activity after insert or update on public.decisions
  for each row execute function public.log_decision_change();

create or replace function public.log_report_submitted()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    perform public.log_activity(auth.uid(), 'report.submitted', 'report', new.id,
      public.member_name(new.author_id) || ' submitted a ' || new.kind || ' report for ' || to_char(new.period_start, 'DD Mon YYYY'),
      'status', old.status, new.status, null);
  end if;
  return new;
end; $$;
drop trigger if exists report_activity on public.reports;
create trigger report_activity after update on public.reports
  for each row execute function public.log_report_submitted();

create or replace function public.log_resource_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(auth.uid(), 'resource.added', 'resource', new.id,
      public.member_name(auth.uid()) || ' added "' || new.title || '" to ' || new.category, null, null, null, new.project_id);
    return new;
  end if;
  perform public.log_activity(auth.uid(), 'resource.removed', 'resource', old.id,
    public.member_name(auth.uid()) || ' removed "' || old.title || '"', null, null, null, old.project_id);
  return old;
end; $$;
drop trigger if exists resource_activity on public.resources;
create trigger resource_activity after insert or delete on public.resources
  for each row execute function public.log_resource_change();

create or replace function public.log_attachment_added()
returns trigger language plpgsql security definer set search_path = public
as $$
declare pid uuid; label text;
begin
  if new.entity_type = 'task' then
    select project_id, title into pid, label from public.tasks where id = new.entity_id;
    perform public.log_activity(new.uploaded_by, 'attachment.added', 'task', new.entity_id,
      public.member_name(new.uploaded_by) || ' attached ' || coalesce(new.file_name, new.url) || ' to "' || coalesce(label, 'a task') || '"',
      'attachment', null, coalesce(new.file_name, new.url), pid);
  end if;
  return new;
end; $$;
drop trigger if exists attachment_activity on public.attachments;
create trigger attachment_activity after insert on public.attachments
  for each row execute function public.log_attachment_added();

-- ---------------------------------------------------------------------------
-- Project statistics that reflect ALL of a project's tasks, not just the ones
-- the viewer can individually see (a member must still see the project's true
-- progress). Visibility of the project itself is checked inside.
-- ---------------------------------------------------------------------------
create or replace function public.can_see_project(pid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_team_member() and exists (
    select 1 from public.projects p
     where p.id = pid
       and (public.is_exec_or_above()
            or p.owner_id = auth.uid()
            or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.member_id = auth.uid())
            or exists (select 1 from public.tasks t where t.project_id = p.id and t.assignee_id = auth.uid()))
  )
$$;

create or replace function public.project_stats_all()
returns table (project_id uuid, task_count int, done_count int, overdue_count int, total_weight int, done_weight int)
language sql stable security definer set search_path = public
as $$
  select p.id,
         count(t.id)::int,
         (count(t.id) filter (where t.status in ('completed', 'closed')))::int,
         (count(t.id) filter (where t.due_at < now() and t.status not in ('completed', 'closed')))::int,
         coalesce(sum(t.weight), 0)::int,
         coalesce(sum(t.weight) filter (where t.status in ('completed', 'closed')), 0)::int
    from public.projects p
    left join public.tasks t on t.project_id = p.id
   where public.can_see_project(p.id)
   group by p.id
$$;
grant execute on function public.project_stats_all() to authenticated;

-- Per-person load inside one project (tasks of everyone, for anyone who can see the project).
create or replace function public.project_member_load(pid uuid)
returns table (member_id uuid, open_count int, done_count int, overdue_count int)
language sql stable security definer set search_path = public
as $$
  select t.assignee_id,
         (count(*) filter (where t.status not in ('completed', 'closed')))::int,
         (count(*) filter (where t.status in ('completed', 'closed')))::int,
         (count(*) filter (where t.due_at < now() and t.status not in ('completed', 'closed')))::int
    from public.tasks t
   where t.project_id = pid and t.assignee_id is not null and public.can_see_project(pid)
   group by t.assignee_id
$$;
grant execute on function public.project_member_load(uuid) to authenticated;

-- Delegation hands the task to someone else, so the row no longer belongs to the
-- delegator afterwards. The original policy's WITH CHECK would have rejected that;
-- allow it when the new row records this user as the delegator (the guard trigger
-- separately verifies it really is a valid delegation).
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_super_admin() or assignee_id = auth.uid() or assigned_by = auth.uid())
  with check (public.is_super_admin() or assignee_id = auth.uid() or assigned_by = auth.uid() or delegated_by = auth.uid());
