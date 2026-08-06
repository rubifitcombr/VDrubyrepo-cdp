import {
  normalizeOrderPaymentMethod,
  type OrderPaymentLine,
} from '@/lib/order-payments'
import { roundMoneyBrl } from '@/lib/money-tolerance'

const CLOSE_NOTE_PATTERNS = [
  /\[Garçom\] Recebido em [^(]+\(([^)]+)\)/i,
  /\[Caixa\] Fechado em [^(]+\(([^)]+)\)/i,
  /\[PDV\] Recebido em [^(]+\(([^)]+)\)/i,
] as const

/**
 * Extrai linhas de pagamento gravadas no parêntese final das notas de fecho
 * (ex.: `card_credit:18.00, card_debit:10.00` ou `pix`).
 */
export function parsePaymentLinesFromCloseNote(
  notes: string | null | undefined,
  orderTotal = 0
): OrderPaymentLine[] {
  const text = String(notes ?? '')
  for (const pattern of CLOSE_NOTE_PATTERNS) {
    const match = text.match(pattern)
    const inner = match?.[1]?.trim()
    if (!inner) continue

    if (inner.includes(':')) {
      const lines: OrderPaymentLine[] = []
      for (const part of inner.split(',')) {
        const colon = part.trim().indexOf(':')
        if (colon < 0) continue
        const methodRaw = part.trim().slice(0, colon)
        const amountRaw = part.trim().slice(colon + 1)
        const method = normalizeOrderPaymentMethod(methodRaw)
        const amount = roundMoneyBrl(Number(String(amountRaw).replace(',', '.')) || 0)
        if (!method || amount <= 0) continue
        lines.push({ method, amount })
      }
      if (lines.length > 0) return lines
      continue
    }

    const method = normalizeOrderPaymentMethod(inner)
    if (!method) continue
    const total = roundMoneyBrl(orderTotal)
    if (total > 0) return [{ method, amount: total }]
  }

  return []
}
