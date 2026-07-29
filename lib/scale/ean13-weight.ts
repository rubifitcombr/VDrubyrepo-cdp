import type { ParsedWeighableBarcode } from '@/lib/scale/types'

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

/** Valida dígito verificador EAN-13. */
export function isValidEan13CheckDigit(barcode: string): boolean {
  const d = digitsOnly(barcode)
  if (d.length !== 13) return false
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const n = Number.parseInt(d[i]!, 10)
    if (!Number.isFinite(n)) return false
    sum += i % 2 === 0 ? n : n * 3
  }
  const check = (10 - (sum % 10)) % 10
  return check === Number.parseInt(d[12]!, 10)
}

export type ParseEan13WeightOpts = {
  /** Prefixo EAN para pesáveis (padrão BR: 2). */
  pluPrefix?: string
  /** 5 dígitos de peso = gramas (padrão MGV/Filizola). */
  weightDigitsAreGrams?: boolean
}

/**
 * Extrai PLU e peso de etiqueta EAN-13 pesável (formato varejo BR).
 * Layout: `2 PPPPP WWWWW C` — prefixo 2, PLU 5 dígitos, peso 5 dígitos, verificador.
 */
export function parseEan13WeighableBarcode(
  raw: string,
  opts: ParseEan13WeightOpts = {}
): ParsedWeighableBarcode | null {
  const barcode = digitsOnly(raw)
  if (barcode.length !== 13) return null
  if (!isValidEan13CheckDigit(barcode)) return null

  const prefix = String(opts.pluPrefix ?? '2').trim() || '2'
  if (!barcode.startsWith(prefix)) return null

  const plu = barcode.slice(1, 6)
  const weightDigits = barcode.slice(6, 11)
  const weightRaw = Number.parseInt(weightDigits, 10)
  if (!Number.isFinite(weightRaw) || weightRaw <= 0) return null

  const weightKg = opts.weightDigitsAreGrams === false
    ? weightRaw / 10000
    : weightRaw / 1000

  if (weightKg <= 0) return null

  return { plu, weightKg, barcode }
}
