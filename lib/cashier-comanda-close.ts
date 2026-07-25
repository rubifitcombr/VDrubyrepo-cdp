import { isPdvWaiterComandaSource } from '@/lib/cashier-pro-delivery-scope'

/** Pagamento registado no caixa / PDV / garçom (comanda financeiramente fechada). */
export function orderPaymentRegisteredInCaixa(
  notes: string | null | undefined
): boolean {
  const text = String(notes ?? '')
  return (
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
