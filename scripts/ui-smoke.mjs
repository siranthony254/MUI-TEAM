// Renders every page as real signed-in users (super admin, executive, member) against a running
// server and reports HTTP status + obvious error markers. Creates ZZUI accounts and deletes them afterwards.
// Usage: node scripts/ui-smoke.mjs [baseUrl]   (default http://localhost:3057; start the app first)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const BASE = process.argv[2] || 'http://localhost:3057'
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }),
)
const origin = new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin
const ref = new URL(origin).host.split('.')[0]
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const svc = createClient(origin, env.SUPABASE_SERVICE_ROLE_KEY, opts)
const stamp = Date.now().toString(36)
const users = []

async function mk(key, role, extra = {}) {
  const email = `zzui-${key}-${stamp}@example.com`
  const password = 'Zz!' + Math.random().toString(36).slice(2) + 'A9'
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  users.push(data.user.id)
  const { error: mErr } = await svc.from('team_members').upsert({ id: data.user.id, full_name: `ZZUI ${key}`, email, role, profile_completed_at: new Date().toISOString(), ...extra })
  if (mErr) throw mErr   // e.g. a real Executive Director already exists, so a second one is refused
  const c = createClient(origin, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts)
  const { data: s, error: e2 } = await c.auth.signInWithPassword({ email, password })
  if (e2) throw e2
  // Same cookie format @supabase/ssr uses: base64url session, split into 3180-char chunks.
  const value = 'base64-' + Buffer.from(JSON.stringify(s.session)).toString('base64url')
  const name = `sb-${ref}-auth-token`
  const parts = value.length <= 3180 ? [[name, value]] : value.match(/.{1,3180}/g).map((v, i) => [`${name}.${i}`, v])
  return { id: data.user.id, cookie: parts.map(([n, v]) => `${n}=${v}`).join('; ') }
}

async function get(path, cookie) {
  const r = await fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: 'manual' })
  const text = r.status < 300 ? await r.text() : ''
  const bad = /<title>[^<]*(Application error|404|Internal Server Error)[^<]*<\/title>/i.test(text)
  return { status: r.status, loc: r.headers.get('location'), bad }
}

const PAGES = process.env.PAGES ? process.env.PAGES.split(',') : [
  '/', '/tasks', '/tasks/new', '/tasks?filter=delegated', '/projects', '/people', '/responsibilities', '/chat',
  '/calendar', '/calendar?scope=team', '/meetings', '/meetings/new', '/decisions', '/reports', '/resources',
  '/activity', '/notifications', '/account', '/more', '/analytics', '/announcements', '/director', '/admin', '/admin/onboarding', '/admin/campaigns', '/admin/settings', '/admin/permissions', '/admin/departments',
  '/departments', '/conversations', '/search?q=test', '/welcome',
]

try {
  const S = await mk('super', 'super_admin', { title: 'System Admin' })
  const X = await mk('exec', 'executive', { title: 'Director' })
  const M = await mk('member', 'member', { title: 'Member' })
  // Only one Executive Director can exist; skip that column if the real one is already set up.
  const G = await mk('director', 'executive', { title: 'Executive Director', is_director: true }).catch(() => null)
  const Gu = await mk('guest', 'guest', { title: 'Guest' }).catch(() => null)
  // A member with only two slices of administration delegated (needs migration 11).
  const Sec = await mk('secretary', 'member', { title: 'Secretary' }).catch(() => null)
  if (Sec) {
    const r = await svc.from('member_grants').insert([
      { member_id: Sec.id, capability: 'admin.people', allowed: true },
      { member_id: Sec.id, capability: 'admin.onboarding', allowed: true },
    ])
    if (r.error) console.log('note: member_grants not available yet:', r.error.message)
  }
  const cols = [S, X, M, ...(G ? [G] : []), ...(Gu ? [Gu] : []), ...(Sec ? [Sec] : [])]
  console.log(`base ${BASE}\n`)
  console.log('page'.padEnd(28), 'sysadmin'.padEnd(14), 'executive'.padEnd(14), 'member'.padEnd(14), 'director'.padEnd(14), 'guest'.padEnd(14), 'secretary')
  let problems = 0
  for (const p of PAGES) {
    const row = []
    for (const u of cols) {
      const r = await get(p, u.cookie)
      const label = r.status >= 300 && r.status < 400 ? `${r.status}→${(r.loc || '').replace(BASE, '') || '?'}` : String(r.status) + (r.bad ? ' ERR' : '')
      if (r.status >= 400 || r.bad) problems++
      row.push(label.padEnd(14))
    }
    console.log(p.padEnd(28), ...row)
  }
  console.log(`\n${problems} problem response(s) (4xx/5xx or error page)`)
} catch (e) {
  console.log('ERROR', e.message)
} finally {
  await svc.from('activity_log').delete().in('actor_id', users)
  for (const id of users) await svc.auth.admin.deleteUser(id)
  console.log('cleaned up test accounts')
}
