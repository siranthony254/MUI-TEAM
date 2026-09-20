import {
  LayoutDashboard, CheckSquare, FolderKanban, Users, Bell, Settings,
  CalendarDays, Gavel, FileText, BarChart3, MessageSquare, CalendarRange, Library, UserCheck, History,
} from 'lucide-react'

type Item = { href: string; label: string; icon: typeof Bell; show?: 'exec' | 'admin' }

export const NAV_ITEMS: Item[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'My Work', icon: CheckSquare },
  { href: '/responsibilities', label: 'My role', icon: UserCheck },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/calendar', label: 'Calendar', icon: CalendarRange },
  { href: '/meetings', label: 'Meetings', icon: CalendarDays },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/decisions', label: 'Decisions', icon: Gavel },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/resources', label: 'Resources', icon: Library },
  { href: '/people', label: 'People', icon: Users },
  { href: '/notifications', label: 'Alerts', icon: Bell },
  { href: '/activity', label: 'Activity', icon: History },
  { href: '/analytics', label: 'Command centre', icon: BarChart3, show: 'exec' },
  { href: '/admin', label: 'Admin', icon: Settings, show: 'admin' },
]

// The four things people open most on a phone; everything else lives under "More".
export const MOBILE_PRIMARY = ['/', '/tasks', '/chat', '/calendar', '/notifications']

export function visibleItems(role: 'super_admin' | 'executive' | 'member') {
  return NAV_ITEMS.filter((i) =>
    !i.show || (i.show === 'exec' && role !== 'member') || (i.show === 'admin' && role === 'super_admin'))
}

