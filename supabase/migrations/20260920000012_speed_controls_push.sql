-- MUI Team App, migration 12: speed, edit/delete controls, push notifications for updates.
-- Safe to re-run. Requires migrations 1-11.

-- Automated test accounts are named "ZZ...". They must never notify real people, so every broadcast
-- below (and the announcement publisher) limits a test author's audience to other test accounts.
create or replace function public.is_test_name(t text)
returns boolean language sql immutable as $$ select coalesce(t like 'ZZ%', false) $$;

-- Remove notices that automated tests leaked to real people before this safeguard existed.
delete from public.notifications
 where title ilike '%ZZTEST%' or body ilike '%ZZTEST%' or title ilike '%ZZUI%' or body ilike '%ZZUI%'
    or title ilike '%ZZPERF%' or body ilike '%ZZPERF%';

-- ===========================================================================
-- A. SPEED
-- ===========================================================================

-- One round trip for everything a page shell needs (the member, their access, settings, badges).
-- SECURITY INVOKER: row-level security applies exactly as if each query ran separately.
create or replace function public.shell_data()
returns jsonb
language sql stable security invoker set search_path = public
as $$
  select jsonb_build_object(
    'member',   (select to_jsonb(m) from public.team_members m where m.id = auth.uid()),
    'directed', coalesce((select jsonb_agg(d.id) from public.departments d where d.director_id = auth.uid()), '[]'::jsonb),
    'settings', coalesce((select jsonb_object_agg(s.key, s.value) from public.org_settings s), '{}'::jsonb),
    'matrix',   coalesce((select jsonb_agg(jsonb_build_object('level', p.level, 'capability', p.capability, 'allowed', p.allowed)) from public.role_permissions p), '[]'::jsonb),
    'grants',   coalesce((select jsonb_agg(jsonb_build_object('capability', g.capability, 'allowed', g.allowed, 'expires_at', g.expires_at))
                            from public.member_grants g
                           where g.member_id = auth.uid() and (g.expires_at is null or g.expires_at > now())), '[]'::jsonb),
    'prefs',    coalesce((select jsonb_agg(jsonb_build_object('event_group', n.event_group, 'in_app', n.in_app, 'email', n.email, 'push', n.push, 'sms', n.sms))
                            from public.notification_prefs n where n.member_id = auth.uid()), '[]'::jsonb),
    'unread',   coalesce((select jsonb_object_agg(u.kind, u.c)
                            from (select kind, count(*) as c from public.notifications
                                   where recipient_id = auth.uid() and read_at is null group by kind) u), '{}'::jsonb),
    'chat_unread', coalesce((select sum(c.unread) from public.chat_unread_counts() c), 0)
  )
$$;
grant execute on function public.shell_data() to authenticated;

-- Row-level security that evaluates once per query instead of once per row.
create or replace function public.my_line_ids()
returns setof uuid language sql stable security definer set search_path = public
as $$
  with recursive line as (
    select id from public.team_members where id = auth.uid()
    union
    select m.id from public.team_members m join line l on m.reports_to = l.id
  ) select id from line
$$;

create or replace function public.my_directed_member_ids()
returns setof uuid language sql stable security definer set search_path = public
as $$
  select m.id from public.departments d join public.team_members m on m.department_id = d.id where d.director_id = auth.uid()
$$;

create or replace function public.my_channel_ids()
returns setof uuid language sql stable security definer set search_path = public
as $$ select c.id from public.channels c where public.channel_accessible_by(c.id, auth.uid()) $$;

drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated
  using (
    (select public.has_org_view())
    or assignee_id = (select auth.uid())
    or assigned_by = (select auth.uid())
    or delegated_by = (select auth.uid())
    or original_assignee_id = (select auth.uid())
    or assignee_id in (select public.my_directed_member_ids())
    or ((select public.current_team_role()) = 'executive'
        and (assignee_id in (select public.my_line_ids()) or assigned_by in (select public.my_line_ids())))
  );

