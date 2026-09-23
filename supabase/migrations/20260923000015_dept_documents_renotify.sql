-- Departments can now hold their own documents (planners, guides, anything a director wants on
-- hand) alongside the shared Resources library, scoped by department instead of only by project.
-- Access already works correctly without any RLS change: a department director gets add_resource
-- by default (see DEFAULT_MATRIX for 'department_director') and writes through the service-role
-- client (dbFor()), so this is purely a categorisation column.
alter table public.resources add column if not exists department_id uuid references public.departments (id) on delete set null;
create index if not exists resources_department_idx on public.resources (department_id, created_at desc);

-- Unread notifications keep pushing again for a while instead of firing once and going silent —
-- up to 3 reminders (1h, then 6h, then 24h after the last push), only for things worth chasing:
-- not chat (too chatty to nag about) and not one-off broadcasts (announcements, campaigns).
alter table public.notifications add column if not exists renotify_count int not null default 0;

create or replace function public.renotify_unread()
returns int
language plpgsql security definer set search_path = public
as $$
declare n int;
begin
  update public.notifications
     set push_sent_at = null,
         renotify_count = renotify_count + 1
   where read_at is null
     and push_sent_at is not null
     and renotify_count < 3
     and kind not in ('chat', 'campaign', 'announcement', 'announcement_urgent')
     and push_sent_at < now() - (case renotify_count
                                    when 0 then interval '1 hour'
                                    when 1 then interval '6 hours'
                                    else interval '24 hours'
                                  end);
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function public.renotify_unread() from public, anon, authenticated;
grant execute on function public.renotify_unread() to service_role;
