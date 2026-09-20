import { requireMember } from '@/lib/auth'
import { Card, PageTitle } from '@/components/ui'
import { PasswordForm } from './PasswordForm'
import { PrefsForm } from './PrefsForm'
import { PushToggle } from './PushToggle'
import { InstallCard } from '@/components/pwa/InstallApp'

export const dynamic = 'force-dynamic'

export default async function Account() {
  const me = await requireMember()
  return (
    <>
      <PageTitle sub={me.email}>Account</PageTitle>

      <Card>
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
        <h2 className="mb-3 font-semibold">Change password</h2>
        <PasswordForm />
      </Card>
    </>
  )
}
