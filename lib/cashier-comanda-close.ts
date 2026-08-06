import { isPdvWaiterComandaSource } from '@/lib/cashier-pro-delivery-scope'

/** Marcador gravado em `orders.notes` ao fechar comanda no caixa (idempotência). */
export const CAIXA_PAYMENT_CLOSE_MARKER = '[Caixa] Fechado em '

/** Pagamento registado no caixa / PDV / garçom (comanda financeiramente fechada). */
export function orderPaymentRegisteredInCaixa(
  notes: string | null | undefined
): boolean {
  const text = String(notes ?? '')
  return (
    text.includes(CAIXA_PAYMENT_CLOSE_MARKER) ||
    /\[Caixa\] Fechado em /i.test(text) ||
    /\[PDV\] Recebido em /i.test(text) ||
    /\[Garçom\] Recebido em /i.test(text)
  )
}

export function isOpenCaixaComanda(order: {
  status?: string | null
  source?: string | null
  notes?: string | null
}): boolean {
  if (String(order.status ?? '').trim().toLowerCase() === 'cancelled') {
    return false
  }
  if (!isPdvWaiterComandaSource(order.source)) return false
  return !orderPaymentRegisteredInCaixa(order.notes)
}

/** Comanda com pagamento registado (marcador nas notas ou vínculo ao turno de caixa). */
export function isFinanciallyClosedOrder(order: {
  status?: string | null
  notes?: string | null
  caixa_turno_id?: string | null
}): boolean {
  const status = String(order.status ?? '').trim().toLowerCase()
  if (status === 'cancelled') return false
  if (orderPaymentRegisteredInCaixa(order.notes)) return true
  return Boolean(String(order.caixa_turno_id ?? '').trim())
}

/** Pedido já pago no turno de caixa (alinha UI com fecho do turno no servidor). */
export function isPaidInCaixaTurno(order: {
  status?: string | null
  notes?: string | null
  caixa_turno_id?: string | null
}): boolean {
  return isFinanciallyClosedOrder(order)
}
