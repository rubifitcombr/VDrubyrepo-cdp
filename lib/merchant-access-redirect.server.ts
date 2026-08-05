import 'server-only'

import { requiresAnnualContractAcceptance } from '@/lib/annual-contract-acceptance'
import { parseMerchantStatus } from '@/lib/merchant-status'
import { isPlanoVencido } from '@/lib/merchant-access-dates'
import { readStoreStatus } from '@/lib/store-columns'

/**
 * Se o lojista não deve ver o dashboard, devolve o path para /acesso-suspenso.
 * Em `pendente` (ex.: recém-cadastrado) devolve URL com `error=pendente` para a
 * página de aguardar ativação não ser confundida com acesso liberado (`null`).
 */
export function getDashboardAccessRedirectPath(
  store: Record<string, unknown> | null | undefined
): string | null {
  if (!store) return '/acesso-suspenso?error=pendente'

  const status = parseMerchantStatus(readStoreStatus(store))
  if (status !== 'ativo') {
    return `/acesso-suspenso?error=${encodeURIComponent(status)}`
  }

  const vence = store.plano_vence_em
  const raw =
    typeof vence === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(vence.trim())
      ? vence.trim()
      : null
  if (!raw || isPlanoVencido(raw)) {
    return '/acesso-suspenso?error=plano_vencido'
  }

  if (requiresAnnualContractAcceptance(store)) {
    return '/dashboard/contrato'
  }

  return null
}
