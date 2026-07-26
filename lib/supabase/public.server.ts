import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseServerGlobalOptions } from '@/lib/supabase/client-options'

/**
 * Cliente anon puro (sem cookies) para leituras públicas (cardápio, RPC).
 * Escritas de checkout usam service role via createPublicCheckoutDbClient().
 */
export function createPublicAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anon) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórios.'
    )
  }
  return createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...supabaseServerGlobalOptions(),
  })
}
