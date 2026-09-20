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
