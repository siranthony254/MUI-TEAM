import {
  LayoutDashboard, CheckSquare, FolderKanban, Users, Bell, Settings,
  CalendarDays, Gavel, FileText, BarChart3, MessageSquare, CalendarRange, Library, UserCheck, History, Megaphone, Landmark, Building2, Mic,
} from 'lucide-react'

type Item = { href: string; label: string; icon: typeof Bell; show?: 'exec' | 'admin' | 'director' }

export const NAV_ITEMS: Item[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'My Work', icon: CheckSquare },
  { href: '/responsibilities', label: 'My role', icon: UserCheck },
  { href: '/announcements', label: 'Announcements', icon: Megaphone },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/calendar', label: 'Calendar', icon: CalendarRange },
  { href: '/meetings', label: 'Meetings', icon: CalendarDays },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/decisions', label: 'Decisions', icon: Gavel },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/resources', label: 'Resources', icon: Library },
  { href: '/conversations', label: 'Conversations', icon: Mic },
  { href: '/departments', label: 'Departments', icon: Building2 },
  { href: '/people', label: 'People', icon: Users },
  { href: '/notifications', label: 'Alerts', icon: Bell },
  { href: '/activity', label: 'Activity', icon: History },
  { href: '/director', label: "Director's desk", icon: Landmark, show: 'director' },
  { href: '/analytics', label: 'Command centre', icon: BarChart3, show: 'exec' },
  { href: '/admin', label: 'System admin', icon: Settings, show: 'admin' },
]

// The four things people open most on a phone; everything else lives under "More".
export const MOBILE_PRIMARY = ['/', '/tasks', '/chat', '/calendar', '/notifications']

/** What an external collaborator (guest) may open. */
export const GUEST_PATHS = ['/', '/tasks', '/projects', '/chat', '/notifications', '/account', '/more']

export function visibleItems(role: 'super_admin' | 'executive' | 'member' | 'guest', isDirector = false, analytics = false, admin = false) {
  if (role === 'guest') return NAV_ITEMS.filter((i) => GUEST_PATHS.includes(i.href) && i.href !== '/more')
  return NAV_ITEMS.filter((i) =>
    !i.show ||
    (i.show === 'exec' && (role === 'super_admin' || role === 'executive' || analytics)) ||
    (i.show === 'admin' && (role === 'super_admin' || admin)) ||
    (i.show === 'director' && isDirector))
}

