/** A thing Ask MUI thinks it should create, always shown to the person to edit and confirm — never created on its own. */
export type Proposal =
  | { type: 'event'; title: string; kind: string; starts_at: string; ends_at?: string | null; description?: string | null; all_day?: boolean }
  | { type: 'task'; title: string; description?: string | null; due_at?: string | null; priority?: string; assignee_name?: string | null }
  | { type: 'decision'; title: string; decision: string; rationale?: string | null }

const OPEN = '<<PROPOSAL>>'
const CLOSE = '<<END>>'

/** Pulls a proposal block out of the model's reply, if it included one, and returns the clean text separately. */
export function extractProposal(raw: string): { text: string; proposal: Proposal | null } {
  const start = raw.indexOf(OPEN)
  const end = raw.indexOf(CLOSE)
  if (start === -1 || end === -1 || end < start) return { text: raw.trim(), proposal: null }

  const text = (raw.slice(0, start) + raw.slice(end + CLOSE.length)).trim()
  const jsonText = raw.slice(start + OPEN.length, end).trim()
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>
    const proposal = validate(parsed)
    return { text, proposal }
  } catch {
    return { text, proposal: null }
  }
}

function validate(p: Record<string, unknown>): Proposal | null {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  if (p.type === 'event') {
    const title = str(p.title)
    const starts_at = str(p.starts_at)
    if (!title || !starts_at) return null
    return {
      type: 'event', title, starts_at,
      kind: str(p.kind) ?? 'event',
      ends_at: str(p.ends_at), description: str(p.description), all_day: p.all_day === true,
    }
  }
  if (p.type === 'task') {
    const title = str(p.title)
    if (!title) return null
    return { type: 'task', title, description: str(p.description), due_at: str(p.due_at), priority: str(p.priority) ?? 'normal', assignee_name: str(p.assignee_name) }
  }
  if (p.type === 'decision') {
    const title = str(p.title)
    const decision = str(p.decision)
    if (!title || !decision) return null
    return { type: 'decision', title, decision, rationale: str(p.rationale) }
  }
  return null
}
