import { moneyWithinTolerance, roundMoneyBrl } from '@/lib/money-tolerance'

export type OrderPaymentMethod =
  | 'cash'
  | 'pix'
  | 'card'
  | 'card_credit'
  | 'card_debit'

export type OrderPaymentLine = {
  method: OrderPaymentMethod
  amount: number
}

export type OrderPaymentRow = {
  id: string
  order_id: string
  payment_method: string
  amount_brl: number
  caixa_turno_id?: string | null
}

export function normalizeOrderPaymentMethod(v: unknown): OrderPaymentMethod | null {
  const t = String(v ?? '').trim().toLowerCase()
  if (
    t === 'cash' ||
    t === 'pix' ||
    t === 'card' ||
    t === 'card_credit' ||
    t === 'card_debit'
  ) {
    return t
  }
  return null
}

export function orderPaymentMethodLabel(method: OrderPaymentMethod): string {
  if (method === 'cash') return 'Dinheiro'
  if (method === 'pix') return 'PIX'
  if (method === 'card_credit') return 'Crédito'
  if (method === 'card_debit') return 'Débito'
  return 'Cartão'
}

export function parseOrderPaymentLines(raw: unknown): OrderPaymentLine[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const lines: OrderPaymentLine[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const method = normalizeOrderPaymentMethod(
      (item as { method?: unknown; paymentMethod?: unknown }).method ??
        (item as { paymentMethod?: unknown }).paymentMethod
    )
    const amount = roundMoneyBrl(
      Number(
        (item as { amount?: unknown; amount_brl?: unknown }).amount ??
          (item as { amount_brl?: unknown }).amount_brl
      ) || 0
    )
    if (!method || amount <= 0) return null
    lines.push({ method, amount })
  }
  return lines.length > 0 ? lines : null
}

export function sumPaymentLines(lines: OrderPaymentLine[]): number {
  return roundMoneyBrl(lines.reduce((s, l) => s + l.amount, 0))
}

/** Retorna mensagem de erro ou null se válido. */
export function validatePaymentLines(
  orderTotal: number,
  lines: OrderPaymentLine[]
): string | null {
  const total = roundMoneyBrl(orderTotal)
  if (total <= 0) return 'Total da comanda inválido.'
  if (lines.length === 0) return 'Informe ao menos uma forma de pagamento.'
  const paid = sumPaymentLines(lines)
  if (!moneyWithinTolerance(paid, total)) {
    return `A soma dos pagamentos (${paid.toFixed(2)}) deve ser igual ao total (${total.toFixed(2)}).`
  }
  return null
}

export function comandaDisplayName(
  customerName: string | null | undefined,
  fallback = 'Comanda'
): string {
  const n = String(customerName ?? '').trim()
  return n || fallback
}
