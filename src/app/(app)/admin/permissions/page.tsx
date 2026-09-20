import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { getMatrix } from '@/lib/permissions'
import { PageTitle } from '@/components/ui'
import { PermissionMatrix } from './PermissionMatrix'

export const dynamic = 'force-dynamic'

export default async function PermissionsPage() {
  await requireRole('super_admin')
  const matrix = await getMatrix()
  return (
    <>
      <Link href="/admin" className="text-sm text-neutral-500 hover:underline">← System admin</Link>
      <div className="mt-2" />
      <PageTitle sub="Who may do what. Changes take effect immediately.">Permissions</PageTitle>
      <PermissionMatrix matrix={matrix} />
    </>
  )
}
