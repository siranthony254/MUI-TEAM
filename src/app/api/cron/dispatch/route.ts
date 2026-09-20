import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { runDispatch } from '@/lib/notify/dispatch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Called on a schedule (Supabase pg_cron every 5 min, or Vercel Cron).
 * Generates due-date reminders and delivers pending notifications.
 */
async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, ...(await runDispatch()) })
  } catch (err) {
    console.error('[cron/dispatch]', err)
    return NextResponse.json({ ok: false, error: 'dispatch failed' }, { status: 500 })
  }
}

export const GET = handle // Vercel Cron issues GET
export const POST = handle // pg_net issues POST
