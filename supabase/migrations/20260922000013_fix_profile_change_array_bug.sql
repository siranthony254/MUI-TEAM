-- Fix: on_member_profile_change() raised "malformed array literal" on every profile edit that touched
-- title, role, department, manager, mandate, authority, responsibilities, deliverables, success measures
-- or the Executive Director flag, because `text[] || 'literal'` is ambiguous in Postgres and it picked
-- the array||array overload instead of array||element, then failed to parse the plain string as an array.
-- Since the trigger runs inside the same transaction as the update, this made the update itself fail
-- (admin edits to a member's role/title/department silently rolled back with an error).
-- Casting each literal to text resolves the operator to array||element, as intended.
create or replace function public.on_member_profile_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare changed text[] := '{}';
begin
  if new.title is distinct from old.title then changed := changed || 'title'::text; end if;
  if new.role is distinct from old.role then changed := changed || 'access level'::text; end if;
  if new.department_id is distinct from old.department_id then changed := changed || 'department'::text; end if;
  if new.reports_to is distinct from old.reports_to then changed := changed || 'who you report to'::text; end if;
  if new.mandate is distinct from old.mandate then changed := changed || 'mandate'::text; end if;
  if new.authority is distinct from old.authority then changed := changed || 'authority'::text; end if;
  if new.responsibilities is distinct from old.responsibilities then changed := changed || 'responsibilities'::text; end if;
  if new.deliverables is distinct from old.deliverables then changed := changed || 'deliverables'::text; end if;
  if new.success_measures is distinct from old.success_measures then changed := changed || 'success measures'::text; end if;
  if new.is_director is distinct from old.is_director then changed := changed || 'Executive Director role'::text; end if;

  if array_length(changed, 1) > 0 and new.active then
    insert into public.notifications (recipient_id, kind, title, body, link)
    values (new.id, 'team_update', 'Your role was updated',
            'Changed: ' || array_to_string(changed, ', ') || '.', '/responsibilities');
  end if;
  return new;
end; $$;
