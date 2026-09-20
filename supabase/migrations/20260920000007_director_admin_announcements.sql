-- MUI Team App: Executive Director vs System Admin, official announcements,
-- delegated (time-boxed) admin access, onboarding checklist, campaigns.
-- Safe to re-run. Requires migrations 1-6.
--
-- Model
--   * role 'super_admin' = SYSTEM ADMIN: runs the platform (people, roles, onboarding, campaigns,
--     analytics, health). Can be delegated to a secretary or any executive, even temporarily.
--   * is_director = the EXECUTIVE DIRECTOR: an executive who additionally sees the whole
--     organisation and alone can publish official announcements and delegate admin access.

-- ---------------------------------------------------------------------------
-- Director flag + delegated-admin bookkeeping
-- ---------------------------------------------------------------------------
alter table public.team_members
  add column if not exists is_director       boolean not null default false,
  add column if not exists admin_until       timestamptz,
  add column if not exists admin_granted_by  uuid references public.team_members (id) on delete set null,
  add column if not exists role_before_admin public.team_role;

create unique index if not exists team_members_one_director
  on public.team_members ((true)) where is_director;

create or replace function public.is_director()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.team_members where id = auth.uid() and active and is_director) $$;

-- Whole-organisation READ access: system admins and the Executive Director.
create or replace function public.has_org_view()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_super_admin() or public.is_director() $$;

-- The bootstrap account was titled "Executive Director"; it is the system admin account.
update public.team_members
   set title = 'System Administrator'
 where lower(email) = 'micdupinitiative@gmail.com' and role = 'super_admin' and title = 'Executive Director';

-- ---------------------------------------------------------------------------
-- Org-wide read for the Director (policies/functions redefined)
-- ---------------------------------------------------------------------------
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated
  using (
    public.has_org_view()
    or assignee_id = auth.uid()
    or assigned_by = auth.uid()
    or delegated_by = auth.uid()
    or original_assignee_id = auth.uid()
    or (public.current_team_role() = 'executive'
        and (public.in_my_reporting_line(assignee_id) or public.in_my_reporting_line(assigned_by)))
  );

drop policy if exists activity_read on public.activity_log;
create policy activity_read on public.activity_log for select to authenticated
  using (
    public.has_org_view()
    or actor_id = auth.uid()
    or (entity_type = 'task'     and exists (select 1 from public.tasks t     where t.id = entity_id))
    or (entity_type = 'project'  and exists (select 1 from public.projects p  where p.id = entity_id))
    or (entity_type = 'meeting'  and exists (select 1 from public.meetings m  where m.id = entity_id))
    or (entity_type = 'report'   and exists (select 1 from public.reports r   where r.id = entity_id))
    or (entity_type in ('decision', 'resource', 'announcement') and public.is_team_member())
  );

drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select to authenticated
  using (
    author_id = auth.uid()
    or public.is_super_admin()
    or (status = 'submitted' and public.is_director())
    or (status = 'submitted' and public.current_team_role() = 'executive' and (
          public.in_my_reporting_line(author_id)
          or (kind = 'department' and department_id is not null and department_id =
                (select tm.department_id from public.team_members tm where tm.id = auth.uid()))))
  );

