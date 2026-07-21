import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente anon puro (sem cookies) para cardápio/checkout público.
 * Respeita RLS — nunca usar service role em /api/public/*.
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
  })
}
