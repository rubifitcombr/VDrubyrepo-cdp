import { normalizePluCode } from '@/lib/weighable-product'
import {
  parseEan13WeighableBarcode,
  type ParseEan13WeightOpts,
} from '@/lib/scale/ean13-weight'
import { formatPluForBarcode, pluCodesMatch } from '@/lib/scale/plu-match'

/** Calcula dígito verificador EAN-13 a partir dos 12 primeiros dígitos. */
export function computeEan13CheckDigit(twelveDigits: string): number {
  const d = twelveDigits.replace(/\D/g, '')
  if (d.length !== 12) {
    throw new Error('EAN-13 exige 12 dígitos antes do verificador.')
  }
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const n = Number.parseInt(d[i]!, 10)
    if (!Number.isFinite(n)) throw new Error('Dígito inválido.')
    sum += i % 2 === 0 ? n : n * 3
  }
  return (10 - (sum % 10)) % 10
}

/**
 * Gera EAN-13 pesável (layout BR: prefixo + PLU 5d + peso 5d + filler + verificador).
 * Inverso de `parseEan13WeighableBarcode`.
 */
export function buildEan13WeighableBarcode(
  plu: string,
  weightKg: number,
  opts: ParseEan13WeightOpts = {}
): string | null {
  const prefix = String(opts.pluPrefix ?? '2').trim() || '2'
  const plu5 = formatPluForBarcode(plu)
  if (!plu5) return null

  const grams =
    opts.weightDigitsAreGrams === false
      ? Math.round(weightKg * 10000)
      : Math.round(weightKg * 1000)
  if (!Number.isFinite(grams) || grams <= 0 || grams > 99999) return null

  const weight5 = String(grams).padStart(5, '0')
  const body12 = `${prefix}${plu5}${weight5}0`
  const check = computeEan13CheckDigit(body12)
  const full = `${body12}${check}`

  const parsed = parseEan13WeighableBarcode(full, opts)
  if (!parsed) return null
  if (!normalizePluCode(parsed.plu) || !pluCodesMatch(plu, parsed.plu)) return null
  if (Math.abs(parsed.weightKg - grams / (opts.weightDigitsAreGrams === false ? 10000 : 1000)) > 0.002) {
    return null
  }

  return full
}
