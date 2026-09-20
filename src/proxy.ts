import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// /api/cron authenticates itself with CRON_SECRET (no user session).
const PUBLIC_PATHS = ['/login', '/api/cron']

export default async function proxy(req: NextRequest) {
  const res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => req.cookies.set(name, value))
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    },
  )

  // Re-verifies the session with Supabase and refreshes the cookie if needed.
  const { data: { user } } = await supabase.auth.getUser()
  const isPublic = PUBLIC_PATHS.some((p) => req.nextUrl.pathname.startsWith(p))

  if (!user && !isPublic) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }
  if (user && req.nextUrl.pathname === '/login') {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }
  return res
}

export const config = {
  // Skip static assets and PWA files so the service worker/manifest load signed-out.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/|.*\\.(?:png|svg|jpg|ico)$).*)'],
}
