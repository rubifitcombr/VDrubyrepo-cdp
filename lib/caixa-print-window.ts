'use client'

import type { CaixaPaymentBreakdown } from '@/lib/caixa-payments'
import type { CaixaMovimentacaoDTO, CaixaTurnoDTO } from '@/lib/caixa-types'
import { getPrintSerialBaud } from '@/lib/print/device-prefs'
import { buildEscPosTicket } from '@/lib/print/escpos'
import { charWidthForPaper, type PaperMm } from '@/lib/print/layout'
import { logPrintJob } from '@/lib/print/logger'
import { toAsciiPreviewLine } from '@/lib/print/sanitize'
import { buildCaixaTurnoResumoText } from '@/lib/print/templates/fechamento'
import { openThermalEscPosWindow } from '@/lib/thermal-print-window'

export type CaixaTurnoPrintOpts = {
  storeName: string
  paperMm?: PaperMm
  turno: CaixaTurnoDTO
  breakdown: CaixaPaymentBreakdown
  movimentacoes: CaixaMovimentacaoDTO[]
  serialBaud?: number
}

export function openCaixaTurnoEscPosPrint(opts: CaixaTurnoPrintOpts): boolean {
  if (typeof window === 'undefined') return false

  const paper = opts.paperMm ?? 80
  const baud = opts.serialBaud ?? getPrintSerialBaud()

  let text: string
  let bytes: Uint8Array
  try {
    text = buildCaixaTurnoResumoText({
      storeName: opts.storeName,
      paperMm: paper,
      turno: opts.turno,
      breakdown: opts.breakdown,
      movimentacoes: opts.movimentacoes,
    })
    bytes = buildEscPosTicket(text)
  } catch (e) {
    logPrintJob({
      phase: 'error',
      orderId: opts.turno.id,
      detail: e instanceof Error ? e.message : String(e),
    })
    return false
  }

  const w = charWidthForPaper(paper)
  const ascii = text
    .split('\n')
    .map((ln) => toAsciiPreviewLine(ln).slice(0, w))
    .join('\n')

  const safeStem = `vyria-caixa-${String(opts.turno.id).replace(/[^\w.-]+/g, '-').slice(0, 36)}`

  const r = openThermalEscPosWindow({
    documentTitle: `Vyria — caixa ${safeStem}`,
    safeFilenameStem: safeStem,
    asciiPreview: ascii,
    escPosBytes: bytes,
    serialBaud: baud,
    logOrderId: opts.turno.id,
    paperMm: paper,
  })
  return r !== 'failed'
}
