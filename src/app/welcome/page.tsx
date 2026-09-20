import { redirect } from 'next/navigation'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ROLE_LABEL } from '@/lib/types'
import { ProfileForm } from '@/components/profile/ProfileForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Welcome' }

export default async function Welcome() {
  const me = await requireMember()
  if (me.profile_completed_at !== null) redirect('/')

  const supabase = await createClient()
  const [{ data: dept }, { data: boss }, { data: priv }, { data: welcome }] = await Promise.all([
    me.department_id ? supabase.from('departments').select('name').eq('id', me.department_id).maybeSingle() : Promise.resolve({ data: null }),
    me.reports_to ? supabase.from('team_members').select('full_name, title').eq('id', me.reports_to).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('member_private').select('emergency_contact').eq('member_id', me.id).maybeSingle(),
    supabase.from('org_settings').select('value').eq('key', 'welcome_message').maybeSingle(),
  ])

  return (
    <main className="min-h-screen bg-[#0D1F35] px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Mic&apos;d Up Initiative</p>
          <h1 className="mt-1 text-2xl font-bold text-[#0D1F35]">Welcome, {me.full_name.split(' ')[0]}.</h1>
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-600">
            {welcome?.value || 'This is where we work: your role, your tasks and deadlines, and what the team is doing.'}
          </p>

          <div className="mt-4 rounded-xl bg-neutral-50 p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Your place on the team</p>
            <p className="mt-1 font-semibold">{me.title ?? ROLE_LABEL[me.role]}</p>
            <p className="text-neutral-600">
              {[ROLE_LABEL[me.role], dept?.name].filter(Boolean).join(' · ')}
              {boss ? ` · reports to ${boss.full_name}` : ''}
            </p>
            {me.mandate && <p className="mt-2 text-neutral-700">{me.mandate}</p>}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <h2 className="mb-4 text-lg font-semibold text-[#0D1F35]">Set up your profile</h2>
          <ProfileForm
            complete
            values={{
              fullName: me.full_name,
              preferredName: me.preferred_name ?? '',
              avatarUrl: me.avatar_url,
              phone: me.phone ?? '',
              notifyEmail: me.notify_email,
              notifyPush: me.notify_push,
              notifySms: me.notify_sms,
              emergencyContact: priv?.emergency_contact ?? '',
            }}
          />
        </div>
      </div>
    </main>
  )
}
