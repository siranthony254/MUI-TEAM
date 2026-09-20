// Measures how long real signed-in pages take (time to first byte and total), as a system admin and a member.
// Usage: node scripts/perf.mjs [baseUrl] [rounds]   (creates and deletes ZZPERF accounts)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const BASE = process.argv[2] || 'https://mui-team.vercel.app'
const ROUNDS = Number(process.argv[3] || 4)
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

async function mk(key, role) {
  const email = `zzperf-${key}-${stamp}@example.com`
  const password = 'Zz!' + Math.random().toString(36).slice(2) + 'A9'
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  users.push(data.user.id)
  const { error: e } = await svc.from('team_members').upsert({ id: data.user.id, full_name: `ZZPERF ${key}`, email, role, profile_completed_at: new Date().toISOString() })
  if (e) throw e
  const c = createClient(origin, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts)
  const { data: s, error: e2 } = await c.auth.signInWithPassword({ email, password })
  if (e2) throw e2
  const value = 'base64-' + Buffer.from(JSON.stringify(s.session)).toString('base64url')
  const name = `sb-${ref}-auth-token`
  const parts = value.length <= 3180 ? [[name, value]] : value.match(/.{1,3180}/g).map((v, i) => [`${name}.${i}`, v])
  return parts.map(([n, v]) => `${n}=${v}`).join('; ')
}

async function time(path, cookie) {
  const t0 = performance.now()
  const r = await fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: 'manual' })
  const ttfb = performance.now() - t0
  await r.arrayBuffer()
  return { ttfb, total: performance.now() - t0, status: r.status, region: (r.headers.get('x-vercel-id') || '').split('::')[0] }
}
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]

try {
  const admin = await mk('admin', 'super_admin')
  const member = await mk('member', 'member')
  const PAGES = ['/login', '/', '/tasks', '/people', '/projects', '/chat', '/calendar', '/notifications', '/admin']
  console.log(`base ${BASE}   (median of ${ROUNDS} requests, milliseconds)\n`)
  console.log('page'.padEnd(16), 'admin ttfb'.padEnd(12), 'admin total'.padEnd(12), 'member ttfb'.padEnd(12), 'member total')
  let region = ''
  const totals = []
  for (const p of PAGES) {
    const a = [], m = []
    for (let i = 0; i < ROUNDS; i++) {
      const ra = await time(p, p === '/login' ? null : admin); a.push(ra); region = region || ra.region
      const rm = await time(p, p === '/login' ? null : member); m.push(rm)
    }
    const row = [median(a.map((x) => x.ttfb)), median(a.map((x) => x.total)), median(m.map((x) => x.ttfb)), median(m.map((x) => x.total))]
    if (p !== '/login') totals.push(row[0], row[2])
    console.log(p.padEnd(16), ...row.map((n) => String(Math.round(n)).padEnd(12)))
  }
  console.log(`\nserved from Vercel region: ${region || 'local'}`)
  console.log(`average time to first byte across signed-in pages: ${Math.round(totals.reduce((s, n) => s + n, 0) / totals.length)} ms`)
} finally {
  for (const id of users) await svc.auth.admin.deleteUser(id)
  console.log('cleaned up')
}
