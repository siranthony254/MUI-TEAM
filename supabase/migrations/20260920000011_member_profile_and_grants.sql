-- MUI Team App, migration 11: richer role profiles and per-person access grants.
-- Safe to re-run. Requires migrations 1-10.

-- ---------------------------------------------------------------------------
-- Role profile: how success is measured, and when the person started
-- ---------------------------------------------------------------------------
alter table public.team_members
  add column if not exists success_measures text[] not null default '{}',
  add column if not exists start_date date;

-- ---------------------------------------------------------------------------
-- Per-person access grants.
--   capability = one of the permission-matrix capabilities (create_project, assign_tasks, ...):
--                allowed=true GRANTS it to this person, allowed=false DENIES it, whatever their level says
--   capability = 'admin.people' | 'admin.onboarding' | 'admin.departments' | 'admin.settings' | 'admin.permissions':
--                a slice of system administration, delegated without making the person a full system admin
-- Rows can expire on their own (expires_at); the application ignores expired rows.
-- Written by the server (service role) after checking who is allowed to delegate.
-- ---------------------------------------------------------------------------
create table if not exists public.member_grants (
  member_id  uuid not null references public.team_members (id) on delete cascade,
  capability text not null,
  allowed    boolean not null default true,
  granted_by uuid references public.team_members (id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (member_id, capability)
);
create index if not exists member_grants_expiry_idx on public.member_grants (expires_at) where expires_at is not null;

alter table public.member_grants enable row level security;
drop policy if exists member_grants_own on public.member_grants;
create policy member_grants_own on public.member_grants for select to authenticated
  using (member_id = auth.uid() or public.has_org_view());
