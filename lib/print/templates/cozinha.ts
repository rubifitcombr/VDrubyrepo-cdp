import type { StoreOrderRow } from '@/lib/store-order'
import { center, separator, wrapText } from '@/lib/print/formatter'
import type { PaperMm } from '@/lib/print/layout'
import { charWidthForPaper } from '@/lib/print/layout'
import { sanitizePrintText, stringifySafe } from '@/lib/print/sanitize'

/** Cupom simplificado para cozinha / produção. */
export function buildCozinhaReceiptText(opts: {
  storeName: string
  order: StoreOrderRow
  orderDisplayRef: string
  paperMm: PaperMm
}): string {
  const w = charWidthForPaper(opts.paperMm)
  const line = (ch: string) => separator(ch, w)
  const ref = sanitizePrintText(stringifySafe(opts.orderDisplayRef)) || '—'
  const itemsRaw = sanitizePrintText(
    stringifySafe(opts.order.items_summary?.trim() || '—')
  )
  const store = sanitizePrintText(stringifySafe(opts.storeName)).toUpperCase() || 'LOJA'

  const lines: string[] = []
  lines.push(line('='))
  lines.push(center('COZINHA', w))
  lines.push(center(store, w))
  lines.push(line('='))
  lines.push('')
  lines.push(`PEDIDO #${ref}`)
  lines.push('')
  lines.push('!!! ATENCAO !!!')
  lines.push('')
  for (const part of wrapText(itemsRaw, w)) {
    lines.push(part)
  }
  if (opts.order.notes?.trim()) {
    lines.push('')
    lines.push('OBS:')
    lines.push(...wrapText(sanitizePrintText(opts.order.notes.trim()), w))
  }
  lines.push('')
  lines.push(line('='))
  return lines.join('\n')
}
