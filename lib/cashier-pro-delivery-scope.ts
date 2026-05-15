import type { Plan } from '@/lib/plan'
import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'

/** Pro em modo só delivery: caixa alinhado a pedidos do site (slug/QR) e corridas de entregadores — sem PDV/garçom. */
export function caixaProDeliveryOnlyScope(
  plan: Plan,
  operationMode: MerchantOperationMode | null
): boolean {
  return plan === 'PRO' && operationMode === 'delivery'
}

const PDV_WAITER_SOURCES = new Set(['pdv', 'waiter', 'autoatendimento'])

export function isPdvWaiterComandaSource(source: string | null | undefined): boolean {
  return PDV_WAITER_SOURCES.has(String(source ?? '').trim().toLowerCase())
}
