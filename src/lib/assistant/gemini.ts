import 'server-only'

const MODEL = 'gemini-3.6-flash'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

export const assistantEnabled = () => !!process.env.GEMINI_API_KEY

export interface ChatTurn { role: 'user' | 'model'; text: string }

/** One request/response turn with Gemini. Plain REST call — no SDK, matching how this app talks to Resend/Africa's Talking. */
export async function askGemini(systemPrompt: string, history: ChatTurn[]): Promise<string> {
  if (!process.env.GEMINI_API_KEY) throw new Error('The assistant is not set up yet (no API key).')

  const res = await fetch(`${ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`)
  }
  const json = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
    promptFeedback?: { blockReason?: string }
  }
  if (json.promptFeedback?.blockReason) return "I can't help with that one — try rephrasing, or ask a director directly."
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  return text.trim() || "I didn't quite get an answer together for that — try asking it a different way."
}