create or replace function public.can_see_meeting(mid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.has_org_view()
      or exists (select 1 from public.meetings m where m.id = mid and m.created_by = auth.uid())
      or exists (select 1 from public.meeting_attendees a where a.meeting_id = mid and a.member_id = auth.uid())
$$;

create or replace function public.channel_accessible_by(cid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.channels c
      join public.team_members tm on tm.id = uid and tm.active
     where c.id = cid
       and (
         tm.role = 'super_admin' or tm.is_director
         or c.kind = 'general'
         or (c.kind = 'executive' and tm.role = 'executive')
         or (c.kind = 'department' and tm.department_id = c.department_id)
         or (c.kind = 'project' and (
               exists (select 1 from public.projects p where p.id = c.project_id and p.owner_id = uid)
            or exists (select 1 from public.project_members pm where pm.project_id = c.project_id and pm.member_id = uid)
            or exists (select 1 from public.tasks t where t.project_id = c.project_id and t.assignee_id = uid)))
         or (c.kind = 'group' and exists (
               select 1 from public.channel_members cm where cm.channel_id = c.id and cm.member_id = uid))
       )
  )
$$;

-- ---------------------------------------------------------------------------
-- Official announcements (Executive Director only publishes)
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null,
  audience      text not null default 'all' check (audience in ('all', 'executives', 'department')),
  department_id uuid references public.departments (id) on delete set null,
  priority      text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  publish_at    timestamptz not null default now(),
  notified_at   timestamptz,
  created_by    uuid references public.team_members (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (audience <> 'department' or department_id is not null)
);
create index if not exists announcements_publish_idx on public.announcements (publish_at desc);
alter table public.announcements enable row level security;

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
  using (
    public.has_org_view()
    or (
      public.is_team_member() and publish_at <= now() and (
        audience = 'all'
        or (audience = 'executives' and public.is_exec_or_above())
        or (audience = 'department' and department_id = (select tm.department_id from public.team_members tm where tm.id = auth.uid()))
      )
    )
  );
drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements for insert to authenticated
  with check (public.is_director() and created_by = auth.uid());
drop policy if exists announcements_update on public.announcements;
create policy announcements_update on public.announcements for update to authenticated
  using (public.is_director()) with check (public.is_director());
drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete on public.announcements for delete to authenticated
  using (public.is_director());

-- Notify the audience once an announcement's publish time has arrived. Run by the scheduler
-- (and straight after publishing "now"), so scheduled announcements go out on time.
create or replace function public.publish_due_announcements()
returns int
language plpgsql security definer set search_path = public
as $$
declare a record; n int := 0; c int;
begin
  for a in select * from public.announcements where notified_at is null and publish_at <= now() loop
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
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics c = row_count;
    n := n + c;
    update public.announcements set notified_at = now() where id = a.id;
    perform public.log_activity(a.created_by, 'announcement.published', 'announcement', a.id,
      public.member_name(a.created_by) || ' published an announcement: ' || a.title);
  end loop;
  return n;
end;
$$;
revoke all on function public.publish_due_announcements() from public, anon, authenticated;
grant execute on function public.publish_due_announcements() to service_role;

-- ---------------------------------------------------------------------------
-- Delegated system-admin access expires by itself
-- ---------------------------------------------------------------------------
create or replace function public.expire_admin_delegations()
returns int
language plpgsql security definer set search_path = public
as $$
declare r record; n int := 0;
begin
  for r in
    update public.team_members
       set role = coalesce(role_before_admin, 'member'),
           admin_until = null, role_before_admin = null, admin_granted_by = null
     where role = 'super_admin' and admin_until is not null and admin_until < now()
    returning id, full_name, role
  loop
    perform public.log_activity(null, 'member.admin_expired', 'member', r.id,
      r.full_name || '''s delegated system-admin access ended', 'role', 'super_admin', r.role::text);
    insert into public.notifications (recipient_id, kind, title, body, link)
    values (r.id, 'admin_expired', 'System-admin access ended',
            'Your delegated system-admin access has ended.', '/');
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.expire_admin_delegations() from public, anon, authenticated;
grant execute on function public.expire_admin_delegations() to service_role;

-- ---------------------------------------------------------------------------
-- Onboarding: welcome message + checklist that every new member gets
-- ---------------------------------------------------------------------------
create table if not exists public.org_settings (
  key   text primary key,
  value text not null default ''
);
alter table public.org_settings enable row level security;
drop policy if exists org_settings_read on public.org_settings;
create policy org_settings_read on public.org_settings for select to authenticated using (public.is_team_member());
drop policy if exists org_settings_write on public.org_settings;
create policy org_settings_write on public.org_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create table if not exists public.onboarding_items (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  link        text,
  position    int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.onboarding_items enable row level security;
drop policy if exists onboarding_items_read on public.onboarding_items;
create policy onboarding_items_read on public.onboarding_items for select to authenticated using (public.is_team_member());
drop policy if exists onboarding_items_write on public.onboarding_items;
create policy onboarding_items_write on public.onboarding_items for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create table if not exists public.member_onboarding (
  member_id uuid not null references public.team_members (id) on delete cascade,
  item_id   uuid not null references public.onboarding_items (id) on delete cascade,
  done_at   timestamptz,
  primary key (member_id, item_id)
);
alter table public.member_onboarding enable row level security;
drop policy if exists member_onboarding_read on public.member_onboarding;
create policy member_onboarding_read on public.member_onboarding for select to authenticated
  using (member_id = auth.uid() or public.is_super_admin());
drop policy if exists member_onboarding_update on public.member_onboarding;
create policy member_onboarding_update on public.member_onboarding for update to authenticated
  using (member_id = auth.uid()) with check (member_id = auth.uid());

create or replace function public.seed_member_onboarding()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.member_onboarding (member_id, item_id)
  select new.id, i.id from public.onboarding_items i where i.active
  on conflict do nothing;
  return new;
end; $$;
drop trigger if exists member_onboarding_seed on public.team_members;
create trigger member_onboarding_seed after insert on public.team_members
  for each row execute function public.seed_member_onboarding();

insert into public.org_settings (key, value)
select 'welcome_message',
       'Welcome to the MUI Team app. This is where we work: your role, your tasks and deadlines, and what the team is doing. Start with the checklist below.'
 where not exists (select 1 from public.org_settings where key = 'welcome_message');

insert into public.onboarding_items (title, description, link, position)
select * from (values
  ('Read your role and responsibilities', 'Know what you own, what you can decide, and what is expected of you.', '/responsibilities', 1),
  ('Add your phone number and set your notifications', 'So reminders and assignments reach you.', '/account', 2),
  ('Turn on notifications on your phone', 'Install the app to your home screen and allow notifications.', '/account', 3),
  ('Say hello in #General', 'Introduce yourself to the team.', '/chat', 4),
  ('Read the governance documents and policies', 'Everything the initiative runs on lives in Resources.', '/resources', 5)
) as v(title, description, link, position)
where not exists (select 1 from public.onboarding_items);

-- ---------------------------------------------------------------------------
-- Campaigns: a targeted message to part of the team over chosen channels
-- ---------------------------------------------------------------------------
create table if not exists public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  body            text not null,
  link            text,
  audience        text not null,        -- e.g. all, executives, members, department:<uuid>, people
  channels        text[] not null default '{}',
  recipient_count int not null default 0,
  sent_by         uuid references public.team_members (id) on delete set null,
  created_at      timestamptz not null default now()
);
alter table public.campaigns enable row level security;
drop policy if exists campaigns_read on public.campaigns;
create policy campaigns_read on public.campaigns for select to authenticated using (public.has_org_view());
-- (rows are written by the server with the service role after checking the sender)
