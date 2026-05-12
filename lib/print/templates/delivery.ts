import type { StoreOrderRow } from '@/lib/store-order'
import type { StorePrintingState } from '@/lib/store-printing'
import {
  PRINT_PLACEHOLDER,
  center,
  centerWrappedBlock,
  expandOrderItemLines,
  formatDateTimeAscii,
  leftRight,
  moneyBrl,
  separator,
  wrapText,
} from '@/lib/print/formatter'
import type { PaperMm } from '@/lib/print/layout'
import { charWidthForPaper } from '@/lib/print/layout'
import { paymentMethodLabel, sourceLabel } from '@/lib/print/order-labels'
import { sanitizePrintText, stringifySafe } from '@/lib/print/sanitize'
import { buildEntregadorSectionLines } from '@/lib/print/templates/entregador'

export type OrderReceiptPreset = 'delivery' | 'counter'

function parseNum(v: number | string | null | undefined): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function orderRefSafe(displayRef: string): string {
  const r = sanitizePrintText(stringifySafe(displayRef)).trim()
  return r || PRINT_PLACEHOLDER
}

export function buildDeliveryReceiptText(opts: {
  storeName: string
  order: StoreOrderRow
  orderDisplayRef: string
  printing: Pick<
    StorePrintingState,
    'print_include_customer_details' | 'print_delivery_copy'
  >
  paperMm: PaperMm
  /** Balcão/PDV/garçom: cupom curto, sem branding «delivery». */
  preset?: OrderReceiptPreset
}): string {
  const w = charWidthForPaper(opts.paperMm)
  const thin = () => separator('-', w)
  const preset = opts.preset ?? 'delivery'
  const isCounter = preset === 'counter'

  const store = sanitizePrintText(stringifySafe(opts.storeName)).trim() || 'Estabelecimento'
  const ref = orderRefSafe(opts.orderDisplayRef)
  const itemsRaw = stringifySafe(opts.order.items_summary?.trim())
  const total = parseNum(opts.order.total)
  const fee = parseNum(opts.order.delivery_fee)
  const subtotal = fee > 0 ? Math.max(0, total - fee) : total
  const when = formatDateTimeAscii(opts.order.created_at)
  const src = sourceLabel(opts.order.source)

  const lines: string[] = []

  lines.push(thin())
  lines.push(...centerWrappedBlock(store, w))
  lines.push(thin())
  lines.push(`Pedido #${ref}`)
  lines.push(when)
  lines.push(src)
  lines.push('')

  if (opts.printing.print_include_customer_details) {
    const nm = sanitizePrintText(stringifySafe(opts.order.customer_name)).trim()
    const ph = sanitizePrintText(stringifySafe(opts.order.customer_phone)).trim()
    if (nm || ph || opts.order.delivery_address?.trim()) {
      if (nm) {
        lines.push(leftRight('Cliente', nm, w))
      }
      if (ph) {
        lines.push(leftRight('Telefone', ph, w))
      }
      if (opts.order.delivery_address?.trim()) {
        lines.push('Endereco:')
        lines.push(...wrapText(sanitizePrintText(opts.order.delivery_address.trim()), w))
      }
      lines.push('')
    }
  }

  lines.push(thin())
  lines.push(center('ITENS', w))
  lines.push(thin())
  lines.push(...expandOrderItemLines(itemsRaw, w))
  lines.push('')

  if (opts.order.notes?.trim()) {
    lines.push('Obs:')
    lines.push(...wrapText(sanitizePrintText(opts.order.notes.trim()), w))
    lines.push('')
  }

  lines.push(thin())
  lines.push(leftRight('Subtotal', moneyBrl(subtotal), w))
  if (fee > 0) {
    lines.push(leftRight('Taxa entrega', moneyBrl(fee), w))
  }
  lines.push(leftRight('TOTAL', moneyBrl(total), w))
  lines.push(thin())
  lines.push(leftRight('Pagamento', paymentMethodLabel(opts.order.payment_method), w))
  lines.push('')
  lines.push(thin())
  lines.push(center('Obrigado!', w))
  lines.push(thin())

  if (!isCounter && opts.printing.print_delivery_copy) {
    lines.push('')
    lines.push(...buildEntregadorSectionLines(opts.order, w))
  }

  return lines.join('\n')
}
