import type { StoreOrderRow } from '@/lib/store-order'
import { center, separator, wrapText } from '@/lib/print/formatter'
import { sanitizePrintText, stringifySafe } from '@/lib/print/sanitize'

function paymentMethodLabel(pm: string | null | undefined): string {
  const t = String(pm ?? '').trim().toLowerCase()
  if (t === 'cash') return 'Dinheiro'
  if (t === 'pix') return 'PIX'
  if (t === 'card') return 'Cartão'
  const raw = String(pm ?? '').trim()
  return raw || '—'
}

export function buildEntregadorSectionLines(order: StoreOrderRow, w: number): string[] {
  const line = (ch: string) => separator(ch, w)
  const out: string[] = []
  out.push(line('='))
  out.push(center('2a via — ENTREGADOR', w))
  out.push(line('='))
  out.push('Cliente:')
  out.push(...wrapText(stringifySafe(order.customer_name || '—'), w))
  out.push('Tel:')
  out.push(...wrapText(stringifySafe(order.customer_phone || '—'), w))
  if (order.delivery_address?.trim()) {
    out.push('Endereco:')
    out.push(...wrapText(stringifySafe(order.delivery_address.trim()), w))
  }
  out.push(`Pagamento: ${paymentMethodLabel(order.payment_method)}`)
  if (order.notes?.trim()) {
    out.push('Obs / troco:')
    out.push(...wrapText(sanitizePrintText(order.notes.trim()), w))
  }
  out.push(line('='))
  return out
}
