import 'server-only'

import { createClient } from '@supabase/supabase-js'

/**
 * Apenas chave anon, sem cookies — papel `anon` nas políticas RLS.
 * Cardápio público deve usar isto para visitantes e lojistas autenticados
 * verem o mesmo menu (evita 404 só em mobile/incógnito sem sessão).
 */
export function createAnonPublicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórios.'
    )
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
