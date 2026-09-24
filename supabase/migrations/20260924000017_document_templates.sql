-- Which fillable document templates (defined in code — see src/lib/documents/templates.ts) a
-- department has chosen to feature on its own page. The templates themselves aren't stored here;
-- this is purely "department X shows templates [a, b]".
create table if not exists public.department_document_templates (
  department_id uuid not null references public.departments (id) on delete cascade,
  template_slug text not null,
  added_by      uuid references public.team_members (id) on delete set null,
  added_at      timestamptz not null default now(),
  primary key (department_id, template_slug)
);
alter table public.department_document_templates enable row level security;

drop policy if exists dept_doc_templates_read on public.department_document_templates;
create policy dept_doc_templates_read on public.department_document_templates for select to authenticated
  using (public.is_team_member());

drop policy if exists dept_doc_templates_write on public.department_document_templates;
create policy dept_doc_templates_write on public.department_document_templates for all to authenticated
  using (
    public.is_super_admin() or public.is_director()
    or public.directs_department(department_id)
  )
  with check (
    public.is_super_admin() or public.is_director()
    or public.directs_department(department_id)
  );
