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
