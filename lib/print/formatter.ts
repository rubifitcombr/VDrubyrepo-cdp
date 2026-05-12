import { sanitizePrintText, stringifySafe } from '@/lib/print/sanitize'

const moneyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function moneyBrl(n: number): string {
  if (!Number.isFinite(n)) return moneyFmt.format(0)
  return moneyFmt.format(Math.round(n * 100) / 100)
}

export function truncate(s: string, maxLen: number): string {
  const t = stringifySafe(s)
  if (t.length <= maxLen) return t
  if (maxLen <= 1) return '…'
  return `${t.slice(0, maxLen - 1)}…`
}

/** Linha só com `ch` repetido até `width`. */
export function separator(ch: string, width: number): string {
  const c = (ch || '-').slice(0, 1) || '-'
  return c.repeat(Math.max(1, width))
}

export function center(s: string, width: number): string {
  const t = truncate(sanitizePrintText(stringifySafe(s)), width)
  if (t.length >= width) return t.slice(0, width)
  const pad = width - t.length
  const left = Math.floor(pad / 2)
  return `${' '.repeat(left)}${t}${' '.repeat(pad - left)}`
}

/** Esquerda + direita na mesma linha; trunca para não rebentar a largura. */
export function leftRight(left: string, right: string, width: number): string {
  const l = sanitizePrintText(stringifySafe(left))
  const r = sanitizePrintText(stringifySafe(right))
  const gap = 1
  if (l.length + r.length + gap <= width) {
    return `${l}${' '.repeat(width - l.length - r.length)}${r}`
  }
  const maxR = Math.min(r.length, Math.floor(width * 0.45))
  const maxL = width - gap - maxR
  return `${truncate(l, maxL)} ${truncate(r, maxR)}`
}

/** Quebra texto em linhas <= width (palavra quando possível). */
export function wrapText(text: string, width: number): string[] {
  const raw = sanitizePrintText(stringifySafe(text))
  if (width < 8) return [truncate(raw, Math.max(4, width))]
  const lines: string[] = []
  for (const paragraph of raw.split('\n')) {
    if (!paragraph.trim()) {
      lines.push('')
      continue
    }
    let rest = paragraph.trim()
    while (rest.length > 0) {
      if (rest.length <= width) {
        lines.push(rest)
        break
      }
      let slice = rest.slice(0, width)
      const sp = slice.lastIndexOf(' ')
      if (sp > width * 0.35) {
        slice = rest.slice(0, sp)
        rest = rest.slice(sp + 1).trimStart()
      } else {
        rest = rest.slice(width)
      }
      lines.push(slice.trimEnd())
    }
  }
  return lines
}

/** Colunas fixas: `cols` soma pesos; cada célula truncada. */
export function columns(
  cells: string[],
  weights: number[],
  width: number
): string {
  const wsum = weights.reduce((a, b) => a + b, 0) || 1
  const parts = cells.map((c, i) => {
    const w = Math.max(
      4,
      Math.floor((width * (weights[i] ?? 1)) / wsum) - (i < cells.length - 1 ? 1 : 0)
    )
    return truncate(sanitizePrintText(stringifySafe(c)), w)
  })
  const joined = parts.join(' ')
  return truncate(joined, width)
}
