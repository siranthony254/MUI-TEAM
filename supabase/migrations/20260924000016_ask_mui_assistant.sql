-- "Ask MUI": an in-app assistant that knows how the team's manual and this app work, can see the
-- same data the person asking already can, and drafts report text for someone to review. It never
-- writes anything on its own. Its knowledge grows from what directors teach it here, not from
-- silently learning from conversations.

create table if not exists public.assistant_knowledge (
  id           uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments (id) on delete cascade,  -- null = applies to everyone
  topic        text not null,
  answer       text not null,
  created_by   uuid references public.team_members (id) on delete set null,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists assistant_knowledge_dept_idx on public.assistant_knowledge (department_id);
alter table public.assistant_knowledge enable row level security;

drop policy if exists assistant_knowledge_read on public.assistant_knowledge;
create policy assistant_knowledge_read on public.assistant_knowledge for select to authenticated
  using (public.is_team_member());

drop policy if exists assistant_knowledge_write on public.assistant_knowledge;
create policy assistant_knowledge_write on public.assistant_knowledge for all to authenticated
  using (
    public.is_super_admin() or public.is_director()
    or (department_id is not null and public.directs_department(department_id))
  )
  with check (
    public.is_super_admin() or public.is_director()
    or (department_id is not null and public.directs_department(department_id))
  );

-- Things the assistant couldn't answer well; a director resolves them, which is how it "learns."
create table if not exists public.assistant_questions (
  id           uuid primary key default gen_random_uuid(),
  asked_by     uuid references public.team_members (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  question     text not null,
  resolved_at  timestamptz,
  resolved_by  uuid references public.team_members (id) on delete set null,
  answer       text,
  created_at   timestamptz not null default now()
);
create index if not exists assistant_questions_open_idx on public.assistant_questions (resolved_at, created_at desc);
alter table public.assistant_questions enable row level security;

drop policy if exists assistant_questions_read on public.assistant_questions;
create policy assistant_questions_read on public.assistant_questions for select to authenticated
  using (
    asked_by = auth.uid() or public.is_super_admin() or public.is_director()
    or (department_id is not null and public.directs_department(department_id))
  );

drop policy if exists assistant_questions_insert on public.assistant_questions;
create policy assistant_questions_insert on public.assistant_questions for insert to authenticated
  with check (asked_by = auth.uid());

drop policy if exists assistant_questions_resolve on public.assistant_questions;
create policy assistant_questions_resolve on public.assistant_questions for update to authenticated
  using (
    public.is_super_admin() or public.is_director()
    or (department_id is not null and public.directs_department(department_id))
  )
  with check (
    public.is_super_admin() or public.is_director()
    or (department_id is not null and public.directs_department(department_id))
  );

-- Keeps the whole app safely under the model's free daily quota, spread fairly across people.
-- One row per person per day; service role only (the assistant's own server code).
create table if not exists public.assistant_usage (
  member_id  uuid not null references public.team_members (id) on delete cascade,
  day        date not null default current_date,
  count      int not null default 0,
  primary key (member_id, day)
);
alter table public.assistant_usage enable row level security;
drop policy if exists assistant_usage_none on public.assistant_usage;
create policy assistant_usage_none on public.assistant_usage for all to authenticated using (false) with check (false);
