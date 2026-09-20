import { createBrowserClient } from '@supabase/ssr'
import { supabaseUrl } from '@/lib/supabase/url'

/** Browser client (realtime chat, direct-to-storage uploads with signed tokens). */
export function createClient() {
  return createBrowserClient(
    supabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
