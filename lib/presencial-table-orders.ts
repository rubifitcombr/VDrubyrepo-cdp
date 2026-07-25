import { orderPaymentRegisteredInCaixa } from '@/lib/cashier-comanda-close'
import {
  isSalonMapOrderSource,
  notesIndicateWaiterReleasedToCaixa,
  parseTableFromNotes,
} from '@/lib/waiter-order-notes'

/** Pedido de mesa (garçom ou QR salão). */
export function isTableSalonOrder(order: {
  source?: string | null
  notes?: string | null
}): boolean {
  if (isSalonMapOrderSource(order.source)) return true
  return Boolean(parseTableFromNotes(order.notes))
}

/** Comanda de mesa ainda sem pagamento registado. */
export function isOpenTableComanda(order: {
  status?: string | null
  source?: string | null
  notes?: string | null
}): boolean {
  const status = String(order.status ?? '').trim().toLowerCase()
  if (status === 'cancelled') return false
  if (!isTableSalonOrder(order)) return false
  return !orderPaymentRegisteredInCaixa(order.notes)
}

const MESA_SERVED_STATUSES = new Set(['confirmed', 'delivered'])

/** Coluna «Na mesa»: comanda de mesa já servida, ainda sem pagamento (não está na cozinha). */
export function isPresencialNaMesaOrder(order: {
  status?: string | null
  source?: string | null
  notes?: string | null
}): boolean {
  if (!isOpenTableComanda(order)) return false
  if (notesIndicateWaiterReleasedToCaixa(order.notes)) return false
  const status = String(order.status ?? '').trim().toLowerCase()
  return MESA_SERVED_STATUSES.has(status)
}

/** Comanda de mesa visível no mapa do Garçom (cozinha ou servida, sem pagamento). */
export function isWaiterSalonOpenOrder(order: {
  status?: string | null
  source?: string | null
  notes?: string | null
}): boolean {
  if (!isOpenTableComanda(order)) return false
  if (notesIndicateWaiterReleasedToCaixa(order.notes)) return false
  const status = String(order.status ?? '').trim().toLowerCase()
  return (
    status === 'pending' ||
    status === 'preparing' ||
    status === 'ready' ||
    MESA_SERVED_STATUSES.has(status)
  )
}

/** Comanda presencial ainda activa (inclui «na mesa» com status entregue). */
export function isPresencialComandaActive(order: {
  status?: string | null
  source?: string | null
  notes?: string | null
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
