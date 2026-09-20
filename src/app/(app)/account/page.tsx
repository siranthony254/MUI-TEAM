import { requireMember } from '@/lib/auth'
import { Card, PageTitle } from '@/components/ui'
import { PasswordForm } from './PasswordForm'

export default async function Account() {
  const me = await requireMember()
  return (
    <>
      <PageTitle sub={me.email}>Account</PageTitle>
      <Card>
        <h2 className="mb-3 font-semibold">Change password</h2>
        <PasswordForm />
      </Card>
    </>
  )
}
