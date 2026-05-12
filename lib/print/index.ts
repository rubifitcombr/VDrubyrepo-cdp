import type { StoreOrderRow } from '@/lib/store-order'
import type { StorePrintingState } from '@/lib/store-printing'
import { buildEscPosTicket } from '@/lib/print/escpos'
import { DEFAULT_PAPER_MM, charWidthForPaper, type PaperMm } from '@/lib/print/layout'
import { logPrintJob } from '@/lib/print/logger'
import { toAsciiPreviewLine } from '@/lib/print/sanitize'
import { buildBalcaoReceiptText } from '@/lib/print/templates/balcao'
import { buildCozinhaReceiptText } from '@/lib/print/templates/cozinha'
import { buildDeliveryReceiptText } from '@/lib/print/templates/delivery'

export type OrderTicketVariant = 'delivery' | 'kitchen' | 'balcao'

export function buildOrderTicketEscPos(opts: {
  storeName: string
  order: StoreOrderRow
  orderDisplayRef: string
  printing: Pick<
    StorePrintingState,
    | 'print_include_customer_details'
    | 'print_delivery_copy'
    | 'print_paper_mm'
  >
  paperMm?: PaperMm
  variant?: OrderTicketVariant
}): Uint8Array {
  const paper = opts.paperMm ?? opts.printing.print_paper_mm ?? DEFAULT_PAPER_MM
  logPrintJob({ phase: 'build_start', orderId: opts.order.id })
  let text: string
  if (opts.variant === 'kitchen') {
    text = buildCozinhaReceiptText({
      storeName: opts.storeName,
      order: opts.order,
      orderDisplayRef: opts.orderDisplayRef,
      paperMm: paper,
    })
  } else if (opts.variant === 'balcao') {
    text = buildBalcaoReceiptText({
      storeName: opts.storeName,
      order: opts.order,
      orderDisplayRef: opts.orderDisplayRef,
      printing: opts.printing,
      paperMm: paper,
    })
  } else {
    text = buildDeliveryReceiptText({
      storeName: opts.storeName,
      order: opts.order,
      orderDisplayRef: opts.orderDisplayRef,
      printing: opts.printing,
      paperMm: paper,
    })
  }
  logPrintJob({ phase: 'build_lines', bytesLength: text.length })
  return buildEscPosTicket(text)
}

export function buildAsciiPreviewForPrint(
  opts: Parameters<typeof buildOrderTicketEscPos>[0]
): string {
  const paper = opts.paperMm ?? opts.printing.print_paper_mm ?? DEFAULT_PAPER_MM
  const w = charWidthForPaper(paper)
  let text: string
  if (opts.variant === 'kitchen') {
    text = buildCozinhaReceiptText({
      storeName: opts.storeName,
      order: opts.order,
      orderDisplayRef: opts.orderDisplayRef,
      paperMm: paper,
    })
  } else if (opts.variant === 'balcao') {
    text = buildBalcaoReceiptText({
      storeName: opts.storeName,
      order: opts.order,
      orderDisplayRef: opts.orderDisplayRef,
      printing: opts.printing,
      paperMm: paper,
    })
  } else {
    text = buildDeliveryReceiptText({
      storeName: opts.storeName,
      order: opts.order,
      orderDisplayRef: opts.orderDisplayRef,
      printing: opts.printing,
      paperMm: paper,
    })
  }
  return text
    .split('\n')
    .map((ln) => toAsciiPreviewLine(ln).slice(0, w))
    .join('\n')
}

export { buildEscPosTicket, uint8ToBase64 } from '@/lib/print/escpos'
export type { PaperMm } from '@/lib/print/layout'
