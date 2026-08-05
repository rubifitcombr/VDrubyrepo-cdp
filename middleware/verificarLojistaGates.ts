import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isAnnualContractGateExemptPath,
  requiresAnnualContractAcceptance,
} from '@/lib/annual-contract-acceptance'
import { isPlanoVencido } from '@/lib/merchant-access-dates'
import { parseMerchantStatus } from '@/lib/merchant-status'
import {
  requiresSubscriptionLock,
  subscriptionGateExemptPath,
} from '@/lib/subscription-billing-gates'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import { readStoreStatus } from '@/lib/store-columns'
import { fetchOpenSubscriptionInvoice } from '@/services/subscription-billing.server'

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

  // Schema antigo sem merchant_status
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
 * Uma única leitura da loja para: estado activo, plano vencido e contrato anual.
 * Preferir `sessionClient` (cookies); service role só como fallback.
 *
 * Importante: só auto-bloqueia lojas **ativas** com plano vencido.
 * Contas `pendente` (recém-cadastradas) nunca são convertidas em `bloqueado` aqui.
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
    const svc = tryCreateServiceRoleClient()
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
    const svc = tryCreateServiceRoleClient()
    if (id && svc) {
      const patch: Record<string, unknown> = {
        status: 'bloqueado',
        plano_atualizado_em: new Date().toISOString(),
      }
      let { error } = await svc
        .from('stores')
        .update({ ...patch, merchant_status: 'bloqueado' })
        .eq('id', id)
        .eq('status', 'ativo')
      if (error && /merchant_status|column|schema cache/i.test(error.message)) {
        ;({ error } = await svc
          .from('stores')
          .update(patch)
          .eq('id', id)
          .eq('status', 'ativo'))
      }
      void error
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

  const storeId = String(store.id ?? '')
  if (storeId && !subscriptionGateExemptPath(pathname)) {
    const svc = sessionClient ?? tryCreateServiceRoleClient()
    if (svc) {
      try {
        const invoice = await fetchOpenSubscriptionInvoice(svc, storeId)
        if (requiresSubscriptionLock(invoice)) {
          return { ok: false, kind: 'subscription', path: '/dashboard/assinatura' }
        }
      } catch {
        // schema ausente ou erro transitório — não bloquear o painel
      }
    }
  }

  return { ok: true }
}
