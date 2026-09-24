-- So an admin can actually tell whether someone they added has shown up — not just that their
-- profile row exists (which happens the instant they're added, before they've done anything).
alter table public.team_members add column if not exists last_seen_at timestamptz;

-- The welcome/reset email's send result used to only ever appear once, in a toast, at the moment
-- an admin added someone or reset their access — nowhere to check back on later.
alter table public.team_members add column if not exists welcome_email_sent_at timestamptz;
