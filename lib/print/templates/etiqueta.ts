import { center, separator } from '@/lib/print/formatter'
import type { PaperMm } from '@/lib/print/layout'
import { charWidthForPaper } from '@/lib/print/layout'

/** Etiqueta / etiqueta simples — expandir com SKU, peso, etc. */
export function buildEtiquetaPlaceholder(label: string, paperMm: PaperMm): string {
  const w = charWidthForPaper(paperMm)
  const line = (ch: string) => separator(ch, w)
  return [line('='), center(String(label || 'ETIQUETA').slice(0, w), w), line('=')].join('\n')
}
