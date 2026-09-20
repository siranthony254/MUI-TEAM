-- MUI Team App, migration 10: direct messages, chat references and attachments,
-- file versions and sharing, Conversations episodes with a task template.
-- Safe to re-run. Requires migrations 1-9.

-- ---------------------------------------------------------------------------
-- Direct messages
-- ---------------------------------------------------------------------------
alter table public.channels drop constraint if exists channels_kind_check;
alter table public.channels
  add constraint channels_kind_check check (kind in ('general', 'executive', 'department', 'project', 'group', 'direct'));

-- Finds the private conversation between the caller and one colleague, or starts it.
create or replace function public.get_or_create_dm(other uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); cid uuid;
begin
  if me is null or other is null or other = me then raise exception 'Choose someone else to message.'; end if;
  if not public.is_team_member() then raise exception 'Direct messages are for team members.'; end if;
  if not exists (select 1 from public.team_members where id = other and active) then raise exception 'That person is not available.'; end if;

  select c.id into cid
    from public.channels c
    join public.channel_members a on a.channel_id = c.id and a.member_id = me
    join public.channel_members b on b.channel_id = c.id and b.member_id = other
   where c.kind = 'direct'
   limit 1;
  if cid is not null then return cid; end if;

  insert into public.channels (name, kind, created_by) values ('Direct message', 'direct', me) returning id into cid;
  insert into public.channel_members (channel_id, member_id) values (cid, me), (cid, other);
  return cid;
end; $$;
grant execute on function public.get_or_create_dm(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Chat: #task / #project references and file attachments on messages
-- ---------------------------------------------------------------------------
alter table public.messages add column if not exists refs jsonb not null default '[]'::jsonb;

alter table public.attachments drop constraint if exists attachments_entity_type_check;
alter table public.attachments
  add constraint attachments_entity_type_check check (entity_type in ('task', 'report', 'decision', 'message'));

drop policy if exists attachments_read on public.attachments;
create policy attachments_read on public.attachments for select to authenticated
  using (
    (entity_type = 'task'     and exists (select 1 from public.tasks t   where t.id = entity_id))
    or (entity_type = 'report'   and exists (select 1 from public.reports r where r.id = entity_id))
    or (entity_type = 'decision' and public.is_team_member())
    or (entity_type = 'message'  and exists (select 1 from public.messages m where m.id = entity_id))
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
      or (entity_type = 'message' and exists (
         select 1 from public.messages m where m.id = entity_id and m.author_id = auth.uid()))
    )
  );

-- Notify people mentioned in a message and, in a direct conversation, the person on the other side.
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
      values (
        target, 'mention',
        author_name || ' mentioned you in #' || chan.name,
        left(new.body, 140),
        '/chat/' || new.channel_id,
        'mention:' || new.id || ':' || target
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end loop;
  return new;
end; $$;

-- Direct and group conversations: a member may start a DM only through get_or_create_dm above.

-- ---------------------------------------------------------------------------
-- File versions
-- ---------------------------------------------------------------------------
alter table public.resources add column if not exists version int not null default 1;

create table if not exists public.resource_versions (
  id           uuid primary key default gen_random_uuid(),
  resource_id  uuid not null references public.resources (id) on delete cascade,
  version      int not null,
  kind         text not null check (kind in ('file', 'link')),
  url          text,
  storage_path text,
  file_name    text,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references public.team_members (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (resource_id, version)
);
alter table public.resource_versions enable row level security;
drop policy if exists resource_versions_read on public.resource_versions;
create policy resource_versions_read on public.resource_versions for select to authenticated
  using (exists (select 1 from public.resources r where r.id = resource_id));
-- (written by the server after checking the caller may replace the file)

-- ---------------------------------------------------------------------------
-- Conversations episodes
-- ---------------------------------------------------------------------------
create sequence if not exists public.episode_number_seq;

create table if not exists public.episodes (
  id            uuid primary key default gen_random_uuid(),
  number        int not null unique default nextval('public.episode_number_seq'),
  title         text not null,
  question      text,
  guest_name    text,
  guest_notes   text,
  project_id    uuid references public.projects (id) on delete set null,
  status        text not null default 'planning' check (status in ('planning', 'recording', 'post_production', 'published', 'archived')),
  recording_at  timestamptz,
  publish_on    date,
  created_by    uuid references public.team_members (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.episodes enable row level security;
drop policy if exists episodes_read on public.episodes;
create policy episodes_read on public.episodes for select to authenticated using (public.is_team_member());
drop policy if exists episodes_write on public.episodes;
create policy episodes_write on public.episodes for all to authenticated
  using (public.is_exec_or_above()) with check (public.is_exec_or_above());

drop trigger if exists episodes_touch on public.episodes;
create trigger episodes_touch before update on public.episodes
  for each row execute function public.touch_updated_at();

create table if not exists public.episode_template_items (
  id          uuid primary key default gen_random_uuid(),
  position    int not null default 0,
  title       text not null,
  offset_days int not null default 0,           -- relative to the recording date
  stage       text not null default 'research' check (stage in ('research', 'guest', 'questions', 'recording', 'editing', 'publishing', 'archive')),
  active      boolean not null default true
);
alter table public.episode_template_items enable row level security;
drop policy if exists episode_template_read on public.episode_template_items;
create policy episode_template_read on public.episode_template_items for select to authenticated using (public.is_team_member());
drop policy if exists episode_template_write on public.episode_template_items;
create policy episode_template_write on public.episode_template_items for all to authenticated
  using (public.is_exec_or_above()) with check (public.is_exec_or_above());

alter table public.tasks
  add column if not exists episode_id uuid references public.episodes (id) on delete set null,
  add column if not exists episode_stage text;
create index if not exists tasks_episode_idx on public.tasks (episode_id);

insert into public.episode_template_items (position, title, offset_days, stage)
select * from (values
  (1,  'Define the topic',        -14, 'research'),
  (2,  'Research',                -12, 'research'),
  (3,  'Prepare the brief',       -10, 'research'),
  (4,  'Identify guests',         -12, 'guest'),
  (5,  'Invite the guest',        -10, 'guest'),
  (6,  'Confirm the guest',        -7, 'guest'),
  (7,  'Prepare the questions',    -5, 'questions'),
  (8,  'Record',                    0, 'recording'),
  (9,  'Back up the files',         1, 'recording'),
  (10, 'Edit',                      3, 'editing'),
  (11, 'Review the edit',           5, 'editing'),
  (12, 'Create clips',              7, 'publishing'),
  (13, 'Write the article',         7, 'publishing'),
  (14, 'Publish',                   9, 'publishing'),
  (15, 'Archive',                  10, 'archive')
) as v(position, title, offset_days, stage)
where not exists (select 1 from public.episode_template_items);

-- Episodes appear on the calendar through the app; nothing else to add here.
