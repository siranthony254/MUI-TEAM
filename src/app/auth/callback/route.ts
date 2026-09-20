import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Landing point for the password-reset email: turns the one-time code into a session, then continues. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const next = req.nextUrl.searchParams.get('next') ?? '/'
  // Only ever redirect within this app.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(safeNext, req.url))
  }
  return NextResponse.redirect(new URL('/login?error=reset-link', req.url))
}
