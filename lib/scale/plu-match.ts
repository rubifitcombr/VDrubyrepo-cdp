import { normalizePluCode } from '@/lib/weighable-product'

/** Compara PLUs com zero à esquerda (etiqueta usa 5 dígitos). */
export function pluCodesMatch(stored: unknown, parsed: unknown): boolean {
  const a = normalizePluCode(stored)
  const b = normalizePluCode(parsed)
  if (!a || !b) return false
  return a.padStart(5, '0') === b.padStart(5, '0')
}

export function formatPluForBarcode(plu: unknown): string | null {
  const normalized = normalizePluCode(plu)
  if (!normalized) return null
  return normalized.padStart(5, '0')
}
