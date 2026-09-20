# MUI Team App

Installable PWA for the Mic'd Up Initiative team: roles, responsibilities, tasks, delegation, review and notifications.
Separate from the public website (`micdupinitiative.site`); shares its Supabase project (auth users) but not its data.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in.
3. Supabase dashboard -> SQL Editor: run `supabase/migrations/*.sql` in order.
4. Create the first user in Supabase (Authentication -> Users), then re-run the last block of
   `20260920000001_team_core.sql` (the "Bootstrap" insert) so they become `super_admin`.
5. `npm run dev` (http://localhost:3001 with `-p 3001`).

## Access model

| Level | Sees | Can |
|---|---|---|
| Super Admin | Everything | Manage people, roles, departments; review anything |
| Executive | Own work + everyone in their reporting line | Assign, delegate, review, create projects |
| Team Member | Own tasks and tasks they created | Work, submit, create tasks for themselves |

Enforced by Postgres Row Level Security and a status-transition trigger, not just the UI.
Being in `team_members` is what grants access; people who only signed up on the public website see nothing.

## Reminders and notifications

Every task waiting on its assignee gets reminders at: 3 days before, 1 day before, 07:00 (Nairobi) on the due date,
when it passes the deadline, and 24 hours after (which also alerts whoever assigned it).
`generate_task_reminders()` (SQL) creates each reminder once; `/api/cron/dispatch` then delivers pending
notifications over email (Resend), push (Web Push) and SMS (Africa's Talking) according to each person's preferences.
New assignments/reviews are delivered immediately after the action; the scheduler is the safety net and the source of reminders.

Run migration `20260920000002_reminders_delivery.sql`, then schedule `/api/cron/dispatch` every 5 minutes
(pg_cron snippet at the bottom of that migration, or any cron that can send the `Authorization: Bearer $CRON_SECRET` header).
SMS is only sent for due-today / overdue reminders to control cost.

## Chat, calendar, resources

- **Chat**: `#General` and `#Executive` exist by default; every department and project gets a channel automatically;
  executives can start private group chats. `@Name`, `@Executive` and `@<Department>` notify people (only if they can
  see the channel). Live updates use Supabase Realtime, with a 20s refresh as a fallback.
- **Calendar**: shows your open tasks, meetings you're in, project due dates and events executives add
  (recordings, publications, deadlines). All times are Nairobi time.
- **Resources**: files (up to 25 MB, uploaded straight to a private Supabase Storage bucket) and links, grouped by
  category. Downloads go through `/resources/[id]/download`, which checks access and issues a 60-second signed URL.

Run migration `20260920000004_chat_calendar_resources.sql`. It also creates the private `resources` storage bucket.

## Completed areas (migration 5)

- **Delegation** reassigns the task and keeps the chain (original assignee → delegated by → current assignee) on the record;
  the delegator sees it under My Work → Delegated. The assigner can also reassign. Only unsubmitted work can be handed on.
- **Tasks** carry department, start date, tags, weight, recurrence and a "require approval" switch, plus attachments.
  A recurring task creates its next occurrence when the current one is completed (done by the scheduler).
- **Projects** have a detail page (overview, tasks, team, calendar, files, discussion, activity). Progress is weighted.
- **Activity log** is structured (field, before, after) and covers tasks, projects, meetings, decisions, reports, files, and admin actions.
- **Admin**: dashboard with system health, reset access, deactivate with automatic hand-over of open work, reactivate.
- **Scheduler run log**: each `/api/cron/dispatch` run is recorded so the admin dashboard can tell you if reminders stopped.