drop policy if exists channels_read on public.channels;
create policy channels_read on public.channels for select to authenticated
  using (id in (select public.my_channel_ids()));
drop policy if exists channel_members_read on public.channel_members;
create policy channel_members_read on public.channel_members for select to authenticated
  using (channel_id in (select public.my_channel_ids()));
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated
  using (channel_id in (select public.my_channel_ids()));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (author_id = (select auth.uid()) and channel_id in (select public.my_channel_ids()));

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

drop policy if exists activity_read on public.activity_log;
create policy activity_read on public.activity_log for select to authenticated
  using (
    (select public.has_org_view())
    or actor_id = (select auth.uid())
    or (entity_type = 'task'     and exists (select 1 from public.tasks t     where t.id = entity_id))
    or (entity_type = 'project'  and exists (select 1 from public.projects p  where p.id = entity_id))
    or (entity_type = 'meeting'  and exists (select 1 from public.meetings m  where m.id = entity_id))
    or (entity_type = 'report'   and exists (select 1 from public.reports r   where r.id = entity_id))
    or (entity_type in ('decision', 'resource', 'announcement') and (select public.is_team_member()))
  );

create index if not exists tasks_assigned_by_idx   on public.tasks (assigned_by);
create index if not exists tasks_status_due_idx    on public.tasks (status, due_at);
create index if not exists activity_entity_idx     on public.activity_log (entity_type, entity_id, created_at desc);
create index if not exists notifications_kind_idx  on public.notifications (recipient_id, kind) where read_at is null;
create index if not exists meeting_attendees_meeting_idx on public.meeting_attendees (meeting_id);

-- Live updates for the places people wait on.
do $$ begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.tasks;         exception when duplicate_object then null; when undefined_object then null; end $$;

-- ===========================================================================
-- B. EDIT / DELETE CONTROLS
-- ===========================================================================

-- Messages can be edited by their author (and only their author); the edit is marked.
alter table public.messages add column if not exists edited_at timestamptz;

create or replace function public.guard_message_update()
returns trigger language plpgsql as $$
begin
  if new.author_id is distinct from old.author_id
     or new.channel_id is distinct from old.channel_id
     or new.mentions is distinct from old.mentions
     or new.refs is distinct from old.refs
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the text of a message can be changed.';
  end if;
  if new.body is distinct from old.body then
    if old.author_id is distinct from auth.uid() then
      raise exception 'Only the author can edit a message.';
    end if;
    if old.deleted_at is not null then
      raise exception 'A deleted message cannot be edited.';
    end if;
    new.edited_at := now();
  end if;
  return new;
end; $$;

-- Per-person, per-channel mute (used by chat push notifications below).
alter table public.channel_reads add column if not exists muted boolean not null default false;

-- Uploaders (and system admins) can correct a resource's details.
drop policy if exists resources_update on public.resources;
create policy resources_update on public.resources for update to authenticated
  using (uploaded_by = auth.uid() or public.is_super_admin())
  with check (uploaded_by = auth.uid() or public.is_super_admin());

-- A system admin can also remove someone's draft report.
drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports for delete to authenticated
  using ((author_id = auth.uid() and status = 'draft') or public.is_super_admin());

-- ===========================================================================
-- C. PUSH FOR UPDATES
-- ===========================================================================

-- Chat: every channel message reaches the people who can see the channel (except the author, anyone
-- who muted it, and anyone already told about it via an @mention). To avoid a flood, a person
-- with an unread chat notice from the same channel in the last 2 minutes is not pinged again.
create or replace function public.on_message_created()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  target uuid;
  author_name text;
  chan record;
