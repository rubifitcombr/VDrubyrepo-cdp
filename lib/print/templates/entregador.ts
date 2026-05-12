import type { StoreOrderRow } from '@/lib/store-order'
import { PRINT_PLACEHOLDER, center, leftRight, separator, wrapText } from '@/lib/print/formatter'
import { paymentMethodLabel } from '@/lib/print/order-labels'
import { sanitizePrintText, stringifySafe } from '@/lib/print/sanitize'

export function buildEntregadorSectionLines(order: StoreOrderRow, w: number): string[] {
  const line = (ch: string) => separator(ch, w)
  const out: string[] = []
  out.push(line('='))
  out.push(center('2a via - ENTREGADOR', w))
  out.push(line('='))
  out.push('Cliente:')
  out.push(
    ...wrapText(
      sanitizePrintText(stringifySafe(order.customer_name)).trim() ||
        PRINT_PLACEHOLDER,
      w
    )
  )
  out.push('Tel:')
  out.push(
    ...wrapText(
      sanitizePrintText(stringifySafe(order.customer_phone)).trim() ||
        PRINT_PLACEHOLDER,
      w
    )
  )
  if (order.delivery_address?.trim()) {
    out.push('Endereco:')
    out.push(...wrapText(sanitizePrintText(order.delivery_address.trim()), w))
  }
  out.push(leftRight('Pagamento', paymentMethodLabel(order.payment_method), w))
  if (order.notes?.trim()) {
    out.push('Obs / troco:')
    out.push(...wrapText(sanitizePrintText(order.notes.trim()), w))
  }
  out.push(line('='))
  return out
}
