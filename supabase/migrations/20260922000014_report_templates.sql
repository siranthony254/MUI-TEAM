-- Report templates: instead of five generic boxes for everyone, each department can define what
-- its own reports should actually cover. One organisation-wide default (department_id null)
-- covers personal reports and any department that hasn't customised its own yet.

create table if not exists public.report_templates (
  id           uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments (id) on delete cascade,
  name         text not null,
  -- [{ "key": "activities", "label": "What you worked on", "hint": "..." }, ...] — order is the form order.
  sections     jsonb not null default '[]'::jsonb,
  updated_by   uuid references public.team_members (id) on delete set null,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
-- At most one organisation-wide default (department_id is null); departments may each have one too.
create unique index if not exists report_templates_one_default on public.report_templates ((department_id is null)) where department_id is null;
create unique index if not exists report_templates_one_per_dept on public.report_templates (department_id) where department_id is not null;

alter table public.report_templates enable row level security;

drop policy if exists report_templates_read on public.report_templates;
create policy report_templates_read on public.report_templates for select to authenticated
  using (public.is_team_member());

drop policy if exists report_templates_write on public.report_templates;
create policy report_templates_write on public.report_templates for all to authenticated
  using (
    public.is_super_admin() or public.is_director()
    or (department_id is not null and public.directs_department(department_id))
  )
  with check (
    public.is_super_admin() or public.is_director()
    or (department_id is not null and public.directs_department(department_id))
  );

-- Reports move to a flexible, per-report snapshot of the template used at the time it was
-- started, so a later edit to a template never retroactively changes an already-open or
-- already-submitted report. The five original columns stay for reports written before this.
alter table public.reports add column if not exists sections jsonb;

insert into public.report_templates (name, sections)
values (
  'Standard report',
  '[
    {"key":"highlights","label":"Highlights","hint":"The 2–3 things worth knowing about this period, in plain language."},
    {"key":"activities","label":"What you worked on","hint":"The work itself, not just the outcomes."},
    {"key":"completed","label":"Completed / delivered","hint":"What actually shipped or finished."},
    {"key":"metrics","label":"Numbers that matter","hint":"Only real ones: reach, output, hours, budget, attendance..."},
    {"key":"challenges","label":"Challenges & blockers","hint":"What got in the way, and what would unblock it."},
    {"key":"next","label":"Plan for next period","hint":"What you intend to do next."},
    {"key":"recommendations","label":"Recommendations","hint":"What should change, or what needs a decision from leadership."}
  ]'::jsonb
)
on conflict do nothing;