begin
  select full_name into author_name from public.team_members where id = new.author_id;
  select name, kind into chan from public.channels where id = new.channel_id;

  if chan.kind = 'direct' then
    for target in select member_id from public.channel_members where channel_id = new.channel_id and member_id <> new.author_id loop
      insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
      values (target, 'dm', author_name || ' sent you a message', left(new.body, 140),
              '/chat/' || new.channel_id, 'dm:' || new.id || ':' || target)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end loop;
    return new;
  end if;

  foreach target in array new.mentions loop
    if target <> new.author_id and public.channel_accessible_by(new.channel_id, target) then
      insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
      values (target, 'mention', author_name || ' mentioned you in #' || chan.name, left(new.body, 140),
              '/chat/' || new.channel_id, 'mention:' || new.id || ':' || target)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end loop;

  for target in
    select tm.id
      from public.team_members tm
     where tm.active and tm.id <> new.author_id
       and not (tm.id = any (new.mentions))
       and public.channel_accessible_by(new.channel_id, tm.id)
       and (not public.is_test_name(author_name) or public.is_test_name(tm.full_name))
       and not coalesce((select r.muted from public.channel_reads r where r.channel_id = new.channel_id and r.member_id = tm.id), false)
       and not exists (
         select 1 from public.notifications n
          where n.recipient_id = tm.id and n.kind = 'chat' and n.link = '/chat/' || new.channel_id
            and n.read_at is null and n.created_at > now() - interval '2 minutes')
  loop
    insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
    values (target, 'chat', author_name || ' in #' || chan.name, left(new.body, 140),
            '/chat/' || new.channel_id, 'chat:' || new.id || ':' || target)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end loop;
  return new;
end; $$;

-- Someone's role profile, level, title, department, manager or responsibilities changed: tell them.
create or replace function public.on_member_profile_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare changed text[] := '{}';
begin
  if new.title is distinct from old.title then changed := changed || 'title'; end if;
  if new.role is distinct from old.role then changed := changed || 'access level'; end if;
  if new.department_id is distinct from old.department_id then changed := changed || 'department'; end if;
  if new.reports_to is distinct from old.reports_to then changed := changed || 'who you report to'; end if;
  if new.mandate is distinct from old.mandate then changed := changed || 'mandate'; end if;
  if new.authority is distinct from old.authority then changed := changed || 'authority'; end if;
  if new.responsibilities is distinct from old.responsibilities then changed := changed || 'responsibilities'; end if;
  if new.deliverables is distinct from old.deliverables then changed := changed || 'deliverables'; end if;
  if new.success_measures is distinct from old.success_measures then changed := changed || 'success measures'; end if;
  if new.is_director is distinct from old.is_director then changed := changed || 'Executive Director role'; end if;

  if array_length(changed, 1) > 0 and new.active then
    insert into public.notifications (recipient_id, kind, title, body, link)
    values (new.id, 'team_update', 'Your role was updated',
            'Changed: ' || array_to_string(changed, ', ') || '.', '/responsibilities');
  end if;
  return new;
end; $$;
drop trigger if exists member_profile_changed on public.team_members;
create trigger member_profile_changed after update on public.team_members
  for each row execute function public.on_member_profile_change();

-- A new person joins: the team hears about it.
create or replace function public.on_member_joined()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role::text <> 'guest' then
    insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
    select tm.id, 'team_update', new.full_name || ' joined the team',
           coalesce(new.title, 'New team member'), '/people/' || new.id, 'joined:' || new.id || ':' || tm.id
      from public.team_members tm
     where tm.active and tm.id <> new.id and tm.role::text <> 'guest'
       and (not public.is_test_name(new.full_name) or public.is_test_name(tm.full_name))
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists member_joined on public.team_members;
create trigger member_joined after insert on public.team_members
  for each row execute function public.on_member_joined();

-- A decision is recorded / an event is added: everyone it concerns is told.
create or replace function public.on_decision_recorded()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
  select tm.id, 'team_update', 'New decision #' || lpad(new.number::text, 3, '0'), new.title, '/decisions',
         'decision:' || new.id || ':' || tm.id
    from public.team_members tm
   where tm.active and tm.role::text <> 'guest' and tm.id is distinct from new.created_by
     and (not public.is_test_name(public.member_name(new.created_by)) or public.is_test_name(tm.full_name))
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end; $$;
drop trigger if exists decision_notify on public.decisions;
create trigger decision_notify after insert on public.decisions
  for each row execute function public.on_decision_recorded();

