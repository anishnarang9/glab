import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/db/client'

function url(): string {
  const v = process.env.SUPABASE_URL
  if (!v) throw new Error('SUPABASE_URL is not set')
  return v
}

// Service-role client — server-side only. Never expose to the browser.
export function supabaseAdmin(): SupabaseClient<Database> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient<Database>(url(), key, {
    auth: { persistSession: false },
  })
}

// Anon client — safe for browser use.
export function supabaseAnon(): SupabaseClient<Database> {
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) throw new Error('SUPABASE_ANON_KEY is not set')
  return createClient<Database>(url(), key)
}
