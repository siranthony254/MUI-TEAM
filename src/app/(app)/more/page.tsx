import Link from 'next/link'
import { requireMember } from '@/lib/auth'
import { MOBILE_PRIMARY, visibleItems } from '@/components/nav-items'
import { Card, PageTitle } from '@/components/ui'

export default async function More() {
  const me = await requireMember()
  const items = visibleItems(me.role).filter((i) => !MOBILE_PRIMARY.includes(i.href))
  return (
    <>
      <PageTitle>More</PageTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {[...items, { href: '/account', label: 'Account & notifications', icon: null }].map((i) => (
          <Link key={i.href} href={i.href}>
            <Card className="flex items-center gap-3 transition hover:border-amber-400">
              {i.icon && <i.icon size={20} className="text-amber-600" aria-hidden />}
              <span className="font-medium">{i.label}</span>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
