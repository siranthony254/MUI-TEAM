-- MUI Team App, migration 8: task comments, Blocked status, extension requests,
-- notification preference matrix, organisation settings that drive reminders/automation,
-- meeting reminders. Safe to re-run. Requires migrations 1-7.

-- ---------------------------------------------------------------------------
-- Blocked status
-- ---------------------------------------------------------------------------
alter type public.task_status add value if not exists 'blocked';

alter table public.tasks
  add column if not exists blocked_reason text,
  add column if not exists blocked_at timestamptz;

-- ---------------------------------------------------------------------------
-- Organisation settings helper + department directors (used by escalation rules)
-- ---------------------------------------------------------------------------
create or replace function public.org_setting(k text, d text)
returns text language sql stable security definer set search_path = public
as $$ select coalesce((select value from public.org_settings where key = k), d) $$;

alter table public.departments
  add column if not exists director_id uuid references public.team_members (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Task comments
-- ---------------------------------------------------------------------------
create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid not null references public.team_members (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_idx on public.task_comments (task_id, created_at);
alter table public.task_comments enable row level security;

drop policy if exists comments_read on public.task_comments;
create policy comments_read on public.task_comments for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));
drop policy if exists comments_insert on public.task_comments;
create policy comments_insert on public.task_comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id));
drop policy if exists comments_delete on public.task_comments;
create policy comments_delete on public.task_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_super_admin());

create or replace function public.on_task_comment()
returns trigger language plpgsql security definer set search_path = public
as $$
declare t record; target uuid;
begin
  select id, title, assignee_id, assigned_by, delegated_by into t from public.tasks where id = new.task_id;
  for target in
    select distinct x from (values (t.assignee_id), (t.assigned_by), (t.delegated_by)) v(x)
     where x is not null and x <> new.author_id
  loop
    insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
    values (target, 'task_comment',
            public.member_name(new.author_id) || ' commented on "' || t.title || '"',
            left(new.body, 140), '/tasks/' || t.id, 'comment:' || new.id || ':' || target)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end loop;
  perform public.log_activity(new.author_id, 'task.commented', 'task', t.id,
    public.member_name(new.author_id) || ' commented on "' || t.title || '"');
  return new;
end; $$;
drop trigger if exists task_comment_added on public.task_comments;
create trigger task_comment_added after insert on public.task_comments
  for each row execute function public.on_task_comment();

-- ---------------------------------------------------------------------------
-- Extension requests
-- ---------------------------------------------------------------------------
create table if not exists public.extension_requests (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.tasks (id) on delete cascade,
  requested_by   uuid not null references public.team_members (id) on delete cascade,
  reason         text not null check (char_length(reason) >= 3),
  requested_due  timestamptz not null,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by     uuid references public.team_members (id) on delete set null,
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now()
);
create index if not exists extension_task_idx on public.extension_requests (task_id, created_at desc);
alter table public.extension_requests enable row level security;

drop policy if exists extensions_read on public.extension_requests;
create policy extensions_read on public.extension_requests for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));
drop policy if exists extensions_insert on public.extension_requests;
create policy extensions_insert on public.extension_requests for insert to authenticated
  with check (
    requested_by = auth.uid()
    and exists (select 1 from public.tasks t
                 where t.id = task_id and t.assignee_id = auth.uid() and t.status not in ('completed', 'closed'))
  );
drop policy if exists extensions_decide on public.extension_requests;
create policy extensions_decide on public.extension_requests for update to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and (t.assigned_by = auth.uid() or public.is_super_admin())))
  with check (exists (select 1 from public.tasks t where t.id = task_id and (t.assigned_by = auth.uid() or public.is_super_admin())));

