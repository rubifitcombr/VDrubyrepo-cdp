import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'

/**
 * Cliente para operações públicas validadas no servidor.
 * Leituras de cardápio: anon (RLS). Escritas: service role obrigatório em produção.
 */
export function createPublicCheckoutDbClient(
  anon: SupabaseClient
): SupabaseClient {
  const svc = tryCreateServiceRoleClient()
  if (!svc && process.env.NODE_ENV === 'production') {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY é obrigatório para checkout em produção.'
    )
  }
  return svc ?? anon
}
