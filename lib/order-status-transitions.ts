import {
  isDeliveryPipelineEnabled,
  parseOperationModeFromStore,
} from '@/lib/merchant-operation-mode'

export const ORDER_STATUS_SET = new Set([
  'pending',
  'preparing',
  'ready',
  'confirmed',
  'delivered',
  'cancelled',
])

/** Transições padrão (painel Pedidos / KDS). */
export const ORDER_ALLOWED_NEXT: Record<string, Set<string>> = {
  pending: new Set(['preparing', 'cancelled']),
  preparing: new Set(['ready', 'cancelled']),
  ready: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['delivered', 'cancelled']),
  delivered: new Set(),
  cancelled: new Set(),
}

/** Entrega com endereço (não retirada no balcão / garçom / pickup no site / QR mesa). */
export function isDeliveryFlowOrder(order: {
  source?: string | null
  delivery_address?: string | null
}): boolean {
  const source = (order.source ?? '').trim().toLowerCase()
  if (
    source === 'pdv' ||
    source === 'waiter' ||
    source === 'site_pickup' ||
    source === 'autoatendimento'
  ) {
    return false
  }
  const addr = (order.delivery_address ?? '').trim()
  if (!addr) return false
  if (/^retirada/i.test(addr)) return false
  return true
}

export function isOrderStatusTransitionAllowed(
  current: string,
  newStatus: string,
  order: { source?: string | null; delivery_address?: string | null },
  store?: Record<string, unknown> | null
): boolean {
  if (current === newStatus) return true

  const src = String(order.source ?? '').trim().toLowerCase()
  const pipeline = isDeliveryPipelineEnabled(
    parseOperationModeFromStore(store ?? null)
  )

  if (
    newStatus === 'delivered' &&
    (src === 'waiter' || src === 'autoatendimento') &&
    ['pending', 'preparing', 'ready', 'confirmed'].includes(current)
  ) {
    return true
  }

  if (
    current === 'ready' &&
    newStatus === 'delivered' &&
    (src === 'pdv' ||
      src === 'waiter' ||
      src === 'autoatendimento' ||
      src === 'site_pickup' ||
      !pipeline ||
      !isDeliveryFlowOrder(order))
  ) {
    return true
  }

  const allowed = ORDER_ALLOWED_NEXT[current]
  return Boolean(allowed?.has(newStatus))
}
