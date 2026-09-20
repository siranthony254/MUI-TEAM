import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseUrl } from '@/lib/supabase/url'
import { fetchWithTimeout } from '@/lib/supabase/fetch'

const url = supabaseUrl()
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

/** Server Components, Route Handlers and Server Actions. */
export async function createClient() {
  const store = await cookies()
  return createServerClient(url, anon, {
    global: { fetch: fetchWithTimeout },
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options))
        } catch {
          // Server Component: cookie writes are refreshed by src/proxy.ts instead.
        }
      },
    },
  })
}
