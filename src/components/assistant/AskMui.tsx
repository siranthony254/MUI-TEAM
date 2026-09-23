'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircleQuestion, Send, X, ThumbsDown } from 'lucide-react'
import { askAssistant, flagUnanswered } from '@/app/(app)/assistant-actions'
import type { ChatTurn } from '@/lib/assistant/gemini'

interface Msg extends ChatTurn { id: number; error?: boolean; flagged?: boolean }
let seq = 0

const GREETING: Msg = {
  id: -1, role: 'model',
  text: "Hi, I'm Ask MUI. I can explain how things work here, answer questions about your own tasks and department, and help you turn notes into a clean report draft — you'll always paste it in yourself. What do you need?",
}

export function AskMui({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    const mine: Msg = { id: ++seq, role: 'user', text }
    setMessages((m) => [...m, mine])
    setBusy(true)
    try {
      const history = [...messages, mine].filter((m) => m.id !== -1 && !m.error).map((m) => ({ role: m.role, text: m.text }))
      const res = await askAssistant(text, history.slice(0, -1))
      setMessages((m) => [...m, { id: ++seq, role: 'model', text: res.reply ?? res.error ?? 'Something went wrong.', error: !res.reply }])
    } catch {
      setMessages((m) => [...m, { id: ++seq, role: 'model', text: "Couldn't reach the assistant just now — try again in a moment.", error: true }])
    } finally {
      setBusy(false)
    }
  }

  async function notHelpful(id: number) {
    const idx = messages.findIndex((m) => m.id === id)
    const question = [...messages].slice(0, idx).reverse().find((m) => m.role === 'user')?.text
    if (!question) return
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, flagged: true } : x)))
    await flagUnanswered(question).catch(() => {})
  }

  if (!enabled) return null

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close Ask MUI' : 'Open Ask MUI'}
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-[#0D1F35] shadow-lg shadow-amber-900/20 transition-transform duration-150 hover:scale-105 active:scale-95 md:bottom-6"
      >
        {open ? <X size={24} aria-hidden /> : <MessageCircleQuestion size={26} aria-hidden />}
      </button>

      {open && (
        <div className="animate-pop-in fixed bottom-36 right-4 z-30 flex h-[70vh] max-h-[560px] w-[min(380px,92vw)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl md:bottom-24 dark:border-white/10 dark:bg-[#101C2C]">
          <div className="flex items-center justify-between border-b border-neutral-200 bg-[#0D1F35] px-4 py-3 dark:border-white/10">
            <p className="text-sm font-bold text-white">Ask MUI</p>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-white/70 hover:text-white"><X size={18} /></button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-amber-500 text-[#0D1F35]'
                    : m.error
                      ? 'bg-red-50 text-red-800 dark:bg-red-500/15 dark:text-red-300'
                      : 'bg-neutral-100 text-neutral-800 dark:bg-white/10 dark:text-neutral-100'
                }`}>
                  {m.text}
                  {m.role === 'model' && !m.error && m.id !== -1 && (
                    m.flagged ? (
                      <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">Sent to a director — thanks.</p>
                    ) : (
                      <button onClick={() => notHelpful(m.id)} className="mt-1.5 flex items-center gap-1 text-[11px] text-neutral-500 hover:text-amber-700 dark:text-neutral-400">
                        <ThumbsDown size={11} aria-hidden /> Not helpful? Ask a director
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="flex justify-start"><div className="rounded-2xl bg-neutral-100 px-3 py-2 text-sm text-neutral-500 dark:bg-white/10 dark:text-neutral-400">Thinking…</div></div>}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex items-end gap-2 border-t border-neutral-200 p-2 dark:border-white/10">
            <textarea
              value={input} onChange={(e) => setInput(e.target.value)} rows={1} placeholder="Ask anything about MUI or this app…"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              className="max-h-24 flex-1 resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 dark:border-white/15 dark:bg-[#0B1420] dark:text-neutral-100"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-[#0D1F35] disabled:opacity-50">
              <Send size={16} aria-hidden />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
