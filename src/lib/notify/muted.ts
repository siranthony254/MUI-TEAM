import 'server-only'
import { GROUPS, channelOn, parseMandatory, type PrefRow } from './groups'
import { getShell } from '@/lib/shell'

/** Kinds this person doesn't want listed in-app (their setting, or the default for that event). Required events never are. */
export function computeMutedKinds(prefs: PrefRow[], mandatoryValue: string | null | undefined): string[] {
  const mandatory = parseMandatory(mandatoryValue)
  return GROUPS.filter((g) => !channelOn(g, 'in_app', prefs, mandatory)).flatMap((g) => g.kinds)
}

/** Same, for the signed-in person, from the shared page data (no extra queries). */
export async function myMutedKinds(): Promise<string[]> {
  const shell = await getShell()
  return shell ? computeMutedKinds(shell.prefs, shell.settings.mandatory_groups) : []
}
