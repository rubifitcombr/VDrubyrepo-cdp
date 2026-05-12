'use client'

import type { StoreOrderRow } from '@/lib/store-order'
import type { StorePrintingState } from '@/lib/store-printing'
import { getPrintSerialBaud } from '@/lib/print/device-prefs'
import {
  buildAsciiPreviewForPrint,
  buildOrderTicketEscPos,
  type OrderTicketVariant,
  type PaperMm,
} from '@/lib/print/index'
import { logPrintJob } from '@/lib/print/logger'
import { openThermalEscPosWindow } from '@/lib/thermal-print-window'

export type OrderTicketPrintOpts = {
  storeName: string
  order: StoreOrderRow
  orderDisplayRef: string
  printing: Pick<
    StorePrintingState,
    'print_include_customer_details' | 'print_delivery_copy' | 'print_paper_mm'
  >
  /** 58mm = 32 colunas; 80mm = 48 colunas. */
  paperMm?: PaperMm
  variant?: OrderTicketVariant
  /** Web Serial: omissão = preferência guardada no browser. */
  serialBaud?: number
}

/**
 * Impressão térmica: gera ESC/POS (CP850), pré-visualização ASCII para o driver
 * de texto do browser e ficheiro .prn para spooler / porta série (Web Serial).
 */
export function openOrderTicketPrint(opts: OrderTicketPrintOpts): boolean {
  if (typeof window === 'undefined') return false

  const paper = opts.paperMm ?? opts.printing.print_paper_mm
  const baud = opts.serialBaud ?? getPrintSerialBaud()

  let bytes: Uint8Array
  let ascii: string
  try {
    bytes = buildOrderTicketEscPos({ ...opts, paperMm: paper })
    ascii = buildAsciiPreviewForPrint({ ...opts, paperMm: paper })
  } catch (e) {
    logPrintJob({
      phase: 'error',
      orderId: opts.order.id,
      detail: e instanceof Error ? e.message : String(e),
    })
    return false
  }

  const safeRef = String(opts.orderDisplayRef || 'ticket').replace(/[^\w.-]+/g, '-')
  const filenameStem = `vyria-pedido-${safeRef}`

  return openThermalEscPosWindow({
    documentTitle: `Vyria — pedido ${safeRef}`,
    safeFilenameStem: filenameStem,
    asciiPreview: ascii,
    escPosBytes: bytes,
    serialBaud: baud,
    logOrderId: opts.order.id,
  })
}

export function orderTicketVariantFromSource(
  source: string | null | undefined
): OrderTicketVariant {
  const s = (source ?? '').trim().toLowerCase()
  if (s === 'pdv' || s === 'waiter') return 'balcao'
  return 'delivery'
}

export function openOrderTicketPrintDeduped(
  orderId: string,
  opts: OrderTicketPrintOpts
): boolean {
  if (typeof window === 'undefined') return false
  const w = window as Window & { __vyriaTicketPrinted?: Set<string> }
  w.__vyriaTicketPrinted ??= new Set()
  if (w.__vyriaTicketPrinted.has(orderId)) return true
  const ok = openOrderTicketPrint(opts)
  if (ok) w.__vyriaTicketPrinted.add(orderId)
  return ok
}