create or replace function public.on_extension_change()
returns trigger language plpgsql security definer set search_path = public
as $$
declare t record;
begin
  select id, title, assigned_by from public.tasks where id = new.task_id into t;
  if tg_op = 'INSERT' then
    if t.assigned_by is not null and t.assigned_by <> new.requested_by then
      insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
      values (t.assigned_by, 'extension_requested', 'Extension requested',
              public.member_name(new.requested_by) || ' asked for more time on "' || t.title || '": ' || left(new.reason, 100),
              '/tasks/' || t.id, 'ext_req:' || new.id);
    end if;
    perform public.log_activity(new.requested_by, 'task.extension_requested', 'task', t.id,
      public.member_name(new.requested_by) || ' requested an extension on "' || t.title || '"',
      'due_at', null, new.requested_due::text);
  elsif new.status is distinct from old.status and new.status in ('approved', 'denied') then
    insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
    values (new.requested_by,
            case when new.status = 'approved' then 'extension_approved' else 'extension_denied' end,
            case when new.status = 'approved' then 'Extension approved' else 'Extension declined' end,
            '"' || t.title || '"' || coalesce(' — ' || nullif(new.decision_note, ''), ''),
            '/tasks/' || t.id, 'ext_dec:' || new.id);
    perform public.log_activity(new.decided_by, 'task.extension_' || new.status, 'task', t.id,
      public.member_name(new.decided_by) || ' ' || new.status || ' an extension on "' || t.title || '"');
  end if;
  return new;
end; $$;
drop trigger if exists extension_activity on public.extension_requests;
create trigger extension_activity after insert or update on public.extension_requests
  for each row execute function public.on_extension_change();

-- ---------------------------------------------------------------------------
-- Task guard + change trigger, now aware of Blocked
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

  -- The deadline is the assigner's to move (assignees ask via an extension request),
  -- except that a delegator may set a new one for the person they hand the task to.
  if new.due_at is distinct from old.due_at and not is_reviewer
     and not (new.assignee_id is distinct from old.assignee_id and new.delegated_by = uid) then
    raise exception 'Only the person who assigned this task can move its deadline. Request an extension instead.';
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    if not public.is_exec_or_above() then
      raise exception 'Only executives can assign work to someone else.';
    end if;
    if not is_reviewer and not (
         is_assignee and new.delegated_by = uid
         and new.original_assignee_id is not distinct from coalesce(old.original_assignee_id, old.assignee_id)
       ) then
      raise exception 'Only the assigner, or an executive delegating their own task, can change the assignee.';
    end if;
  end if;

  if new.status is distinct from old.status then
    if is_assignee then
      ok := ok
        or (old.status in ('not_started', 'needs_revision', 'blocked') and new.status = 'in_progress')
        or (old.status = 'in_progress' and new.status = 'blocked')
        or (old.status = 'in_progress' and new.status = 'submitted')
        or (old.status = 'in_progress' and new.status = 'completed' and (is_reviewer or not old.require_approval));
    end if;
    if is_reviewer then
      ok := ok
        or (old.status = 'blocked' and new.status = 'in_progress')
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

  actor := auth.uid();
  actor_name := public.member_name(actor);

  if new.status is distinct from old.status then
    perform public.log_activity(actor, 'task.status_changed', 'task', new.id,
      actor_name || ' moved "' || new.title || '" from ' || replace(old.status::text, '_', ' ') || ' to ' || replace(new.status::text, '_', ' '),
      'status', old.status::text, new.status::text, new.project_id);

    if new.status = 'blocked' then
      new.blocked_at := coalesce(new.blocked_at, now());
    end if;

    if new.status = 'submitted' and new.assigned_by is not null and new.assigned_by is distinct from actor then
      insert into public.notifications (recipient_id, kind, title, body, link)
      values (new.assigned_by, 'task_submitted', 'Task submitted for review',
              actor_name || ' submitted "' || new.title || '"', '/tasks/' || new.id);
    elsif new.status = 'blocked' and new.assigned_by is not null and new.assigned_by is distinct from actor then
      insert into public.notifications (recipient_id, kind, title, body, link)
      values (new.assigned_by, 'task_blocked', 'A task is blocked',
              actor_name || ' is blocked on "' || new.title || '"' || coalesce(': ' || nullif(new.blocked_reason, ''), ''),
              '/tasks/' || new.id);
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

