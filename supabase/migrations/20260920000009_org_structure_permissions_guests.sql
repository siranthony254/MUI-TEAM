-- MUI Team App, migration 9: department directors + department views, permission matrix,
-- guest role, profile setup. Safe to re-run. Requires migrations 1-8.

-- ---------------------------------------------------------------------------
-- Guest / external collaborator role
-- ---------------------------------------------------------------------------
alter type public.team_role add value if not exists 'guest';
-- NOTE: a brand-new enum value cannot be used by a SQL-language function in the same script that adds
-- it, so the functions below compare role::text. (PL/pgSQL bodies are only checked when they run.)

-- "Team member" now means an internal member: guests are excluded, so every broad
-- "any team member may read" policy (directory, resources, decisions, announcements...)
-- automatically stays closed to them.
create or replace function public.is_team_member()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.team_members where id = auth.uid() and active and role::text <> 'guest') $$;

-- Everyone can read their own row (guests included), or they could not even sign in.
drop policy if exists team_members_self on public.team_members;
create policy team_members_self on public.team_members for select to authenticated using (id = auth.uid());

-- Guests may see just enough people to make their work make sense: whoever gave them tasks,
-- and co-members of their projects.
-- (A policy must not query its own table directly, or Postgres reports infinite recursion,
--  so "am I a guest?" goes through a SECURITY DEFINER helper.)
create or replace function public.is_guest()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.team_members where id = auth.uid() and active and role::text = 'guest') $$;

drop policy if exists team_members_guest_context on public.team_members;
create policy team_members_guest_context on public.team_members for select to authenticated
  using (
    public.is_guest()
    and (
      exists (select 1 from public.tasks t where t.assignee_id = auth.uid() and t.assigned_by = team_members.id)
      or exists (select 1 from public.project_members a join public.project_members b on a.project_id = b.project_id
                  where a.member_id = auth.uid() and b.member_id = team_members.id)
    )
  );

-- Guests only ever reach chat channels they are explicitly part of (never #General or department channels).
create or replace function public.channel_accessible_by(cid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.channels c
      join public.team_members tm on tm.id = uid and tm.active
     where c.id = cid
       and (
         (tm.role = 'super_admin' or tm.is_director) and c.kind <> 'direct'
         or (c.kind = 'general' and tm.role::text <> 'guest')
         or (c.kind = 'executive' and tm.role = 'executive')
         or (c.kind = 'department' and tm.department_id = c.department_id)
         or (c.kind = 'project' and (
               exists (select 1 from public.projects p where p.id = c.project_id and p.owner_id = uid)
            or exists (select 1 from public.project_members pm where pm.project_id = c.project_id and pm.member_id = uid)
            or exists (select 1 from public.tasks t where t.project_id = c.project_id and t.assignee_id = uid)))
         or (c.kind in ('group', 'direct') and exists (
               select 1 from public.channel_members cm where cm.channel_id = c.id and cm.member_id = uid))
       )
  )
$$;

-- Project files are visible to anyone who can see the project (which includes guests on it).
drop policy if exists resources_read on public.resources;
create policy resources_read on public.resources for select to authenticated
  using (
    (public.is_team_member()
      and (visibility = 'everyone' or public.is_exec_or_above())
      and (project_id is null or exists (select 1 from public.projects p where p.id = project_id)))
    or (project_id is not null and visibility = 'everyone'
        and exists (select 1 from public.projects p where p.id = project_id))
  );

-- Guests do not get the onboarding checklist.
create or replace function public.seed_member_onboarding()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.role = 'guest' then return new; end if;
  insert into public.member_onboarding (member_id, item_id)
  select new.id, i.id from public.onboarding_items i where i.active
  on conflict do nothing;
  return new;
end; $$;

-- ---------------------------------------------------------------------------
-- Department directors
-- ---------------------------------------------------------------------------
create or replace function public.directs_department(dept uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.departments where id = dept and director_id = auth.uid()) $$;

create or replace function public.is_dept_director_of(member uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.departments d
      join public.team_members m on m.department_id = d.id
     where d.director_id = auth.uid() and m.id = member
  )
$$;

drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated
  using (
    public.has_org_view()
    or assignee_id = auth.uid()
    or assigned_by = auth.uid()
    or delegated_by = auth.uid()
    or original_assignee_id = auth.uid()
    or public.is_dept_director_of(assignee_id)
    or (public.current_team_role() = 'executive'
        and (public.in_my_reporting_line(assignee_id) or public.in_my_reporting_line(assigned_by)))
  );

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    public.is_team_member()
    and assigned_by = auth.uid()
    and (public.is_exec_or_above() or assignee_id = auth.uid() or public.is_dept_director_of(assignee_id))
  );

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (
    author_id = auth.uid() and public.is_team_member()
    and (kind = 'personal' or public.is_exec_or_above() or public.directs_department(department_id))
  );

drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select to authenticated
  using (
    author_id = auth.uid()
    or public.is_super_admin()
    or (status = 'submitted' and public.is_director())
    or (status = 'submitted' and public.is_dept_director_of(author_id))
    or (status = 'submitted' and public.current_team_role() = 'executive' and (
          public.in_my_reporting_line(author_id)
          or (kind = 'department' and department_id is not null and department_id =
                (select tm.department_id from public.team_members tm where tm.id = auth.uid()))))
  );

