// End-to-end test of the database rules, run as real signed-in users. Creates ZZTEST accounts and deletes them afterwards.
// Usage: node scripts/e2e-db.mjs   (needs .env.local with the service role key; run against a non-production project if you can)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }),
)
const URL_ = new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const svc = createClient(URL_, SVC, opts)

const P = 'ZZTEST'
const stamp = Date.now().toString(36)
const results = []
let created = { users: [], dept: null }

const pw = () => 'Zz!' + Math.random().toString(36).slice(2) + 'A9'
async function mkUser(key, role, extra = {}) {
  const email = `zztest-${key}-${stamp}@example.com`
  const password = pw()
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `${P} ${key}` } })
  if (error) throw new Error('createUser ' + error.message)
  const id = data.user.id
  created.users.push(id)
  const { error: e2 } = await svc.from('team_members').upsert({ id, full_name: `${P} ${key}`, email, role, department_id: created.dept, ...extra })
  if (e2) throw new Error('team_members ' + e2.message)
  const client = createClient(URL_, ANON, opts)
  const { error: e3 } = await client.auth.signInWithPassword({ email, password })
  if (e3) throw new Error('signIn ' + e3.message)
  return { id, client, email }
}

async function t(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name) }
  catch (e) { results.push(['FAIL', name, e.message]); console.log('FAIL', name, '->', e.message) }
}
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed') }
const noErr = (r, m) => { if (r.error) throw new Error((m || 'unexpected error') + ': ' + r.error.message); return r.data }
const isErr = (r, m) => { if (!r.error) throw new Error(m || 'expected an error but it succeeded'); return r.error.message }
const daysFromNow = (d) => new Date(Date.now() + d * 86400000).toISOString()

