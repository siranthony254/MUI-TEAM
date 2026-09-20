export type TeamRole = 'super_admin' | 'executive' | 'member'
export type TaskStatus =
  | 'not_started' | 'in_progress' | 'submitted' | 'under_review'
  | 'needs_revision' | 'completed' | 'closed'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface TeamMember {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: TeamRole
  title: string | null
  department_id: string | null
  mandate: string | null
  responsibilities: string[]
  authority: string | null
  deliverables: string[]
  reports_to: string | null
  active: boolean
  notify_email: boolean
  notify_push: boolean
  notify_sms: boolean
}

export interface Task {
  id: string
  title: string
  description: string | null
  project_id: string | null
  assignee_id: string | null
  assigned_by: string | null
  parent_task_id: string | null
  status: TaskStatus
  priority: TaskPriority
  start_date: string | null
  due_at: string | null
  requires_evidence: boolean
  evidence_note: string | null
  review_note: string | null
  submitted_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  meeting_id: string | null
  department_id: string | null
  tags: string[]
  weight: number
  require_approval: boolean
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly'
  recurrence_until: string | null
  recurrence_parent_id: string | null
  original_assignee_id: string | null
  delegated_by: string | null
  delegated_at: string | null
  delegation_note: string | null
}

export interface Project {
  id: string
  name: string
  description: string | null
  department_id: string | null
  owner_id: string | null
  status: 'active' | 'at_risk' | 'paused' | 'done'
  start_date: string | null
  due_date: string | null
}

export interface AppNotification {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export const ROLE_LABEL: Record<TeamRole, string> = {
  super_admin: 'Super Admin',
  executive: 'Executive',
  member: 'Team Member',
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  under_review: 'Under review',
  needs_revision: 'Needs revision',
  completed: 'Completed',
  closed: 'Closed',
}

export interface Meeting {
  id: string
  title: string
  starts_at: string
  ends_at: string | null
  location: string | null
  agenda: string | null
  minutes: string | null
  status: 'scheduled' | 'held' | 'cancelled'
  project_id: string | null
  created_by: string | null
}

export interface Decision {
  id: string
  title: string
  decision: string
  rationale: string | null
  decided_on: string
  decided_by: string | null
  status: 'active' | 'superseded' | 'reversed'
  superseded_by: string | null
  meeting_id: string | null
  created_by: string | null
  number: number
  implementation_owner_id: string | null
  project_id: string | null
}

export interface Report {
  id: string
  author_id: string
  department_id: string | null
  period_start: string
  period_end: string
  activities: string | null
  completed: string | null
  challenges: string | null
  metrics: string | null
  recommendations: string | null
  status: 'draft' | 'submitted'
  submitted_at: string | null
  kind: 'personal' | 'department'
}

export interface Channel {
  id: string
  name: string
  kind: 'general' | 'executive' | 'department' | 'project' | 'group'
  department_id: string | null
  project_id: string | null
  created_by: string | null
}

export interface Message {
  id: string
  channel_id: string
  author_id: string
  body: string
  mentions: string[]
  created_at: string
  deleted_at: string | null
}

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  kind: 'event' | 'recording' | 'publication' | 'deadline' | 'other'
  starts_at: string
  ends_at: string | null
  all_day: boolean
  visibility: 'everyone' | 'executive'
  created_by: string | null
}

export const RESOURCE_CATEGORIES = [
  'Governance', 'Policies', 'Department Manuals', 'Brand Assets', 'Research',
  'MUI Conversations', 'Training', 'Templates', 'Meeting Minutes', 'Other',
] as const

export interface Resource {
  id: string
  title: string
  description: string | null
  category: string
  kind: 'file' | 'link'
  url: string | null
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  size_bytes: number | null
  visibility: 'everyone' | 'executive'
  uploaded_by: string | null
  created_at: string
  project_id: string | null
}

export interface Attachment {
  id: string
  entity_type: 'task' | 'report' | 'decision'
  entity_id: string
  kind: 'file' | 'link'
  url: string | null
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  created_at: string
}

export interface ActivityEntry {
  id: string
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  summary: string
  field: string | null
  from_value: string | null
  to_value: string | null
  project_id: string | null
  created_at: string
}

export interface Department { id: string; name: string; description: string | null }
