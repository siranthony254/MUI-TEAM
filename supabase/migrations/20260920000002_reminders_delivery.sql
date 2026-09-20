-- MUI Team App: due-date reminders + multi-channel delivery bookkeeping.
-- Safe to re-run. Requires 20260920000001_team_core.sql.

-- ---------------------------------------------------------------------------
-- Per-person notification preferences (email + push on by default; SMS opt-in
-- because it costs money and needs a phone number).
-- ---------------------------------------------------------------------------
alter table public.team_members
  add column if not exists notify_email boolean not null default true,
  add column if not exists notify_push  boolean not null default true,
  add column if not exists notify_sms   boolean not null default false;

-- team_members is writable only by super admins, so members change their own
-- preferences through this narrow function instead of a broad UPDATE policy.
create or replace function public.update_my_notification_prefs(
  p_email boolean, p_push boolean, p_sms boolean, p_phone text
) returns void
language sql security definer set search_path = public
as $$
  update public.team_members
     set notify_email = p_email,
         notify_push  = p_push,
         notify_sms   = p_sms,
         phone        = nullif(trim(p_phone), '')
   where id = auth.uid();
$$;
revoke all on function public.update_my_notification_prefs(boolean, boolean, boolean, text) from public;
grant execute on function public.update_my_notification_prefs(boolean, boolean, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Delivery state on notifications. A *_sent_at value means "handled" for that
-- channel (sent, or deliberately skipped by preference / missing config).
-- dedupe_key makes reminder generation idempotent.
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column if not exists email_sent_at timestamptz,
  add column if not exists push_sent_at  timestamptz,
  add column if not exists sms_sent_at   timestamptz,
  add column if not exists delivery_attempts int not null default 0,
  add column if not exists dedupe_key text;

create unique index if not exists notifications_dedupe_idx
  on public.notifications (dedupe_key) where dedupe_key is not null;

-- Rows still waiting on at least one channel (used by the dispatcher).
create index if not exists notifications_pending_idx
  on public.notifications (created_at)
  where email_sent_at is null or push_sent_at is null or sms_sent_at is null;

-- Notifications that pre-date this migration must not be blasted out.
update public.notifications
   set email_sent_at = coalesce(email_sent_at, now()),
       push_sent_at  = coalesce(push_sent_at,  now()),
       sms_sent_at   = coalesce(sms_sent_at,   now())
 where email_sent_at is null or push_sent_at is null or sms_sent_at is null;

-- ---------------------------------------------------------------------------
-- Reminder generation.
--
-- For every task that is waiting on its assignee (not started / in progress /
-- needs revision) and has a due date, work out the CURRENT stage and write one
-- notification for it. The unique dedupe_key means running this every few
-- minutes only ever creates each stage once per task per due date.
--
--   due_3d     from 3 days before
--   due_1d     from 1 day before
--   due_today  from 07:00 Nairobi time on the due date (only if still ahead)
--   overdue    once the deadline passes
--   overdue_1d 24h after the deadline -> also escalates to whoever assigned it
--
-- If a task is created late (e.g. due tomorrow) earlier stages are skipped, not
-- back-filled. Changing the due date changes the key, so reminders restart.
-- ---------------------------------------------------------------------------
create or replace function public.generate_task_reminders()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  stage text;
  local_now timestamp := (now() at time zone 'Africa/Nairobi');
  local_due timestamp;
  inserted int := 0;
  n int;
begin
  for r in
    select t.id, t.title, t.due_at, t.assignee_id, t.assigned_by, t.priority
      from public.tasks t
     where t.due_at is not null
       and t.assignee_id is not null
       and t.status in ('not_started', 'in_progress', 'needs_revision')
  loop
    local_due := (r.due_at at time zone 'Africa/Nairobi');

    stage := case
      when now() >= r.due_at + interval '24 hours' then 'overdue_1d'
      when now() >= r.due_at                       then 'overdue'
      when local_due::date = local_now::date and local_now::time >= time '07:00' then 'due_today'
      when now() >= r.due_at - interval '1 day'    then 'due_1d'
      when now() >= r.due_at - interval '3 days'   then 'due_3d'
      else null
    end;

    continue when stage is null;

    -- To the assignee.
    insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
    values (
      r.assignee_id,
      stage,
      case stage
        when 'due_3d'     then 'Due in 3 days'
        when 'due_1d'     then 'Due tomorrow'
        when 'due_today'  then 'Due today'
        when 'overdue'    then 'Overdue'
        else                   'Overdue by a day'
      end,
      '"' || r.title || '" — ' || case stage
        when 'due_3d'     then 'due in 3 days.'
        when 'due_1d'     then 'due within 24 hours.'
        when 'due_today'  then 'due today.'
        when 'overdue'    then 'the deadline has passed.'
        else                   'still not submitted after 24 hours.'
      end,
      '/tasks/' || r.id,
      'reminder:' || r.id || ':' || stage || ':' || extract(epoch from r.due_at)::bigint
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics n = row_count;
    inserted := inserted + n;

    -- Escalate a day-late task to whoever assigned it.
    if stage = 'overdue_1d' and r.assigned_by is not null and r.assigned_by <> r.assignee_id then
      insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
      values (
        r.assigned_by,
        'overdue_escalation',
        'A task you assigned is overdue',
        (select full_name from public.team_members where id = r.assignee_id)
          || '''s task "' || r.title || '" is more than a day overdue.',
        '/tasks/' || r.id,
        'reminder:' || r.id || ':escalation:' || extract(epoch from r.due_at)::bigint
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics n = row_count;
      inserted := inserted + n;
    end if;
  end loop;

  return inserted;
end;
$$;

-- Only the service role (the cron route) may run it; never a browser session.
revoke all on function public.generate_task_reminders() from public, anon, authenticated;
grant execute on function public.generate_task_reminders() to service_role;

-- ---------------------------------------------------------------------------
-- OPTIONAL: run the scheduler from Supabase itself (works with any host).
-- Enable Database -> Extensions -> pg_cron and pg_net first, then replace
-- YOUR_APP_URL and YOUR_CRON_SECRET and run this block once.
--
-- select cron.schedule(
--   'mui-team-dispatch',
--   '*/5 * * * *',
--   $job$
--   select net.http_post(
--     url     := 'https://YOUR_APP_URL/api/cron/dispatch',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
--   );
--   $job$
-- );
-- ---------------------------------------------------------------------------
