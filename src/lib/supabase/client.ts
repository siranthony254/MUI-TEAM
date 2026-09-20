import { createBrowserClient } from '@supabase/ssr'

/** Browser client (realtime chat, direct-to-storage uploads with signed tokens). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
