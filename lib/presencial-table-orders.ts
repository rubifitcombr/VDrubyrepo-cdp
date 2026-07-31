import { orderPaymentRegisteredInCaixa } from '@/lib/cashier-comanda-close'
import {
  isSalonMapOrderSource,
  notesIndicateWaiterReleasedToCaixa,
  orderMapsToConfiguredSalonTable,
  parseTableFromOrder,
  type SalonMapTableRef,
} from '@/lib/waiter-order-notes'

export type { SalonMapTableRef }

/** Pedido de mesa (garçom ou QR salão) com mesa identificável. */
export function isTableSalonOrder(order: {
  status?: string | null
  source?: string | null
  notes?: string | null
  delivery_address?: string | null
}): boolean {
  if (!isSalonMapOrderSource(order.source)) return false
  return Boolean(parseTableFromOrder(order))
}

/** Comanda de mesa ainda sem pagamento registado. */
export function isOpenTableComanda(order: {
  status?: string | null
  source?: string | null
  notes?: string | null
  delivery_address?: string | null
  caixa_turno_id?: string | null
}): boolean {
  const status = String(order.status ?? '').trim().toLowerCase()
  if (status === 'cancelled') return false
  if (!isTableSalonOrder(order)) return false
  if (String(order.caixa_turno_id ?? '').trim()) return false
  if (notesIndicateWaiterReleasedToCaixa(order.notes)) return false
  return !orderPaymentRegisteredInCaixa(order.notes)
}

const MESA_SERVED_STATUSES = new Set(['confirmed', 'delivered'])

function mapsToSalonLayout(
  order: {
    notes?: string | null
    source?: string | null
    delivery_address?: string | null
  },
  configuredTables?: SalonMapTableRef[]
): boolean {
  return orderMapsToConfiguredSalonTable(order, configuredTables ?? [])
}

/** Coluna «Na mesa»: comanda servida na mesa do mapa, ainda sem pagamento. */
export function isPresencialNaMesaOrder(
  order: {
    status?: string | null
    source?: string | null
    notes?: string | null
    delivery_address?: string | null
    caixa_turno_id?: string | null
  },
  configuredTables?: SalonMapTableRef[]
): boolean {
  if (!isOpenTableComanda(order)) return false
  if (!mapsToSalonLayout(order, configuredTables)) return false
  const status = String(order.status ?? '').trim().toLowerCase()
  return MESA_SERVED_STATUSES.has(status)
}

/** Comanda de mesa visível no mapa do Garçom (cozinha ou servida na mesa, sem pagamento). */
export function isWaiterSalonOpenOrder(
  order: {
    status?: string | null
    source?: string | null
    notes?: string | null
    delivery_address?: string | null
    caixa_turno_id?: string | null
  },
  configuredTables?: SalonMapTableRef[]
): boolean {
  if (!isOpenTableComanda(order)) return false
  if (!mapsToSalonLayout(order, configuredTables)) return false
  const status = String(order.status ?? '').trim().toLowerCase()
  // «delivered» = comanda encerrada operacionalmente; pagamento fica no Caixa.
  return (
    status === 'pending' ||
    status === 'preparing' ||
    status === 'ready' ||
    status === 'confirmed'
  )
}

const PEDIDOS_CANCEL_STATUSES = new Set([
  'pending',
  'preparing',
  'ready',
  'confirmed',
])

/** Comanda/pedido que pode ser cancelado no painel Pedidos. */
export function canCancelOrderFromPedidos(order: {
  status?: string | null
  source?: string | null
  notes?: string | null
  delivery_address?: string | null
}): boolean {
  const status = String(order.status ?? '').trim().toLowerCase()
  if (status === 'cancelled') return false
  if (orderPaymentRegisteredInCaixa(order.notes)) return false
  if (isPresencialComandaActive(order)) return true
  return PEDIDOS_CANCEL_STATUSES.has(status)
}

/** Comanda presencial ainda activa (inclui «na mesa» com status entregue). */
export function isPresencialComandaActive(order: {
  status?: string | null
  source?: string | null
  notes?: string | null
  delivery_address?: string | null
}): boolean {
  const source = String(order.source ?? '').trim().toLowerCase()
  const isPresencialSource =
    source === 'pdv' || source === 'waiter' || source === 'autoatendimento'
  if (!isPresencialSource) return false
  const status = String(order.status ?? '').trim().toLowerCase()
  if (status === 'cancelled') return false
  if (isTableSalonOrder(order)) {
    if (!isOpenTableComanda(order)) return false
    return !notesIndicateWaiterReleasedToCaixa(order.notes)
  }
  return status !== 'delivered'
}
