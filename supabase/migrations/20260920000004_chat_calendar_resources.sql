-- MUI Team App: team chat with mentions, calendar events, resource library.
-- Safe to re-run. Requires migrations 1-3.

-- ---------------------------------------------------------------------------
-- Channels & messages
-- ---------------------------------------------------------------------------
create table if not exists public.channels (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          text not null check (kind in ('general', 'executive', 'department', 'project', 'group')),
  department_id uuid references public.departments (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete cascade,
  created_by    uuid references public.team_members (id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index if not exists channels_general_idx    on public.channels (kind) where kind in ('general', 'executive');
create unique index if not exists channels_department_idx on public.channels (department_id) where kind = 'department';
create unique index if not exists channels_project_idx    on public.channels (project_id) where kind = 'project';

create table if not exists public.channel_members (   -- only used by 'group' channels
  channel_id uuid not null references public.channels (id) on delete cascade,
  member_id  uuid not null references public.team_members (id) on delete cascade,
  primary key (channel_id, member_id)
);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id  uuid not null references public.team_members (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 4000),
  mentions   uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists messages_channel_idx on public.messages (channel_id, created_at desc);

create table if not exists public.channel_reads (
  channel_id   uuid not null references public.channels (id) on delete cascade,
  member_id    uuid not null references public.team_members (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, member_id)
);

-- Who may see a channel. SECURITY DEFINER so policies on several tables can
-- share it without recursing into each other's RLS.
--   super admin: everything
--   general: every active member          executive: executives
--   department: members of that department
--   project: project owner/members, and anyone with a task in the project
--   group: explicit members
create or replace function public.channel_accessible_by(cid uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.channels c
      join public.team_members tm on tm.id = uid and tm.active
     where c.id = cid
       and (
         tm.role = 'super_admin'
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

create or replace function public.can_access_channel(cid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.channel_accessible_by(cid, auth.uid()) $$;

alter table public.channels        enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages        enable row level security;
alter table public.channel_reads   enable row level security;

drop policy if exists channels_read on public.channels;
create policy channels_read on public.channels for select to authenticated
  using (public.can_access_channel(id));
drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels for insert to authenticated
  with check (public.is_exec_or_above() and kind = 'group' and created_by = auth.uid());
drop policy if exists channels_delete on public.channels;
create policy channels_delete on public.channels for delete to authenticated
  using (kind = 'group' and (public.is_super_admin() or created_by = auth.uid()));

drop policy if exists channel_members_read on public.channel_members;
create policy channel_members_read on public.channel_members for select to authenticated
  using (public.can_access_channel(channel_id));
drop policy if exists channel_members_write on public.channel_members;
create policy channel_members_write on public.channel_members for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.channels c where c.id = channel_id and c.created_by = auth.uid()))
  with check (public.is_super_admin() or exists (
    select 1 from public.channels c where c.id = channel_id and c.created_by = auth.uid()));

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated
  using (public.can_access_channel(channel_id));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_channel(channel_id));
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated
  using (author_id = auth.uid() or public.is_super_admin())
  with check (author_id = auth.uid() or public.is_super_admin());

drop policy if exists channel_reads_own on public.channel_reads;
create policy channel_reads_own on public.channel_reads for all to authenticated
  using (member_id = auth.uid()) with check (member_id = auth.uid());

-- Messages are immutable except for soft-deleting them.
create or replace function public.guard_message_update()
returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body
     or new.author_id is distinct from old.author_id
     or new.channel_id is distinct from old.channel_id
     or new.mentions is distinct from old.mentions
     or new.created_at is distinct from old.created_at then
    raise exception 'Messages cannot be edited, only deleted.';
  end if;
  return new;
end; $$;
drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before update on public.messages
  for each row execute function public.guard_message_update();

-- Notify people who were @mentioned, but only if they can actually see the channel
-- (a mention must never leak a private channel's name or text).
create or replace function public.on_message_created()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  target uuid;
  author_name text;
  chan_name text;
begin
  select full_name into author_name from public.team_members where id = new.author_id;
  select name into chan_name from public.channels where id = new.channel_id;

  foreach target in array new.mentions loop
    if target <> new.author_id and public.channel_accessible_by(new.channel_id, target) then
      insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
      values (
        target, 'mention',
        author_name || ' mentioned you in #' || chan_name,
        left(new.body, 140),
        '/chat/' || new.channel_id,
        'mention:' || new.id || ':' || target
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end loop;
  return new;
end; $$;
drop trigger if exists message_created on public.messages;
create trigger message_created after insert on public.messages
  for each row execute function public.on_message_created();

-- Unread counts per channel for the signed-in user (RLS applies: invoker).
create or replace function public.chat_unread_counts()
returns table (channel_id uuid, unread bigint)
language sql stable security invoker set search_path = public
as $$
  select m.channel_id, count(*)
    from public.messages m
    join public.team_members me on me.id = auth.uid()
    left join public.channel_reads r on r.channel_id = m.channel_id and r.member_id = auth.uid()
   where m.deleted_at is null
     and m.author_id <> auth.uid()
     and m.created_at > coalesce(r.last_read_at, me.created_at)
   group by m.channel_id
$$;
grant execute on function public.chat_unread_counts() to authenticated;

-- Default channels + automatic department / project channels.
insert into public.channels (name, kind)
select 'General', 'general' where not exists (select 1 from public.channels where kind = 'general');
insert into public.channels (name, kind)
select 'Executive', 'executive' where not exists (select 1 from public.channels where kind = 'executive');

insert into public.channels (name, kind, department_id)
select d.name, 'department', d.id from public.departments d
 where not exists (select 1 from public.channels c where c.kind = 'department' and c.department_id = d.id);
insert into public.channels (name, kind, project_id)
select p.name, 'project', p.id from public.projects p
 where not exists (select 1 from public.channels c where c.kind = 'project' and c.project_id = p.id);

create or replace function public.create_department_channel()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.channels (name, kind, department_id) values (new.name, 'department', new.id)
  on conflict do nothing;
  return new;
end; $$;
drop trigger if exists department_channel on public.departments;
create trigger department_channel after insert on public.departments
  for each row execute function public.create_department_channel();

create or replace function public.create_project_channel()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.channels (name, kind, project_id) values (new.name, 'project', new.id)
  on conflict do nothing;
  return new;
end; $$;
drop trigger if exists project_channel on public.projects;
create trigger project_channel after insert on public.projects
  for each row execute function public.create_project_channel();

-- Live updates in the chat UI (RLS is enforced by Realtime as well).
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Projects: people who hold a task in a project must be able to see it
-- (previously only owners/explicit members could).
-- ---------------------------------------------------------------------------
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated
  using (
    public.is_exec_or_above()
    or owner_id = auth.uid()
    or exists (select 1 from public.project_members pm
               where pm.project_id = projects.id and pm.member_id = auth.uid())
    or exists (select 1 from public.tasks t
               where t.project_id = projects.id and t.assignee_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Calendar events (recordings, publication dates, org events, deadlines).
-- Tasks, meetings and project due dates are shown on the calendar automatically.
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  kind        text not null default 'event' check (kind in ('event', 'recording', 'publication', 'deadline', 'other')),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  all_day     boolean not null default false,
  visibility  text not null default 'everyone' check (visibility in ('everyone', 'executive')),
  created_by  uuid references public.team_members (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists calendar_events_starts_idx on public.calendar_events (starts_at);
alter table public.calendar_events enable row level security;

drop policy if exists events_read on public.calendar_events;
create policy events_read on public.calendar_events for select to authenticated
  using (public.is_team_member() and (visibility = 'everyone' or public.is_exec_or_above()));
drop policy if exists events_insert on public.calendar_events;
create policy events_insert on public.calendar_events for insert to authenticated
  with check (public.is_exec_or_above() and created_by = auth.uid());
drop policy if exists events_update on public.calendar_events;
create policy events_update on public.calendar_events for update to authenticated
  using (public.is_super_admin() or created_by = auth.uid())
  with check (public.is_super_admin() or created_by = auth.uid());
drop policy if exists events_delete on public.calendar_events;
create policy events_delete on public.calendar_events for delete to authenticated
  using (public.is_super_admin() or created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Resource library. Files live in a PRIVATE storage bucket with no client
-- policies at all: the app hands out short-lived signed URLs after checking
-- this table's RLS, so a guessed path is worthless.
-- ---------------------------------------------------------------------------
create table if not exists public.resources (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  category     text not null,
  kind         text not null check (kind in ('file', 'link')),
  url          text,                 -- for links
  storage_path text,                 -- for files
  file_name    text,
  mime_type    text,
  size_bytes   bigint,
  visibility   text not null default 'everyone' check (visibility in ('everyone', 'executive')),
  uploaded_by  uuid references public.team_members (id) on delete set null,
  created_at   timestamptz not null default now(),
  check ((kind = 'link' and url is not null) or (kind = 'file' and storage_path is not null))
);
create index if not exists resources_category_idx on public.resources (category, created_at desc);
alter table public.resources enable row level security;

drop policy if exists resources_read on public.resources;
create policy resources_read on public.resources for select to authenticated
  using (public.is_team_member() and (visibility = 'everyone' or public.is_exec_or_above()));
drop policy if exists resources_insert on public.resources;
create policy resources_insert on public.resources for insert to authenticated
  with check (public.is_exec_or_above() and uploaded_by = auth.uid());
drop policy if exists resources_delete on public.resources;
create policy resources_delete on public.resources for delete to authenticated
  using (public.is_super_admin() or uploaded_by = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit)
values ('resources', 'resources', false, 26214400)   -- 25 MB
on conflict (id) do nothing;
