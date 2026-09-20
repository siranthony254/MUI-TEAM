-- Fixes found by end-to-end testing against a real database. Safe to re-run.

-- 1. Meetings: the creator must be able to read the row they just inserted.
--    `can_see_meeting()` looks the meeting up by id in a separate query, which cannot
--    see a row that is still being inserted in the same statement (INSERT ... RETURNING),
--    so scheduling a meeting failed with an RLS violation. Check the creator directly.
drop policy if exists meetings_read on public.meetings;
create policy meetings_read on public.meetings for select to authenticated
  using (created_by = auth.uid() or public.can_see_meeting(id));

-- 2. Only executives (and super admins) may change WHO a task belongs to.
--    Previously a member could create a task for themselves and then reassign it to a
--    colleague, bypassing "members only assign work to themselves".
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

  -- Only the person who set the work may change its terms.
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

  -- Handing a task to someone else: executives only. The assigner may reassign; an
  -- executive who currently holds the task may DELEGATE it (recorded as such).
  if new.assignee_id is distinct from old.assignee_id then
    if not public.is_exec_or_above() then
      raise exception 'Only executives can assign work to someone else.';
    end if;
    if not is_reviewer and not (
         is_assignee
         and new.delegated_by = uid
         and new.original_assignee_id is not distinct from coalesce(old.original_assignee_id, old.assignee_id)
       ) then
      raise exception 'Only the assigner, or an executive delegating their own task, can change the assignee.';
    end if;
  end if;

  if new.status is distinct from old.status then
    if is_assignee then
      ok := ok
        or (old.status in ('not_started', 'needs_revision') and new.status = 'in_progress')
        or (old.status = 'in_progress' and new.status = 'submitted')
        or (old.status = 'in_progress' and new.status = 'completed' and (is_reviewer or not old.require_approval));
    end if;
    if is_reviewer then
      ok := ok
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