async function main() {
  const { data: dept } = await svc.from('departments').insert({ name: `${P} Dept ${stamp}` }).select('id').single()
  created.dept = dept.id

  const E = await mkUser('exec', 'executive')
  const E2 = await mkUser('exec2', 'executive')
  const M = await mkUser('member', 'member', { reports_to: E.id })
  const D = await mkUser('member2', 'member', { reports_to: E.id })
  const notes = async (u, kind) => (await svc.from('notifications').select('*').eq('recipient_id', u.id).eq('kind', kind)).data ?? []

  let task1, task2

  await t('E creates a task for M; M sees it, D does not', async () => {
    task1 = noErr(await E.client.from('tasks').insert({ title: `${P} research`, assigned_by: E.id, assignee_id: M.id, due_at: daysFromNow(2), weight: 30, project_id: null }).select('id').single()).id
    ok((noErr(await M.client.from('tasks').select('id').eq('id', task1))).length === 1, 'M cannot see own task')
    ok((noErr(await D.client.from('tasks').select('id').eq('id', task1))).length === 0, 'D can see M\'s task')
  })

  await t('assignment creates a notification + structured activity', async () => {
    ok((await notes(M, 'task_assigned')).length >= 1, 'no task_assigned notification')
    const { data } = await svc.from('activity_log').select('*').eq('entity_id', task1).eq('action', 'task.created')
    ok(data.length === 1, 'no task.created activity')
  })

  await t('M cannot skip review: not_started -> completed is blocked', async () => {
    isErr(await M.client.from('tasks').update({ status: 'completed' }).eq('id', task1))
  })

  await t('M start -> submit works; E is notified; activity has from/to', async () => {
    noErr(await M.client.from('tasks').update({ status: 'in_progress' }).eq('id', task1))
    noErr(await M.client.from('tasks').update({ status: 'submitted' }).eq('id', task1))
    ok((await notes(E, 'task_submitted')).length === 1, 'E not notified of submission')
    const { data } = await svc.from('activity_log').select('*').eq('entity_id', task1).eq('action', 'task.status_changed').eq('to_value', 'submitted')
    ok(data.length === 1 && data[0].from_value === 'in_progress' && data[0].field === 'status', 'structured activity missing')
  })

  await t('M cannot approve own work; E can; M is notified', async () => {
    isErr(await M.client.from('tasks').update({ status: 'completed' }).eq('id', task1))
    noErr(await E.client.from('tasks').update({ status: 'completed' }).eq('id', task1))
    ok((await notes(M, 'task_completed')).length === 1, 'M not notified of approval')
  })

  await t('M cannot change require_approval / weight / project (terms are the assigner\'s)', async () => {
    const r = noErr(await E.client.from('tasks').insert({ title: `${P} terms`, assigned_by: E.id, assignee_id: M.id, weight: 5 }).select('id').single())
    isErr(await M.client.from('tasks').update({ require_approval: false }).eq('id', r.id), 'member changed require_approval')
    isErr(await M.client.from('tasks').update({ weight: 100 }).eq('id', r.id), 'member changed weight')
  })

  await t('no-approval task can be completed directly by the assignee', async () => {
    const id = noErr(await E.client.from('tasks').insert({ title: `${P} noapproval`, assigned_by: E.id, assignee_id: M.id, require_approval: false }).select('id').single()).id
    noErr(await M.client.from('tasks').update({ status: 'in_progress' }).eq('id', id))
    noErr(await M.client.from('tasks').update({ status: 'completed' }).eq('id', id))
  })

  await t('member can only create tasks for themselves', async () => {
    isErr(await M.client.from('tasks').insert({ title: `${P} sneaky`, assigned_by: M.id, assignee_id: D.id }))
    noErr(await M.client.from('tasks').insert({ title: `${P} mine`, assigned_by: M.id, assignee_id: M.id }))
  })

  await t('delegation: E2 assigns to E; E delegates to M; chain recorded; E2 told', async () => {
    task2 = noErr(await E2.client.from('tasks').insert({ title: `${P} delegated`, assigned_by: E2.id, assignee_id: E.id, due_at: daysFromNow(3), assign_channels: ['email'] }).select('id').single()).id
    noErr(await E.client.from('tasks').update({
      assignee_id: M.id, original_assignee_id: E.id, delegated_by: E.id, delegated_at: new Date().toISOString(), delegation_note: 'please handle',
    }).eq('id', task2))
    const row = noErr(await M.client.from('tasks').select('*').eq('id', task2).single())
    ok(row.original_assignee_id === E.id && row.delegated_by === E.id, 'chain not stored')
    ok((noErr(await E.client.from('tasks').select('id').eq('id', task2))).length === 1, 'delegator lost sight of the task')
    ok((await notes(E2, 'task_delegated')).length === 1, 'original assigner not told')
    const asg = (await notes(M, 'task_assigned')).find((n) => n.title === 'Task delegated to you')
    ok(asg && JSON.stringify(asg.channels) === '["email"]', 'sender channel choice not carried onto notification')
    const { data } = await svc.from('activity_log').select('*').eq('entity_id', task2).eq('action', 'task.delegated')
    ok(data.length === 1 && data[0].to_value === `${P} member`, 'delegation not logged')
  })

  await t('a plain member cannot delegate/reassign, and cannot forge a delegation', async () => {
    isErr(await M.client.from('tasks').update({ assignee_id: D.id }).eq('id', task2), 'member reassigned a task')
    const own = noErr(await M.client.from('tasks').insert({ title: `${P} own2`, assigned_by: M.id, assignee_id: M.id }).select('id').single()).id
    isErr(await M.client.from('tasks').update({ assignee_id: D.id, original_assignee_id: M.id, delegated_by: M.id }).eq('id', own), 'member forged delegation')
  })

  await t('the original assigner (E2) can reassign', async () => {
    noErr(await E2.client.from('tasks').update({ assignee_id: D.id }).eq('id', task2))
  })

  await t('attachments: assignee can attach a link, outsider cannot', async () => {
    noErr(await D.client.from('attachments').insert({ entity_type: 'task', entity_id: task2, kind: 'link', url: 'https://example.com', file_name: 'ref', uploaded_by: D.id }))
    isErr(await M.client.from('attachments').insert({ entity_type: 'task', entity_id: task2, kind: 'link', url: 'https://example.com', uploaded_by: M.id }), 'outsider attached')
    ok((noErr(await M.client.from('attachments').select('id').eq('entity_id', task2))).length === 0, 'outsider can read attachments')
  })

  let project
  await t('project: auto chat channel; member with a task sees project + TRUE stats', async () => {
    project = noErr(await E.client.from('projects').insert({ name: `${P} Project ${stamp}`, owner_id: E.id, created_by: E.id }).select('id').single()).id
    const ch = (await svc.from('channels').select('id').eq('project_id', project)).data
    ok(ch.length === 1, 'project channel not created')
    noErr(await E.client.from('tasks').insert({ title: `${P} p1`, assigned_by: E.id, assignee_id: M.id, project_id: project, weight: 10, status: 'not_started' }))
    noErr(await E.client.from('tasks').insert({ title: `${P} p2`, assigned_by: E.id, assignee_id: D.id, project_id: project, weight: 30 }))
    ok((noErr(await M.client.from('projects').select('id').eq('id', project))).length === 1, 'M cannot see project they have a task in')
    const stats = noErr(await M.client.rpc('project_stats_all')).find((s) => s.project_id === project)
    ok(stats && stats.task_count === 2 && stats.total_weight === 40, `stats wrong: ${JSON.stringify(stats)}`)
    ok((noErr(await M.client.from('tasks').select('id').eq('project_id', project))).length === 1, 'M should see only their own task')
    ok((noErr(await M.client.from('channels').select('id').eq('project_id', project))).length === 1, 'M cannot see project channel')
  })

  await t('project channel is hidden from someone with no link to the project', async () => {
    const X = await mkUser('outsider', 'member')
    ok((noErr(await X.client.from('channels').select('id').eq('project_id', project))).length === 0, 'outsider sees project channel')
    ok((noErr(await X.client.from('projects').select('id').eq('id', project))).length === 0, 'outsider sees project')
  })

  await t('chat: mention notifies, executive channel is private, D not notified about a channel they cannot see', async () => {
    const gen = (await svc.from('channels').select('id').eq('kind', 'general').single()).data.id
    const exe = (await svc.from('channels').select('id').eq('kind', 'executive').single()).data.id
    noErr(await E.client.from('messages').insert({ channel_id: gen, author_id: E.id, body: `${P} hi @${P} member`, mentions: [M.id] }))
    ok((await notes(M, 'mention')).length === 1, 'mention not delivered')
    isErr(await M.client.from('messages').insert({ channel_id: exe, author_id: M.id, body: `${P} nope` }), 'member posted to executive channel')
    noErr(await E.client.from('messages').insert({ channel_id: exe, author_id: E.id, body: `${P} secret`, mentions: [D.id] }))
    ok((await notes(D, 'mention')).length === 0, 'D was notified about a private channel')
    ok((noErr(await M.client.from('messages').select('id').eq('channel_id', exe))).length === 0, 'member reads executive channel')
    isErr(await E.client.from('messages').update({ body: 'edited' }).eq('channel_id', gen), 'message edit allowed')
  })

  let meeting
  await t('meetings: invite notifies attendee; non-attendee cannot see it', async () => {
    meeting = noErr(await E.client.from('meetings').insert({ title: `${P} sync`, starts_at: daysFromNow(1), created_by: E.id }).select('id').single()).id
    noErr(await E.client.from('meeting_attendees').insert({ meeting_id: meeting, member_id: M.id }))
    ok((await notes(M, 'meeting_invite')).length === 1, 'no invite notification')
    ok((noErr(await M.client.from('meetings').select('id').eq('id', meeting))).length === 1, 'attendee cannot see meeting')
    ok((noErr(await D.client.from('meetings').select('id').eq('id', meeting))).length === 0, 'outsider sees meeting')
    isErr(await M.client.from('meetings').insert({ title: `${P} x`, starts_at: daysFromNow(1), created_by: M.id }), 'member scheduled a meeting')
  })

  await t('decisions: auto-numbered; everyone reads; only executives write', async () => {
    const d = noErr(await E.client.from('decisions').insert({ title: `${P} decision`, decision: 'x', created_by: E.id }).select('id, number').single())
    ok(Number.isInteger(d.number) && d.number > 0, 'no number assigned')
    ok((noErr(await M.client.from('decisions').select('id').eq('id', d.id))).length === 1, 'member cannot read decisions')
    isErr(await M.client.from('decisions').insert({ title: `${P} no`, decision: 'x', created_by: M.id }), 'member wrote a decision')
  })

  await t('reports: draft -> submit notifies line manager; locked after; peers cannot read', async () => {
    const start = new Date().toISOString().slice(0, 8) + '01'
    const r = noErr(await M.client.from('reports').insert({ author_id: M.id, kind: 'personal', period_start: start, period_end: start, activities: 'did things' }).select('id').single())
    ok((noErr(await D.client.from('reports').select('id').eq('id', r.id))).length === 0, 'peer reads a draft')
    noErr(await M.client.from('reports').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', r.id))
    ok((await notes(E, 'report_submitted')).length === 1, 'line manager not notified')
    ok((noErr(await E.client.from('reports').select('id').eq('id', r.id))).length === 1, 'line manager cannot read submitted report')
    const upd = await M.client.from('reports').update({ activities: 'tampered' }).eq('id', r.id).select('id')
    ok(!upd.error && upd.data.length === 0, 'submitted report was editable')
    isErr(await M.client.from('reports').insert({ author_id: M.id, kind: 'department', department_id: created.dept, period_start: start, period_end: start }), 'member filed a department report')
  })

  await t('reminders: created once per stage (idempotent)', async () => {
    const id = noErr(await E.client.from('tasks').insert({ title: `${P} remind`, assigned_by: E.id, assignee_id: M.id, due_at: daysFromNow(2) }).select('id').single()).id
    const first = noErr(await svc.rpc('generate_task_reminders'))
    const n1 = (await svc.from('notifications').select('id').eq('recipient_id', M.id).like('dedupe_key', `reminder:${id}:%`)).data.length
    await svc.rpc('generate_task_reminders')
    const n2 = (await svc.from('notifications').select('id').eq('recipient_id', M.id).like('dedupe_key', `reminder:${id}:%`)).data.length
    ok(n1 === 1 && n2 === 1, `expected exactly 1 reminder, got ${n1} then ${n2} (first run created ${first})`)
  })

  await t('recurring: completing spawns the next occurrence exactly once', async () => {
    const id = noErr(await E.client.from('tasks').insert({ title: `${P} weekly`, assigned_by: E.id, assignee_id: M.id, due_at: daysFromNow(1), recurrence: 'weekly', require_approval: false }).select('id').single()).id
    noErr(await M.client.from('tasks').update({ status: 'in_progress' }).eq('id', id))
    noErr(await M.client.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id))
    const made = noErr(await svc.rpc('spawn_recurring_tasks'))
    ok(made >= 1, 'nothing spawned')
    const kids = (await svc.from('tasks').select('id, due_at, status').eq('recurrence_parent_id', id)).data
    ok(kids.length === 1 && kids[0].status === 'not_started', 'wrong number of children')
    const gap = (new Date(kids[0].due_at) - new Date(Date.now() + 86400000)) / 86400000
    ok(Math.abs(gap - 7) < 0.1, `next due should be +7 days, gap was ${gap.toFixed(2)}`)
    await svc.rpc('spawn_recurring_tasks')
    ok((await svc.from('tasks').select('id').eq('recurrence_parent_id', id)).data.length === 1, 'spawned twice')
  })

  await t('activity: member sees activity of their own task but not of others\'', async () => {
    const mine = noErr(await M.client.from('activity_log').select('id').eq('entity_id', task1))
    ok(mine.length >= 3, 'member cannot see own task history')
    const others = noErr(await D.client.from('activity_log').select('id').eq('entity_id', task1))
    ok(others.length === 0, 'D sees activity of M\'s task')
  })

  await t('team_members directory is readable; role changes are not self-serve', async () => {
    ok((noErr(await M.client.from('team_members').select('id'))).length >= 4, 'directory not readable')
    const r = await M.client.from('team_members').update({ role: 'super_admin' }).eq('id', M.id).select('id')
    ok(!r.error && r.data.length === 0, 'member could promote themselves')
    const still = (await svc.from('team_members').select('role').eq('id', M.id).single()).data.role
    ok(still === 'member', 'role changed!')
  })
  // ---- Executive Director / System Admin / announcements / onboarding (migration 7) ----
  const hasDirector = ((await svc.from('team_members').select('id').eq('is_director', true)).data ?? []).length > 0
  let G = null
  if (!hasDirector) G = await mkUser('director', 'executive', { is_director: true })

  await t('director: sees org-wide tasks; an ordinary executive does not', async () => {
    if (!G) return
    const other = noErr(await E2.client.from('tasks').insert({ title: `${P} elsewhere`, assigned_by: E2.id, assignee_id: E2.id }).select('id').single()).id
    ok((noErr(await G.client.from('tasks').select('id').eq('id', other))).length === 1, 'director cannot see org-wide task')
    ok((noErr(await E.client.from('tasks').select('id').eq('id', other))).length === 0, 'plain executive sees a task outside their line')
  })

  await t('director sees all channels and meetings; an unrelated executive does not see others\' meetings', async () => {
    if (!G) return
    ok((noErr(await G.client.from('channels').select('id').eq('project_id', project))).length === 1, 'director cannot see project channel')
    ok((noErr(await G.client.from('meetings').select('id').eq('id', meeting))).length === 1, 'director cannot see meeting')
    ok((noErr(await E2.client.from('meetings').select('id').eq('id', meeting))).length === 0, 'unrelated executive sees meeting')
  })

  await t('announcements: only the director publishes; audience and schedule are enforced', async () => {
    if (!G) return
    isErr(await E.client.from('announcements').insert({ title: `${P} nope`, body: 'x', created_by: E.id }), 'executive published an announcement')
    isErr(await M.client.from('announcements').insert({ title: `${P} nope`, body: 'x', created_by: M.id }), 'member published an announcement')
    const all = noErr(await G.client.from('announcements').insert({ title: `${P} all`, body: 'hello team', created_by: G.id }).select('id').single()).id
    const exec = noErr(await G.client.from('announcements').insert({ title: `${P} execonly`, body: 'x', audience: 'executives', created_by: G.id }).select('id').single()).id
    const dept = noErr(await G.client.from('announcements').insert({ title: `${P} dept`, body: 'x', audience: 'department', department_id: created.dept, created_by: G.id }).select('id').single()).id
    const later = noErr(await G.client.from('announcements').insert({ title: `${P} later`, body: 'x', publish_at: daysFromNow(2), created_by: G.id }).select('id').single()).id
    const seen = async (u) => new Set((noErr(await u.client.from('announcements').select('id'))).map((r) => r.id))
    const mSees = await seen(M)
    const eSees = await seen(E)
    ok(mSees.has(all) && mSees.has(dept), 'member misses a public/department announcement')
    ok(!mSees.has(exec), 'member sees executives-only announcement')
    ok(eSees.has(exec), 'executive misses executives-only announcement')
    ok(!mSees.has(later) && !eSees.has(later), 'scheduled announcement visible early')
    ok((noErr(await G.client.from('announcements').select('id').eq('id', later))).length === 1, 'director cannot see own scheduled announcement')
  })

  await t('publishing notifies the audience exactly once, and only when due', async () => {
    if (!G) return
    const n1 = noErr(await svc.rpc('publish_due_announcements'))
    ok(n1 >= 3, `expected notifications for due announcements, got ${n1}`)
    ok((await notes(M, 'announcement')).length >= 2, 'member not notified')
    ok((await notes(E, 'announcement')).length >= 2, 'executive not notified of executives-only')
    const before = (await svc.from('notifications').select('id').like('dedupe_key', 'announcement:%')).data.length
    await svc.rpc('publish_due_announcements')
    const after = (await svc.from('notifications').select('id').like('dedupe_key', 'announcement:%')).data.length
    ok(before === after, 'announcement notified twice')
    const later = (await svc.from('announcements').select('notified_at').like('title', `${P} later`)).data[0]
    ok(later.notified_at === null, 'scheduled announcement sent early')
  })

  await t('delegated admin access expires by itself and is announced', async () => {
    const S = await mkUser('secretary', 'member')
    noErr(await svc.from('team_members').update({ role: 'super_admin', role_before_admin: 'member', admin_granted_by: E.id, admin_until: new Date(Date.now() - 60000).toISOString() }).eq('id', S.id))
    const n = noErr(await svc.rpc('expire_admin_delegations'))
    ok(n >= 1, 'nothing expired')
    const row = (await svc.from('team_members').select('role, admin_until, role_before_admin').eq('id', S.id).single()).data
    ok(row.role === 'member' && row.admin_until === null && row.role_before_admin === null, `role not restored: ${JSON.stringify(row)}`)
    ok((await notes(S, 'admin_expired')).length === 1, 'no expiry notice')
  })

  await t('a system admin has org-wide read but cannot publish announcements', async () => {
    const S = await mkUser('admin2', 'super_admin')
    ok((noErr(await S.client.from('tasks').select('id').eq('id', task1))).length === 1, 'system admin cannot read tasks')
    if (G) isErr(await S.client.from('announcements').insert({ title: `${P} sneaky`, body: 'x', created_by: S.id }), 'system admin published an announcement')
  })

  await t('onboarding: new members get the checklist; they tick only their own; templates are admin-only', async () => {
    const items = (await svc.from('onboarding_items').select('id').eq('active', true)).data
    ok(items.length >= 1, 'no onboarding items seeded')
    const N = await mkUser('newbie', 'member')
    const mine = noErr(await N.client.from('member_onboarding').select('item_id, done_at').eq('member_id', N.id))
    ok(mine.length === items.length, `expected ${items.length} steps, got ${mine.length}`)
    const done = await N.client.from('member_onboarding').update({ done_at: new Date().toISOString() }).eq('member_id', N.id).eq('item_id', mine[0].item_id).select('item_id')
    ok(!done.error && done.data.length === 1, 'could not tick own step')
    const theirs = await N.client.from('member_onboarding').update({ done_at: new Date().toISOString() }).eq('member_id', M.id).select('item_id')
    ok(!theirs.error && theirs.data.length === 0, 'ticked someone else\'s step')
    isErr(await N.client.from('onboarding_items').insert({ title: `${P} step` }), 'member edited onboarding template')
    const w = await N.client.from('org_settings').upsert({ key: 'welcome_message', value: 'hacked' })
    ok(w.error, 'member changed the welcome message')
    ok((noErr(await N.client.from('org_settings').select('value').eq('key', 'welcome_message'))).length === 1, 'member cannot read the welcome message')
  })

  await t('campaigns log is not readable by ordinary members', async () => {
    const c = noErr(await svc.from('campaigns').insert({ title: `${P} camp`, body: 'x', audience: 'all', sent_by: E.id }).select('id').single())
    ok((noErr(await M.client.from('campaigns').select('id').eq('id', c.id))).length === 0, 'member reads campaigns')
    await svc.from('campaigns').delete().eq('id', c.id)
  })

}