-- A department director may (re)assign work to their own department's members, like an executive.
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

  if new.due_at is distinct from old.due_at and not is_reviewer
     and not (new.assignee_id is distinct from old.assignee_id and new.delegated_by = uid) then
    raise exception 'Only the person who assigned this task can move its deadline. Request an extension instead.';
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    if not (public.is_exec_or_above() or public.is_dept_director_of(new.assignee_id)) then
      raise exception 'Only executives (or a department director, within their department) can assign work to someone else.';
    end if;
    if not is_reviewer and not (
         is_assignee and new.delegated_by = uid
         and new.original_assignee_id is not distinct from coalesce(old.original_assignee_id, old.assignee_id)
       ) then
      raise exception 'Only the assigner, or someone delegating their own task, can change the assignee.';
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

-- Department directory numbers (everyone internal may see counts; member-level detail is restricted).
create or replace function public.department_stats_all()
returns table (department_id uuid, member_count int, open_count int, overdue_count int, done_30d int)
language sql stable security definer set search_path = public
as $$
  select d.id,
         (count(distinct m.id) filter (where m.active))::int,
         (count(t.id) filter (where t.status not in ('completed', 'closed')))::int,
         (count(t.id) filter (where t.due_at < now() and t.status not in ('completed', 'closed')))::int,
         (count(t.id) filter (where t.completed_at > now() - interval '30 days'))::int
    from public.departments d
    left join public.team_members m on m.department_id = d.id
    left join public.tasks t on t.assignee_id = m.id
   where public.is_team_member()
   group by d.id
$$;
grant execute on function public.department_stats_all() to authenticated;

create or replace function public.department_member_load(did uuid)
returns table (member_id uuid, open_count int, overdue_count int, done_30d int)
language sql stable security definer set search_path = public
as $$
  select m.id,
         (count(t.id) filter (where t.status not in ('completed', 'closed')))::int,
         (count(t.id) filter (where t.due_at < now() and t.status not in ('completed', 'closed')))::int,
         (count(t.id) filter (where t.completed_at > now() - interval '30 days'))::int
    from public.team_members m
    left join public.tasks t on t.assignee_id = m.id
   where m.department_id = did and m.active
     and (public.has_org_view() or public.is_exec_or_above() or public.directs_department(did))
   group by m.id
$$;
grant execute on function public.department_member_load(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Permission matrix (what each level may do). System admins can always do everything.
-- Enforced in the application's server actions; the database keeps its own stricter baseline.
-- ---------------------------------------------------------------------------
create table if not exists public.role_permissions (
  level      text not null check (level in ('executive', 'department_director', 'member')),
  capability text not null,
  allowed    boolean not null,
  primary key (level, capability)
);
alter table public.role_permissions enable row level security;
drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
-- (written by the server with the service role after checking the caller is a system admin)

insert into public.role_permissions (level, capability, allowed)
select l.level, c.capability,
       case
         when l.level = 'executive' then c.capability <> 'send_campaign'
         when l.level = 'department_director' then c.capability in ('assign_tasks', 'submit_department_report', 'add_event', 'add_resource')
         else false
       end
  from (values ('executive'), ('department_director'), ('member')) as l(level)
  cross join (values
    ('create_project'), ('assign_tasks'), ('delegate_tasks'), ('schedule_meeting'), ('record_decision'),
    ('add_event'), ('add_resource'), ('create_group_chat'), ('send_campaign'), ('view_analytics'),
    ('submit_department_report')
  ) as c(capability)
 where not exists (select 1 from public.role_permissions);

-- ---------------------------------------------------------------------------
-- Profile setup (first login) and private details
-- ---------------------------------------------------------------------------
alter table public.team_members
  add column if not exists preferred_name text,
  add column if not exists avatar_url text,
  add column if not exists profile_completed_at timestamptz;

-- Everyone who already exists is considered set up; only new members are guided through it.
update public.team_members set profile_completed_at = now() where profile_completed_at is null;

create table if not exists public.member_private (
  member_id         uuid primary key references public.team_members (id) on delete cascade,
  emergency_contact text,
  updated_at        timestamptz not null default now()
);
alter table public.member_private enable row level security;
drop policy if exists member_private_own on public.member_private;
create policy member_private_own on public.member_private for all to authenticated
  using (member_id = auth.uid()) with check (member_id = auth.uid());
drop policy if exists member_private_admin on public.member_private;
create policy member_private_admin on public.member_private for select to authenticated
  using (public.is_super_admin());

-- Profile photos: a public bucket (photos are shown across the app); uploads go through signed URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 3145728)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Direct log of who was asked to log in with a phone number (no data; nothing to add)
-- ---------------------------------------------------------------------------

-- Members update their OWN profile details through this narrow function (team_members itself is
-- writable by system admins only).
create or replace function public.update_my_profile(
  p_preferred_name text, p_avatar_url text, p_phone text, p_complete boolean
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.team_members
     set preferred_name = nullif(trim(p_preferred_name), ''),
         avatar_url = coalesce(nullif(trim(p_avatar_url), ''), avatar_url),
         phone = nullif(trim(p_phone), ''),
         profile_completed_at = case when p_complete then coalesce(profile_completed_at, now()) else profile_completed_at end
   where id = auth.uid();
end; $$;
revoke all on function public.update_my_profile(text, text, text, boolean) from public;
grant execute on function public.update_my_profile(text, text, text, boolean) to authenticated;
