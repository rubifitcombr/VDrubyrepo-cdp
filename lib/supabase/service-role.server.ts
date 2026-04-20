import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const serviceOpts = {
  auth: { autoRefreshToken: false, persistSession: false },
} as const

function serviceRoleClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, serviceOpts)
}

/**
 * Service role disponível (env). Usar no cardápio público /[slug] para leituras
 * quando RLS não permite `anon` sem cookies (comum em mobile / in-app browsers).
 */
export function tryCreateServiceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  return serviceRoleClient(url, key)
}

/**
 * Cliente com service role — ignora RLS. Usar só em rotas server-to-server (ex.: webhooks),
 * nunca em código que dependa do utilizador autenticado.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_URL são obrigatórios para o webhook WhatsApp.'
    )
  }
  return serviceRoleClient(url, key)
}
