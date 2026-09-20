/**
 * Notification kinds are grouped into the events people can tune (the preference matrix), and the
 * groups are collected into the categories shown as tabs in the notification centre.
 * Plain module: used by server and client code.
 */
export type Channel = 'in_app' | 'email' | 'push' | 'sms'

export interface Group {
  id: string
  label: string
  hint: string
  category: string
  kinds: string[]
  /** Defaults used until a person changes them (follows the manual's table). */
  defaults: Record<Channel, boolean>
}

export const GROUPS: Group[] = [
  { id: 'new_task', label: 'New task', hint: 'Someone assigns or delegates work to you', category: 'tasks',
    kinds: ['task_assigned', 'task_delegated'], defaults: { in_app: true, email: true, push: true, sms: true } },
  { id: 'task_due', label: 'Task due', hint: 'Reminders before a deadline', category: 'tasks',
    kinds: ['due_7d', 'due_3d', 'due_1d', 'due_today', 'due_1h'], defaults: { in_app: true, email: true, push: true, sms: true } },
  { id: 'task_overdue', label: 'Task overdue', hint: 'Your task passed its deadline, or one you assigned did', category: 'tasks',
    kinds: ['overdue', 'overdue_1d', 'overdue_escalation'], defaults: { in_app: true, email: true, push: true, sms: true } },
  { id: 'task_updates', label: 'Task updates', hint: 'Submissions, approvals, revisions, blocks, comments, extensions', category: 'tasks',
    kinds: ['task_submitted', 'task_completed', 'task_revision', 'task_blocked', 'task_comment', 'extension_requested', 'extension_approved', 'extension_denied'],
    defaults: { in_app: true, email: true, push: true, sms: false } },
  { id: 'mention', label: 'Mentions', hint: 'Someone @mentions you in chat', category: 'mentions',
    kinds: ['mention'], defaults: { in_app: true, email: false, push: true, sms: false } },
  { id: 'chat', label: 'Chat messages', hint: 'New messages in channels you can see (mute a channel from its header)', category: 'messages',
    kinds: ['chat'], defaults: { in_app: false, email: false, push: true, sms: false } },
  { id: 'team_update', label: 'Team updates', hint: 'Someone joins, a decision or event is added, your role or access changes', category: 'system',
    kinds: ['team_update'], defaults: { in_app: true, email: false, push: true, sms: false } },
  { id: 'message', label: 'Direct messages', hint: 'A private message from a colleague', category: 'messages',
    kinds: ['dm'], defaults: { in_app: true, email: false, push: true, sms: false } },
  { id: 'meeting', label: 'Meetings', hint: 'Invitations, starting soon, minutes reminders', category: 'meetings',
    kinds: ['meeting_invite', 'meeting_soon', 'minutes_prompt'], defaults: { in_app: true, email: true, push: true, sms: false } },
  { id: 'project', label: 'Projects', hint: 'Project changes that involve you', category: 'projects',
    kinds: ['project_update'], defaults: { in_app: true, email: false, push: true, sms: false } },
  { id: 'announcement', label: 'Announcements', hint: 'Official announcements and campaigns', category: 'announcements',
    kinds: ['announcement', 'announcement_urgent', 'campaign'], defaults: { in_app: true, email: false, push: true, sms: false } },
  { id: 'system', label: 'System', hint: 'Reports submitted, access changes and other notices', category: 'system',
    kinds: ['report_submitted', 'admin_granted', 'admin_expired', 'resource_shared'], defaults: { in_app: true, email: true, push: true, sms: false } },
]

export const CATEGORIES: { id: string; label: string }[] = [
  { id: 'tasks', label: 'Tasks' }, { id: 'mentions', label: 'Mentions' }, { id: 'messages', label: 'Messages' },
  { id: 'meetings', label: 'Meetings' }, { id: 'projects', label: 'Projects' },
  { id: 'announcements', label: 'Announcements' }, { id: 'system', label: 'System' },
]

const BY_KIND = new Map(GROUPS.flatMap((g) => g.kinds.map((k) => [k, g] as const)))

/** Unknown kinds fall under System so nothing is ever silently dropped. */
export const groupOfKind = (kind: string): Group => BY_KIND.get(kind) ?? GROUPS.find((g) => g.id === 'system')!
export const kindsOfCategory = (category: string): string[] =>
  GROUPS.filter((g) => g.category === category).flatMap((g) => g.kinds)

export interface PrefRow { event_group: string; in_app: boolean; email: boolean; push: boolean; sms: boolean }

/** The effective setting for one person, one group, one channel. Mandatory groups can't be switched off. */
export function channelOn(
  group: Group, channel: Channel, prefs: PrefRow[] | Map<string, PrefRow>, mandatory: string[],
): boolean {
  if (mandatory.includes(group.id) && (channel === 'in_app' || channel === 'email' || channel === 'push')) return true
  const row = prefs instanceof Map ? prefs.get(group.id) : prefs.find((p) => p.event_group === group.id)
  return row ? row[channel] : group.defaults[channel]
}

export const parseMandatory = (value: string | null | undefined): string[] =>
  (value ?? 'new_task,task_overdue').split(',').map((s) => s.trim()).filter(Boolean)