-- on_task_change now assigns a NEW column, so it must run BEFORE update.
drop trigger if exists tasks_notify on public.tasks;
create trigger tasks_notify before update on public.tasks
  for each row execute function public.on_task_change();
drop trigger if exists tasks_notify_insert on public.tasks;
create trigger tasks_notify_insert after insert on public.tasks
  for each row execute function public.on_task_change();
-- run the guard before the notifier (triggers fire alphabetically: tasks_guard < tasks_notify)

-- ---------------------------------------------------------------------------
-- Per-event notification preferences (the matrix)
-- ---------------------------------------------------------------------------
create table if not exists public.notification_prefs (
  member_id   uuid not null references public.team_members (id) on delete cascade,
  event_group text not null,
  in_app      boolean not null default true,
  email       boolean not null default true,
  push        boolean not null default true,
  sms         boolean not null default false,
  primary key (member_id, event_group)
);
alter table public.notification_prefs enable row level security;
drop policy if exists notification_prefs_own on public.notification_prefs;
create policy notification_prefs_own on public.notification_prefs for all to authenticated
  using (member_id = auth.uid()) with check (member_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Reminders driven by organisation settings (replaces the fixed schedule)
-- ---------------------------------------------------------------------------
create or replace function public.generate_task_reminders()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  stage text;
  local_now timestamp := (now() at time zone 'Africa/Nairobi');
  local_due timestamp;
  inserted int := 0;
  n int;
  tgt uuid;
  en7   boolean := public.org_setting('reminder_7d', 'false') = 'true';
  en3   boolean := public.org_setting('reminder_3d', 'true') = 'true';
  en1   boolean := public.org_setting('reminder_1d', 'true') = 'true';
  entd  boolean := public.org_setting('reminder_due_today', 'true') = 'true';
  en1h  boolean := public.org_setting('reminder_1h', 'false') = 'true';
  enov  boolean := public.org_setting('reminder_overdue', 'true') = 'true';
  enov1 boolean := public.org_setting('reminder_overdue_1d', 'true') = 'true';
  today_hour int := greatest(0, least(23, public.org_setting('due_today_hour', '7')::int));
  esc_hours  int := greatest(0, public.org_setting('escalate_after_hours', '24')::int);
  esc_assigner boolean := public.org_setting('escalate_assigner', 'true') = 'true';
  esc_manager  boolean := public.org_setting('escalate_manager', 'false') = 'true';
  esc_dept     boolean := public.org_setting('escalate_dept_director', 'false') = 'true';
  esc_director boolean := public.org_setting('escalate_director', 'false') = 'true';
  dir_id uuid := (select id from public.team_members where is_director and active limit 1);
begin
  for r in
    select t.id, t.title, t.due_at, t.assignee_id, t.assigned_by,
           tm.reports_to as manager_id, d.director_id as dept_director_id
      from public.tasks t
      left join public.team_members tm on tm.id = t.assignee_id
      left join public.departments d on d.id = coalesce(t.department_id, tm.department_id)
     where t.due_at is not null
       and t.assignee_id is not null
       and t.status in ('not_started', 'in_progress', 'needs_revision')
  loop
    local_due := (r.due_at at time zone 'Africa/Nairobi');

    -- The latest enabled stage that has been reached.
    stage := null;
    if en7  and now() >= r.due_at - interval '7 days' then stage := 'due_7d'; end if;
    if en3  and now() >= r.due_at - interval '3 days' then stage := 'due_3d'; end if;
    if en1  and now() >= r.due_at - interval '1 day'  then stage := 'due_1d'; end if;
    if entd and now() < r.due_at and local_due::date = local_now::date and local_now::time >= make_time(today_hour, 0, 0) then stage := 'due_today'; end if;
    if en1h and now() < r.due_at and now() >= r.due_at - interval '1 hour' then stage := 'due_1h'; end if;
    if enov  and now() >= r.due_at then stage := 'overdue'; end if;
    if enov1 and now() >= r.due_at + interval '24 hours' then stage := 'overdue_1d'; end if;

    if stage is not null then
      insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
      values (
        r.assignee_id, stage,
        case stage
          when 'due_7d' then 'Due in a week' when 'due_3d' then 'Due in 3 days' when 'due_1d' then 'Due tomorrow'
          when 'due_today' then 'Due today' when 'due_1h' then 'Due in one hour'
          when 'overdue' then 'Overdue' else 'Overdue by a day' end,
        '"' || r.title || '" — ' || case stage
          when 'due_7d' then 'due in 7 days.' when 'due_3d' then 'due in 3 days.' when 'due_1d' then 'due within 24 hours.'
          when 'due_today' then 'due today.' when 'due_1h' then 'due within the hour.'
          when 'overdue' then 'the deadline has passed.' else 'still not submitted after 24 hours.' end,
        '/tasks/' || r.id,
        'reminder:' || r.id || ':' || stage || ':' || extract(epoch from r.due_at)::bigint
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics n = row_count;
      inserted := inserted + n;
    end if;

    -- Escalation to the configured people once a task has been overdue long enough.
    if now() >= r.due_at + make_interval(hours => esc_hours) then
      for tgt in
        select distinct x from (values
          (case when esc_assigner then r.assigned_by end),
          (case when esc_manager  then r.manager_id end),
          (case when esc_dept     then r.dept_director_id end),
          (case when esc_director then dir_id end)
        ) v(x)
        where x is not null and x <> r.assignee_id
      loop
        insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
        values (
          tgt, 'overdue_escalation', 'A task is overdue',
          public.member_name(r.assignee_id) || '''s task "' || r.title || '" is overdue.',
          '/tasks/' || r.id,
          'reminder:' || r.id || ':esc:' || tgt || ':' || extract(epoch from r.due_at)::bigint
        )
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
        get diagnostics n = row_count;
        inserted := inserted + n;
      end loop;
    end if;
  end loop;
  return inserted;
end;
$$;
revoke all on function public.generate_task_reminders() from public, anon, authenticated;
grant execute on function public.generate_task_reminders() to service_role;

-- ---------------------------------------------------------------------------
-- Meeting reminders ("begins in 30 minutes") and the minutes prompt afterwards
-- ---------------------------------------------------------------------------
create or replace function public.generate_meeting_reminders()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  n int := 0; c int;
  lead int := greatest(0, public.org_setting('meeting_lead_minutes', '30')::int);
  prompt boolean := public.org_setting('meeting_minutes_prompt', 'true') = 'true';
begin
  if lead > 0 then
    insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
    select a.member_id, 'meeting_soon', 'Meeting starting soon',
           '"' || m.title || '" begins at ' || to_char(m.starts_at at time zone 'Africa/Nairobi', 'HH24:MI'),
           '/meetings/' || m.id,
           'meeting_soon:' || m.id || ':' || a.member_id || ':' || extract(epoch from m.starts_at)::bigint
      from public.meetings m
      join public.meeting_attendees a on a.meeting_id = m.id
      join public.team_members tm on tm.id = a.member_id and tm.active
     where m.status = 'scheduled'
       and now() >= m.starts_at - make_interval(mins => lead) and now() < m.starts_at
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics c = row_count; n := n + c;
  end if;

  if prompt then
    insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
    select m.created_by, 'minutes_prompt', 'Add the minutes and action items',
           '"' || m.title || '" has ended. Record the minutes and turn what was agreed into tasks.',
           '/meetings/' || m.id, 'minutes:' || m.id
      from public.meetings m
     where m.created_by is not null and m.status in ('scheduled', 'held') and m.minutes is null
       and coalesce(m.ends_at, m.starts_at + interval '1 hour') < now()
       and coalesce(m.ends_at, m.starts_at + interval '1 hour') > now() - interval '3 days'
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics c = row_count; n := n + c;
  end if;
  return n;
end;
$$;
revoke all on function public.generate_meeting_reminders() from public, anon, authenticated;
grant execute on function public.generate_meeting_reminders() to service_role;