async function cleanup() {
  const ids = created.users
  try {
    await svc.from('attachments').delete().in('uploaded_by', ids)
    await svc.from('tasks').delete().like('title', `${P}%`)
    await svc.from('decisions').delete().like('title', `${P}%`)
    await svc.from('announcements').delete().like('title', `${P}%`)
    await svc.from('campaigns').delete().like('title', `${P}%`)
    await svc.from('meetings').delete().like('title', `${P}%`)
    await svc.from('messages').delete().like('body', `${P}%`)
    await svc.from('projects').delete().like('name', `${P}%`)
    await svc.from('activity_log').delete().or(`summary.ilike.%${P}%`)
    await svc.from('activity_log').delete().in('actor_id', ids)
    await svc.from('reports').delete().in('author_id', ids)
    for (const id of ids) {
      let r = await svc.auth.admin.deleteUser(id)
      if (r.error) { await svc.from('team_members').delete().eq('id', id); r = await svc.auth.admin.deleteUser(id) }
    }
    // Sweep anything left from this run (or an earlier interrupted one).
    const { data: stray } = await svc.auth.admin.listUsers({ perPage: 200 })
    for (const u of stray.users.filter((x) => /^zz(test|ui)-.*@example\.com$/.test(x.email || ''))) {
      await svc.from('team_members').delete().eq('id', u.id)
      await svc.auth.admin.deleteUser(u.id)
    }
    await svc.from('team_members').delete().like('full_name', `${P}%`)
    if (created.dept) await svc.from('departments').delete().eq('id', created.dept)
    const left = (await svc.from('team_members').select('id').like('full_name', `${P}%`)).data.length
    const leftT = (await svc.from('tasks').select('id').like('title', `${P}%`)).data.length
    console.log(`cleanup done — leftover test members: ${left}, tasks: ${leftT}`)
  } catch (e) { console.log('cleanup error:', e.message) }
}

try { await main() } catch (e) { console.log('SETUP ERROR', e.message) } finally { await cleanup() }
const fails = results.filter((r) => r[0] === 'FAIL')
console.log(`\n${results.length - fails.length}/${results.length} passed`)
fails.forEach((f) => console.log(' -', f[1], '::', f[2]))
