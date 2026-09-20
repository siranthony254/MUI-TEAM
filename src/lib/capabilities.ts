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

