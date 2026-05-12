import type { StoreOrderRow } from '@/lib/store-order'
import { buildDeliveryReceiptText } from '@/lib/print/templates/delivery'
import type { StorePrintingState } from '@/lib/store-printing'
import type { PaperMm } from '@/lib/print/layout'

/** Comanda balcão / PDV / garçom — layout compacto (sem branding delivery). */
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
  return buildDeliveryReceiptText({ ...opts, preset: 'counter' })
}
