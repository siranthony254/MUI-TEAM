import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { GROUPS, parseMandatory } from './groups'

/**
 * Notification kinds this person has switched off in-app (so the centre and the unread badge skip them).
 * Mandatory events are never muted.
 */
export async function mutedKinds(supabase: SupabaseClient, memberId: string): Promise<string[]> {
  const [{ data: prefs }, { data: mandatoryRow }] = await Promise.all([
    supabase.from('notification_prefs').select('event_group, in_app').eq('member_id', memberId).eq('in_app', false),
    supabase.from('org_settings').select('value').eq('key', 'mandatory_groups').maybeSingle(),
  ])
  const mandatory = parseMandatory(mandatoryRow?.value)
  const off = new Set((prefs ?? []).map((p) => p.event_group).filter((g) => !mandatory.includes(g)))
  return GROUPS.filter((g) => off.has(g.id)).flatMap((g) => g.kinds)
}
