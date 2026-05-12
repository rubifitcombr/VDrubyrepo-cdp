import type { StoreOrderRow } from '@/lib/store-order'
import { buildDeliveryReceiptText } from '@/lib/print/templates/delivery'
import type { StorePrintingState } from '@/lib/store-printing'
import { center, separator } from '@/lib/print/formatter'
import type { PaperMm } from '@/lib/print/layout'
import { charWidthForPaper } from '@/lib/print/layout'

/** Comanda balcão / PDV — título centrado + mesmo layout base que entrega. */
export function buildBalcaoReceiptText(opts: {
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
  const head = [line('='), center('BALCAO / PDV', w), line('='), ''].join('\n')
  return `${head}${buildDeliveryReceiptText(opts)}`
}
