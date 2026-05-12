import type { StoreOrderRow } from '@/lib/store-order'
import type { StorePrintingState } from '@/lib/store-printing'
import {
  center,
  leftRight,
  moneyBrl,
  separator,
  wrapText,
} from '@/lib/print/formatter'
import type { PaperMm } from '@/lib/print/layout'
import { charWidthForPaper } from '@/lib/print/layout'
import { sanitizePrintText, stringifySafe } from '@/lib/print/sanitize'
import { buildEntregadorSectionLines } from '@/lib/print/templates/entregador'

function paymentMethodLabel(pm: string | null | undefined): string {
  const t = String(pm ?? '').trim().toLowerCase()
  if (t === 'cash') return 'Dinheiro'
  if (t === 'pix') return 'PIX'
  if (t === 'card') return 'Cartão'
  if (t === 'credit' || t === 'credito' || t === 'crédito') return 'Crédito'
  const raw = String(pm ?? '').trim()
  return raw || '—'
}

function sourceLabel(src: string | null | undefined): string {
  const t = String(src ?? '').trim().toLowerCase()
  if (t === 'waiter') return 'Garçom'
  if (t === 'pdv') return 'Balcão'
  if (t === 'site_pickup') return 'Retirada'
  if (t === 'menu_link' || t === '') return 'Cardápio online'
  return t || '—'
}

function parseNum(v: number | string | null | undefined): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  return 0
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
}): string {
  const w = charWidthForPaper(opts.paperMm)
  const line = (ch: string) => separator(ch, w)
  const store = sanitizePrintText(stringifySafe(opts.storeName)).toUpperCase() || 'LOJA'
  const ref = sanitizePrintText(stringifySafe(opts.orderDisplayRef)) || '—'
  const itemsRaw = sanitizePrintText(
    stringifySafe(opts.order.items_summary?.trim() || '—')
  )
  const total = parseNum(opts.order.total)
  const fee = parseNum(opts.order.delivery_fee)
  const subtotal = fee > 0 ? Math.max(0, total - fee) : total

  const lines: string[] = []
  lines.push(line('='))
  lines.push(center('VYRIA DELIVERY', w))
  lines.push(center(store, w))
  lines.push(line('='))
  lines.push('')
  lines.push(
    leftRight(
      `PEDIDO #${ref}`,
      new Date(opts.order.created_at).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
      w
    )
  )
  lines.push(`${sourceLabel(opts.order.source)}`)
  lines.push('')

  if (opts.printing.print_include_customer_details) {
    lines.push('Cliente:')
    lines.push(...wrapText(stringifySafe(opts.order.customer_name || '—'), w))
    lines.push('Telefone:')
    lines.push(...wrapText(stringifySafe(opts.order.customer_phone || '—'), w))
    if (opts.order.delivery_address?.trim()) {
      lines.push('Endereco:')
      lines.push(...wrapText(stringifySafe(opts.order.delivery_address.trim()), w))
    }
    lines.push('')
  }

  lines.push(line('-'))
  lines.push('ITENS')
  lines.push(line('-'))
  for (const part of wrapText(itemsRaw, w)) {
    lines.push(part)
  }
  lines.push('')

  if (opts.order.notes?.trim()) {
    lines.push('OBS:')
    lines.push(...wrapText(sanitizePrintText(opts.order.notes.trim()), w))
    lines.push('')
  }

  lines.push(line('-'))
  lines.push(leftRight('Subtotal', moneyBrl(subtotal), w))
  if (fee > 0) {
    lines.push(leftRight('Entrega', moneyBrl(fee), w))
  }
  lines.push(leftRight('TOTAL', moneyBrl(total), w))
  lines.push(line('-'))
  lines.push(`Pagamento: ${paymentMethodLabel(opts.order.payment_method)}`)
  lines.push('')
  lines.push(line('='))
  lines.push(center('VYRIA DELIVERY', w))
  lines.push(line('='))

  if (opts.printing.print_delivery_copy) {
    lines.push('')
    lines.push(...buildEntregadorSectionLines(opts.order, w))
  }

  return lines.join('\n')
}
