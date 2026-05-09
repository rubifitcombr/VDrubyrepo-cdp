import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const serviceOpts = {
  auth: { autoRefreshToken: false, persistSession: false },
} as const

function readEnv(...keys: string[]): string | null {
  for (const k of keys) {
    const v = process.env[k]?.trim()
    if (v) return v
  }
  return null
}

function serviceRoleClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, serviceOpts)
}

function serviceRoleUrl(): string | null {
  return readEnv('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL')
}

function serviceRoleKey(): string | null {
  return readEnv(
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_SERVICE_ROLE'
  )
}

/**
 * Service role disponível (env). Usar no cardápio público /[slug] para leituras
 * quando RLS não permite `anon` sem cookies (comum em mobile / in-app browsers).
 */
export function tryCreateServiceRoleClient(): SupabaseClient | null {
  const url = serviceRoleUrl()
  const key = serviceRoleKey()
  if (!url || !key) return null
  return serviceRoleClient(url, key)
}

/**
 * Cliente com service role — ignora RLS. Usar só em rotas server-to-server (ex.: webhooks),
 * nunca em código que dependa do utilizador autenticado.
 */
export function createServiceRoleClient() {
  const url = serviceRoleUrl()
  const key = serviceRoleKey()
  if (!url || !key) {
    throw new Error(
      'Define NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SERVICE_KEY) no servidor.'
    )
  }
  return serviceRoleClient(url, key)
}
