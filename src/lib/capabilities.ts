/** Capability names and defaults. Plain module: safe to import from client components. */
export type Level = 'super_admin' | 'executive' | 'department_director' | 'member' | 'guest'
export type EditableLevel = 'executive' | 'department_director' | 'member'

export const CAPABILITIES = [
  { id: 'create_project', label: 'Create and manage projects', hint: 'Start projects, name a director, set dates' },
  { id: 'assign_tasks', label: 'Assign tasks to others', hint: 'Department directors: only to members of their own department' },
  { id: 'delegate_tasks', label: 'Delegate tasks they hold', hint: 'Pass work on, keeping the chain visible' },
  { id: 'schedule_meeting', label: 'Schedule meetings', hint: 'Invite people, record minutes, create action items' },
  { id: 'record_decision', label: 'Record decisions', hint: 'Add to the decision register' },
  { id: 'add_event', label: 'Add calendar events', hint: 'Recordings, publications, deadlines' },
  { id: 'add_resource', label: 'Add files and links to Resources', hint: 'Upload to the shared library and projects' },
  { id: 'create_group_chat', label: 'Start group chats', hint: 'Private group conversations' },
  { id: 'send_campaign', label: 'Send campaigns', hint: 'A targeted message over app, email, push or SMS' },
  { id: 'view_analytics', label: 'View the command centre', hint: 'Analytics for their own area (organisation-wide for admins and the Director)' },
  { id: 'submit_department_report', label: 'Submit department reports', hint: 'Reports on behalf of a department they lead' },
] as const

export type Capability = (typeof CAPABILITIES)[number]['id']
export type Matrix = Record<EditableLevel, Record<Capability, boolean>>

/** Used until an admin saves changes, and if the table is unreachable. Mirrors the seeded defaults. */
export const DEFAULT_MATRIX: Matrix = {
  executive: Object.fromEntries(CAPABILITIES.map((c) => [c.id, c.id !== 'send_campaign'])) as Record<Capability, boolean>,
  department_director: Object.fromEntries(CAPABILITIES.map((c) => [c.id, ['assign_tasks', 'submit_department_report', 'add_event', 'add_resource'].includes(c.id)])) as Record<Capability, boolean>,
  member: Object.fromEntries(CAPABILITIES.map((c) => [c.id, false])) as Record<Capability, boolean>,
}


/** Slices of system administration that can be delegated to a person without making them a full system admin. */
export const ADMIN_SCOPES = [
  { id: 'admin.people', label: 'Manage people', hint: 'Add members, edit profiles and responsibilities, reset access, deactivate' },
  { id: 'admin.onboarding', label: 'Manage onboarding', hint: 'The welcome message and the new-member checklist' },
  { id: 'admin.departments', label: 'Manage departments', hint: 'Create departments and choose their directors' },
  { id: 'admin.settings', label: 'Organisation settings', hint: 'Reminders, escalation, meeting prompts, required notifications' },
  { id: 'admin.permissions', label: 'Permissions', hint: 'The permission matrix and per-person access (cannot make anyone a system admin)' },
] as const

export type Scope = (typeof ADMIN_SCOPES)[number]['id']

/** Ready-made starting points for the access panel; everything can still be adjusted. */
export const ACCESS_PRESETS: { id: string; label: string; hint: string; caps: Partial<Record<Capability, 'allow' | 'deny'>>; scopes: Scope[] }[] = [
  { id: 'standard', label: 'Standard', hint: 'Follows their level. Nothing extra.', caps: {}, scopes: [] },
  {
    id: 'secretary', label: 'Secretary / office admin',
    hint: 'Runs people and onboarding, sends campaigns, sees analytics, keeps the calendar and meetings.',
    caps: { send_campaign: 'allow', view_analytics: 'allow', schedule_meeting: 'allow', add_event: 'allow', add_resource: 'allow', record_decision: 'allow' },
    scopes: ['admin.people', 'admin.onboarding'],
  },
  {
    id: 'hr', label: 'People & onboarding lead',
    hint: 'Onboards and manages members and departments.',
    caps: {}, scopes: ['admin.people', 'admin.onboarding', 'admin.departments'],
  },
  {
    id: 'comms', label: 'Communications lead',
    hint: 'Sends campaigns and can add events and files.',
    caps: { send_campaign: 'allow', add_event: 'allow', add_resource: 'allow' }, scopes: [],
  },
]
