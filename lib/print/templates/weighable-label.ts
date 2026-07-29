import { center, separator } from '@/lib/print/formatter'
import type { PaperMm } from '@/lib/print/layout'
import { charWidthForPaper } from '@/lib/print/layout'
import { buildEan13WeighableBarcode } from '@/lib/scale/build-ean13-weighable'
import { formatPricePerKg, formatWeightKg } from '@/lib/weighable-product'
import { encodeEan13EscPosBarcode } from '@/lib/print/escpos-barcode'
import {
  buildEscPosTicket,
  concatBytes,
  encodeCp850,
  ESC_CODEPAGE_PC850,
  ESC_INIT,
  ESC_FEED_CUT,
} from '@/lib/print/escpos'

export type WeighableLabelInput = {
  storeName: string
  productName: string
  plu: string
  pricePerKg: number
  weightKg: number
  pluPrefix?: string
  paperMm?: PaperMm
}

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/** Texto da etiqueta pesável (pré-visualização / fallback). */
export function buildWeighableLabelText(input: WeighableLabelInput): string {
  const paperMm = input.paperMm ?? 58
  const w = charWidthForPaper(paperMm)
  const line = (ch: string) => separator(ch, w)
  const barcode =
    buildEan13WeighableBarcode(input.plu, input.weightKg, {
      pluPrefix: input.pluPrefix ?? '2',
    }) ?? ''

  const lineTotal = Math.round(input.pricePerKg * input.weightKg * 100) / 100
  const rows = [
    line('='),
    center(input.storeName.slice(0, w), w),
    center(input.productName.slice(0, w), w),
    line('-'),
    center(`PLU ${input.plu}`, w),
    center(`${formatWeightKg(input.weightKg)} kg`, w),
    center(`${formatPricePerKg(input.pricePerKg)}/kg`, w),
    center(money.format(lineTotal), w),
    line('-'),
    center(barcode || '—', w),
    line('='),
  ]
  return rows.join('\n')
}

/** ESC/POS completo com código de barras EAN-13. */
export function buildWeighableLabelEscPos(input: WeighableLabelInput): Uint8Array {
  const text = buildWeighableLabelText(input)
  const barcode =
    buildEan13WeighableBarcode(input.plu, input.weightKg, {
      pluPrefix: input.pluPrefix ?? '2',
    }) ?? null

  const bodyText = encodeCp850(text.endsWith('\n') ? text : `${text}\n`)
  const barcodeBytes = barcode ? encodeEan13EscPosBarcode(barcode) : new Uint8Array(0)

  return concatBytes(ESC_INIT, ESC_CODEPAGE_PC850, bodyText, barcodeBytes, ESC_FEED_CUT)
}

/** @deprecated Use `buildWeighableLabelText`. */
export function buildEtiquetaPlaceholder(label: string, paperMm: PaperMm): string {
  return buildWeighableLabelText({
    storeName: 'Vyria',
    productName: label || 'ETIQUETA',
    plu: '00000',
    pricePerKg: 0,
    weightKg: 0,
    paperMm,
  })
}
