import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { GROUPS, parseMandatory, type PrefRow } from '@/lib/notify/groups'
import { Card, PageTitle } from '@/components/ui'
import { PasswordForm } from './PasswordForm'
import { PrefsForm } from './PrefsForm'
import { PushToggle } from './PushToggle'
import { InstallCard } from '@/components/pwa/InstallApp'
import { NotificationMatrix } from './NotificationMatrix'
import { ProfileForm } from '@/components/profile/ProfileForm'

export const dynamic = 'force-dynamic'

export default async function Account() {
  const me = await requireMember()
  const supabase = await createClient()
  const { data: priv } = await supabase.from('member_private').select('emergency_contact').eq('member_id', me.id).maybeSingle()
  const [{ data: prefRows }, { data: mandatoryRow }] = await Promise.all([
    supabase.from('notification_prefs').select('event_group, in_app, email, push, sms').eq('member_id', me.id),
    supabase.from('org_settings').select('value').eq('key', 'mandatory_groups').maybeSingle(),
  ])
  return (
    <>
      <PageTitle sub={me.email}>Account</PageTitle>

      <Card>
        <h2 className="mb-3 font-semibold">Your profile</h2>
        <ProfileForm
          values={{
            fullName: me.full_name, preferredName: me.preferred_name ?? '', avatarUrl: me.avatar_url, phone: me.phone ?? '',
            notifyEmail: me.notify_email, notifyPush: me.notify_push, notifySms: me.notify_sms, emergencyContact: priv?.emergency_contact ?? '',
          }}
        />
      </Card>

      <Card className="mt-4">
        <h2 className="mb-2 font-semibold">Install the app</h2>
        <InstallCard />
      </Card>

      <Card className="mt-4">
        <h2 className="mb-1 font-semibold">Notifications</h2>
        <p className="mb-4 text-sm text-neutral-600">
          You&apos;ll be reminded 3 days before, 1 day before, on the morning a task is due, and when it&apos;s overdue.
        </p>
        <PrefsForm email={me.notify_email} push={me.notify_push} sms={me.notify_sms} phone={me.phone ?? ''} />
        <div className="mt-5 border-t border-neutral-100 pt-4">
          <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''} />
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-1 font-semibold">What reaches you</h2>
        <p className="mb-4 text-sm text-neutral-600">Choose, for each kind of event, how you want to hear about it. A channel also needs to be switched on above.</p>
        <NotificationMatrix
          groups={GROUPS}
          prefs={(prefRows ?? []) as PrefRow[]}
          mandatory={parseMandatory(mandatoryRow?.value)}
          masters={{ email: me.notify_email, push: me.notify_push, sms: me.notify_sms }}
        />
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 font-semibold">Change password</h2>
        <PasswordForm />
      </Card>
    </>
  )
}
