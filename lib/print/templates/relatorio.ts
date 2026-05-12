import { center, separator } from '@/lib/print/formatter'
import type { PaperMm } from '@/lib/print/layout'
import { charWidthForPaper } from '@/lib/print/layout'

/** Resumo textual genérico para relatórios térmicos. */
export function buildRelatorioPlaceholder(titulo: string, linhas: string[], paperMm: PaperMm): string {
  const w = charWidthForPaper(paperMm)
  const line = (ch: string) => separator(ch, w)
  const out: string[] = [line('='), center(titulo.slice(0, w), w), line('='), '']
  for (const l of linhas.slice(0, 40)) {
    out.push(l.slice(0, w))
  }
  out.push('', line('='))
  return out.join('\n')
}
