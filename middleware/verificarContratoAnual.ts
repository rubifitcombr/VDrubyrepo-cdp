import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import {
  isAnnualContractGateExemptPath,
  requiresAnnualContractAcceptance,
} from '@/lib/annual-contract-acceptance'

async function fetchOwnerStore(
  db: SupabaseClient,
  userId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('stores')
    .select(
      'id, owner_id, billing_cycle, contrato_inicio_em, contrato_fim_em, contrato_aceite_em, contrato_termos_versao, contrato_documento_hash, status, plano_vence_em'
    )
    .eq('owner_id', userId)
    .maybeSingle()

  if (error || !data) return null
  return data as Record<string, unknown>
}

function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Se o lojista tem contrato anual pendente de aceite, devolve o caminho do gate.
 * Preferir `sessionClient` (cookies do utilizador) — funciona sem service role.
 */
export async function verificarContratoAnualGate(
  userId: string,
  pathname: string,
  sessionClient?: SupabaseClient | null
): Promise<string | null> {
  if (isAnnualContractGateExemptPath(pathname)) return null

  let store: Record<string, unknown> | null = null

  if (sessionClient) {
    store = await fetchOwnerStore(sessionClient, userId)
  }

  if (!store) {
    const svc = serviceRoleClient()
    if (svc) store = await fetchOwnerStore(svc, userId)
  }

  if (!store) return null

  if (requiresAnnualContractAcceptance(store)) {
    return '/dashboard/contrato'
  }

  return null
}
