'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, CheckSquare, FolderKanban, Users, Bell, Settings,
} from 'lucide-react'

const ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'My Work', icon: CheckSquare },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/people', label: 'People', icon: Users },
  { href: '/notifications', label: 'Alerts', icon: Bell },
]

export function Nav({ isAdmin, unread }: { isAdmin: boolean; unread: number }) {
  const path = usePathname()
  const items = isAdmin ? [...ITEMS, { href: '/admin', label: 'Admin', icon: Settings }] : ITEMS
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href))

  return (
    <>
      {/* Desktop sidebar */}
      <nav aria-label="Main" className="hidden w-56 shrink-0 flex-col gap-1 bg-[#0D1F35] p-4 md:flex">
        <p className="mb-4 px-2 text-xs font-semibold uppercase tracking-widest text-amber-400">MUI Team</p>
        {items.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
              active(href) ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}>
            <Icon size={18} aria-hidden />
            <span className="flex-1">{label}</span>
            {href === '/notifications' && unread > 0 && (
              <span className="rounded-full bg-amber-500 px-2 text-xs font-semibold text-[#0D1F35]">{unread}</span>
            )}
          </Link>
        ))}
      </nav>

      {/* Mobile bottom bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-white/10 bg-[#0D1F35] pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.slice(0, 5).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
              active(href) ? 'text-amber-400' : 'text-white/60'
            }`}>
            <Icon size={20} aria-hidden />
            {label}
            {href === '/notifications' && unread > 0 && (
              <span className="absolute right-[28%] top-1 h-2 w-2 rounded-full bg-amber-500" />
            )}
          </Link>
        ))}
      </nav>
    </>
  )
}
