import { orderPaymentRegisteredInCaixa } from '@/lib/cashier-comanda-close'
import {
  isSalonMapOrderSource,
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

/** Coluna «Na mesa» no painel Presencial: comanda de mesa ainda sem fecho/pagamento. */
export function isPresencialNaMesaOrder(order: {
  status?: string | null
  source?: string | null
  notes?: string | null
}): boolean {
  return isOpenTableComanda(order)
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
  if (isTableSalonOrder(order)) return isOpenTableComanda(order)
  return status !== 'delivered'
}