create or replace function public.on_event_added()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
  select tm.id, 'team_update', 'New on the calendar: ' || new.title,
         to_char(new.starts_at at time zone 'Africa/Nairobi', 'Dy DD Mon'), '/calendar/events/' || new.id,
         'event:' || new.id || ':' || tm.id
    from public.team_members tm
   where tm.active and tm.role::text <> 'guest' and tm.id is distinct from new.created_by
     and (new.visibility = 'everyone' or tm.role::text in ('executive', 'super_admin'))
     and (not public.is_test_name(public.member_name(new.created_by)) or public.is_test_name(tm.full_name))
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end; $$;
drop trigger if exists event_notify on public.calendar_events;
create trigger event_notify after insert on public.calendar_events
  for each row execute function public.on_event_added();

-- A project changes status, owner or due date: its people are told.
create or replace function public.on_project_change_notify()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare what text;
begin
  if new.status is distinct from old.status then what := 'status is now ' || replace(new.status, '_', ' ');
  elsif new.owner_id is distinct from old.owner_id then what := 'has a new director';
  elsif new.due_date is distinct from old.due_date then what := 'has a new due date';
  else return new; end if;

  insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
  select distinct p.id, 'project_update', new.name || ' ' || what, null, '/projects/' || new.id,
         'project:' || new.id || ':' || p.id || ':' || extract(epoch from now())::bigint
    from (
      select owner_id as id from public.projects where id = new.id
      union select member_id from public.project_members where project_id = new.id
      union select assignee_id from public.tasks where project_id = new.id and assignee_id is not null
    ) p
   where p.id is not null and p.id is distinct from auth.uid()
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end; $$;
drop trigger if exists project_notify on public.projects;
create trigger project_notify after update on public.projects
  for each row execute function public.on_project_change_notify();

-- Access changes and a new department director are worth a ping too.
create or replace function public.on_grant_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
  values (new.member_id, 'team_update', 'Your access was updated', 'What you can do in the app has changed.', '/account',
          'grant:' || new.member_id || ':' || (extract(epoch from now())::bigint / 60))
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end; $$;
drop trigger if exists grant_notify on public.member_grants;
create trigger grant_notify after insert on public.member_grants
  for each row execute function public.on_grant_change();

create or replace function public.on_department_director_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.director_id is not null and new.director_id is distinct from old.director_id then
    insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
    values (new.director_id, 'team_update', 'You now lead ' || new.name, 'You can see and assign work within the department.',
            '/departments/' || new.id, 'dept-director:' || new.id || ':' || new.director_id)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists department_director_notify on public.departments;
create trigger department_director_notify after update on public.departments
  for each row execute function public.on_department_director_change();

-- The announcement publisher, with the same test-account safeguard.
create or replace function public.publish_due_announcements()
returns int
language plpgsql security definer set search_path = public
as $$
declare a record; n int := 0; c int; author text;
begin
  for a in select * from public.announcements where notified_at is null and publish_at <= now() loop
    author := public.member_name(a.created_by);
    insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
    select tm.id,
           case when a.priority = 'urgent' then 'announcement_urgent' else 'announcement' end,
           'Official announcement: ' || a.title, left(a.body, 140), '/announcements',
           'announcement:' || a.id || ':' || tm.id
      from public.team_members tm
     where tm.active and tm.id is distinct from a.created_by
       and (a.audience = 'all'
            or (a.audience = 'executives' and tm.role in ('executive', 'super_admin'))
            or (a.audience = 'department' and tm.department_id = a.department_id))
       and (not public.is_test_name(author) or public.is_test_name(tm.full_name))
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics c = row_count;
    n := n + c;
    update public.announcements set notified_at = now() where id = a.id;
    perform public.log_activity(a.created_by, 'announcement.published', 'announcement', a.id,
      author || ' published an announcement: ' || a.title);
  end loop;
  return n;
end;
$$;
revoke all on function public.publish_due_announcements() from public, anon, authenticated;
grant execute on function public.publish_due_announcements() to service_role;
