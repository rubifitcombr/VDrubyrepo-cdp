import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isAnnualContractGateExemptPath,
  requiresAnnualContractAcceptance,
} from '@/lib/annual-contract-gates'
import { isPlanoVencido } from '@/lib/merchant-access-dates'
import { parseMerchantStatus } from '@/lib/merchant-status'
import { readStoreStatus } from '@/lib/store-columns'
import {
  requiresSubscriptionLock,
  subscriptionGateExemptPath,
} from '@/lib/subscription-billing-gates'

export type LojistaGateResult =
  | { ok: true }
  | { ok: false; kind: 'redirect'; path: string }
  | { ok: false; kind: 'contract'; path: '/dashboard/contrato' }
  | { ok: false; kind: 'subscription'; path: '/dashboard/assinatura' }

const STORE_GATE_SELECT =
  'id, status, merchant_status, plano_vence_em, billing_cycle, contrato_aceite_em, contrato_termos_versao, contrato_documento_hash'

async function fetchGateStore(
  db: SupabaseClient,
  userId: string
): Promise<Record<string, unknown> | null> {
  const primary = await db
    .from('stores')
    .select(STORE_GATE_SELECT)
    .eq('owner_id', userId)
    .maybeSingle()

  if (!primary.error && primary.data) {
    return primary.data as Record<string, unknown>
  }

  if (primary.error && /merchant_status|column|schema cache/i.test(primary.error.message)) {
    const fallback = await db
      .from('stores')
      .select(
        'id, status, plano_vence_em, billing_cycle, contrato_aceite_em, contrato_termos_versao, contrato_documento_hash'
      )
      .eq('owner_id', userId)
      .maybeSingle()
    if (!fallback.error && fallback.data) {
      return fallback.data as Record<string, unknown>
    }
  }

  return null
}

/**
 * Gates do lojista para o proxy (Edge): usa só o cliente de sessão.
 * Auto-bloqueio por plano vencido fica nas rotas server/API.
 */
export async function verificarLojistaGatesEdge(
  userId: string,
  pathname: string,
  sessionClient: SupabaseClient
): Promise<LojistaGateResult> {
  const store = await fetchGateStore(sessionClient, userId)

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

  const storeId = String(store.id ?? '')
  if (storeId && !subscriptionGateExemptPath(pathname)) {
    try {
      const { data } = await sessionClient
        .from('subscription_invoices')
        .select('status, due_date')
        .eq('store_id', storeId)
        .eq('status', 'pending')
        .order('reference_month', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data && requiresSubscriptionLock(data as { status: string; due_date: string })) {
        return { ok: false, kind: 'subscription', path: '/dashboard/assinatura' }
      }
    } catch {
      // tabela ausente — ignorar
    }
  }

  return { ok: true }
}
