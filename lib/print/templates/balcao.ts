import type { StoreOrderRow } from '@/lib/store-order'
import { buildDeliveryReceiptText } from '@/lib/print/templates/delivery'
import type { StorePrintingState } from '@/lib/store-printing'
import type { PaperMm } from '@/lib/print/layout'

/** Comanda balcão / PDV — mesmo layout base que entrega, com título explícito. */
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
  const base = buildDeliveryReceiptText(opts)
  return `*** BALCAO / PDV ***\n\n${base}`
}
