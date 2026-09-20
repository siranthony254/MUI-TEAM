import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { verifyUser, type AuthUser } from '@/lib/supabase/verify'
import type { PrefRow } from '@/lib/notify/groups'
import type { TeamMember } from '@/lib/types'

export interface Shell {
  user: AuthUser
  member: TeamMember | null
  directed: string[]
  settings: Record<string, string>
  matrix: { level: string; capability: string; allowed: boolean }[]
  grants: { capability: string; allowed: boolean; expires_at: string | null }[]
  prefs: PrefRow[]
  unread: Record<string, number>
  chatUnread: number
}

/**
 * Everything a signed-in page needs to know about the person and their organisation, fetched ONCE per request:
 * the member row, delegated access, permission matrix, settings, notification preferences and unread badges.
 * (A single database function does it in one round trip; if it isn't installed yet, the same data is
 * gathered with parallel queries, which is slower but identical in result.)
 */
export const getShell = cache(async (): Promise<Shell | null> => {
  const supabase = await createClient()
  const { user } = await verifyUser(supabase)
  if (!user) return null

  const { data, error } = await supabase.rpc('shell_data')
  if (!error && data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    return {
      user,
      member: (d.member as TeamMember | null) ?? null,
      directed: (d.directed as string[]) ?? [],
      settings: (d.settings as Record<string, string>) ?? {},
      matrix: (d.matrix as Shell['matrix']) ?? [],
      grants: (d.grants as Shell['grants']) ?? [],
      prefs: (d.prefs as PrefRow[]) ?? [],
      unread: (d.unread as Record<string, number>) ?? {},
      chatUnread: Number(d.chat_unread ?? 0),
    }
  }

  // Fallback: same data, several queries at once.
  const now = new Date().toISOString()
  const [m, dep, set, mat, gr, pr, un, chat] = await Promise.all([
    supabase.from('team_members').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('departments').select('id').eq('director_id', user.id),
    supabase.from('org_settings').select('key, value'),
    supabase.from('role_permissions').select('level, capability, allowed'),
    supabase.from('member_grants').select('capability, allowed, expires_at').eq('member_id', user.id),
    supabase.from('notification_prefs').select('event_group, in_app, email, push, sms').eq('member_id', user.id),
    supabase.from('notifications').select('kind').eq('recipient_id', user.id).is('read_at', null),
    supabase.rpc('chat_unread_counts'),
  ])
  const unread: Record<string, number> = {}
  for (const r of (un.data ?? []) as { kind: string }[]) unread[r.kind] = (unread[r.kind] ?? 0) + 1
  return {
    user,
    member: (m.data as TeamMember | null) ?? null,
    directed: (dep.data ?? []).map((x) => x.id),
    settings: Object.fromEntries((set.data ?? []).map((r) => [r.key, r.value])),
    matrix: mat.data ?? [],
    grants: (gr.data ?? []).filter((g) => !g.expires_at || g.expires_at > now),
    prefs: (pr.data ?? []) as PrefRow[],
    unread,
    chatUnread: ((chat.data ?? []) as { unread: number }[]).reduce((n, c) => n + Number(c.unread), 0),
  }
})
