import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import {
  isAnnualContractGateExemptPath,
  requiresAnnualContractAcceptance,
} from '@/lib/annual-contract-acceptance'
import { isPlanoVencido } from '@/lib/merchant-access-dates'
import { parseMerchantStatus } from '@/lib/merchant-status'
import { readStoreStatus } from '@/lib/store-columns'

export type LojistaGateResult =
  | { ok: true }
  | { ok: false; kind: 'redirect'; path: string }
  | { ok: false; kind: 'contract'; path: '/dashboard/contrato' }

const STORE_GATE_SELECT =
  'id, status, plano_vence_em, billing_cycle, contrato_aceite_em, contrato_termos_versao, contrato_documento_hash'

function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function fetchGateStore(
  db: SupabaseClient,
  userId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('stores')
    .select(STORE_GATE_SELECT)
    .eq('owner_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return data as Record<string, unknown>
}

/**
 * Uma única leitura da loja para: estado activo, plano vencido e contrato anual.
 * Preferir `sessionClient` (cookies); service role só como fallback.
 */
export async function verificarLojistaGates(
  userId: string,
  pathname: string,
  sessionClient?: SupabaseClient | null
): Promise<LojistaGateResult> {
  let store: Record<string, unknown> | null = null

  if (sessionClient) {
    store = await fetchGateStore(sessionClient, userId)
  }
  if (!store) {
    const svc = serviceRoleClient()
    if (svc) store = await fetchGateStore(svc, userId)
  }

  if (!store) {
    return { ok: false, kind: 'redirect', path: '/acesso-suspenso?error=pendente' }
  }

  const status = parseMerchantStatus(readStoreStatus(store))
  if (status !== 'ativo') {
    return {
      ok: false,
      kind: 'redirect',
      path: `/acesso-suspenso?error=${encodeURIComponent(status)}`,
    }
  }

  const rawVence = store.plano_vence_em
  const vence =
    typeof rawVence === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawVence.trim())
      ? rawVence.trim()
      : null

  if (!vence || isPlanoVencido(vence)) {
    const id = String(store.id ?? '')
    const svc = serviceRoleClient()
    if (id && svc) {
      await svc
        .from('stores')
        .update({
          status: 'bloqueado',
          plano_atualizado_em: new Date().toISOString(),
        })
        .eq('id', id)
    }
    return {
      ok: false,
      kind: 'redirect',
      path: '/acesso-suspenso?error=plano_vencido',
    }
  }

  if (
    !isAnnualContractGateExemptPath(pathname) &&
    requiresAnnualContractAcceptance(store)
  ) {
    return { ok: false, kind: 'contract', path: '/dashboard/contrato' }
  }

  return { ok: true }
}
