/** Normaliza método de pagamento para agregação no caixa. */
export function normalizeCaixaPayment(
  v: string | null | undefined
): 'cash' | 'pix' | 'card' | 'credit' | null {
  const t = String(v ?? '').trim().toLowerCase()
  if (t === 'cash' || t === 'dinheiro') return 'cash'
  if (t === 'pix') return 'pix'
  if (t === 'card' || t === 'cartao' || t === 'cartão') return 'card'
  if (t === 'credit' || t === 'credito' || t === 'crédito' || t === 'fiado') return 'credit'
  return null
}

export type CaixaPaymentBreakdown = {
  dinheiro: { total: number; count: number }
  pix: { total: number; count: number }
  cartao: { total: number; count: number }
  credito: { total: number; count: number }
  totalGeral: number
  pedidosFechados: number
}

export function emptyBreakdown(): CaixaPaymentBreakdown {
  return {
    dinheiro: { total: 0, count: 0 },
    pix: { total: 0, count: 0 },
    cartao: { total: 0, count: 0 },
    credito: { total: 0, count: 0 },
    totalGeral: 0,
    pedidosFechados: 0,
  }
}

/** Pedidos já fechados no turno (entregues e vinculados ao turno). */
export function aggregateTurnClosedOrders(
  rows: Array<{ total: unknown; payment_method?: string | null }>
): CaixaPaymentBreakdown {
  const out = emptyBreakdown()
  for (const o of rows) {
    const total = Number(o.total) || 0
    const p = normalizeCaixaPayment(o.payment_method ?? null)
    if (!p) continue
    out.pedidosFechados += 1
    out.totalGeral += total
    if (p === 'cash') {
      out.dinheiro.total += total
      out.dinheiro.count += 1
    } else if (p === 'pix') {
      out.pix.total += total
      out.pix.count += 1
    } else if (p === 'card') {
      out.cartao.total += total
      out.cartao.count += 1
    } else {
      out.credito.total += total
      out.credito.count += 1
    }
  }
  return out
}
