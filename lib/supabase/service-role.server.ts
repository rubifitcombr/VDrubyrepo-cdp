import 'server-only'
import { createClient } from '@supabase/supabase-js'

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
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
