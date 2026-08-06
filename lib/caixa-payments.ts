/** Normaliza método de pagamento para agregação no caixa. */
export function normalizeCaixaPayment(
  v: string | null | undefined
): 'cash' | 'pix' | 'card' | 'credit' | null {
  const t = String(v ?? '').trim().toLowerCase()
  if (t === 'cash' || t === 'dinheiro') return 'cash'
  if (t === 'pix') return 'pix'
  if (t === 'card' || t === 'cartao' || t === 'cartão') return 'card'
  if (t === 'card_credit' || t === 'card_debit') return 'card'
  if (t === 'credit' || t === 'credito' || t === 'crédito' || t === 'fiado') return 'credit'
  if (t === 'split') return null
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

type SplitPaymentRow = {
  order_id: string
  payment_method: string
  amount_brl: number
}

function addToBreakdown(
  out: CaixaPaymentBreakdown,
  amount: number,
  methodRaw: string | null | undefined
) {
  const p = normalizeCaixaPayment(methodRaw ?? null)
  if (!p || amount <= 0) return
  out.totalGeral += amount
  if (p === 'cash') {
    out.dinheiro.total += amount
    out.dinheiro.count += 1
  } else if (p === 'pix') {
    out.pix.total += amount
    out.pix.count += 1
  } else if (p === 'card') {
    out.cartao.total += amount
    out.cartao.count += 1
  } else {
    out.credito.total += amount
    out.credito.count += 1
  }
}

/** Pedidos já fechados no turno (entregues e vinculados ao turno). */
export function aggregateTurnClosedOrders(
  rows: Array<{ id?: string; total: unknown; payment_method?: string | null }>,
  splitPayments: SplitPaymentRow[] = []
): CaixaPaymentBreakdown {
  const out = emptyBreakdown()
  const splitsByOrder = new Map<string, SplitPaymentRow[]>()
  for (const sp of splitPayments) {
    const list = splitsByOrder.get(sp.order_id) ?? []
    list.push(sp)
    splitsByOrder.set(sp.order_id, list)
  }

  for (const o of rows) {
    const orderId = o.id ? String(o.id) : ''
    const method = String(o.payment_method ?? '').trim().toLowerCase()
    const splits = orderId ? splitsByOrder.get(orderId) : undefined

    if (method === 'split' && splits && splits.length > 0) {
      out.pedidosFechados += 1
      for (const sp of splits) {
        addToBreakdown(out, Number(sp.amount_brl) || 0, sp.payment_method)
      }
      continue
    }

    if (method === 'split') {
      // Split sem linhas em order_payments (sync atrasado ou legado): usa total da comanda.
      const total = Number(o.total) || 0
      if (total > 0) {
        out.pedidosFechados += 1
        addToBreakdown(out, total, 'cash')
      }
      continue
    }

    const total = Number(o.total) || 0
    const p = normalizeCaixaPayment(o.payment_method ?? null)
    if (!p) continue
    out.pedidosFechados += 1
    addToBreakdown(out, total, o.payment_method ?? null)
  }
  return out
}
