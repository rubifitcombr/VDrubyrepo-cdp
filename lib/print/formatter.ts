import { PRINT_PLACEHOLDER, sanitizePrintText, stringifySafe } from '@/lib/print/sanitize'

function parseMoneySegment(raw: string): number | null {
  const t = raw.trim().replace(/\./g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/**
 * Valor em BRL só com caracteres ASCII.
 * Evita NBSP (U+202F) e outros símbolos de `Intl` que viram "?" na térmica CP850.
 */
export function moneyBrl(n: number): string {
  if (!Number.isFinite(n)) n = 0
  const sign = n < 0 ? '-' : ''
  const cents = Math.round(Math.abs(n) * 100)
  const whole = Math.floor(cents / 100)
  const frac = String(cents % 100).padStart(2, '0')
  const intStr = String(whole)
  const intFmt = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}R$ ${intFmt},${frac}`
}

/** Data/hora local DD/MM/AAAA HH:MM (só ASCII, seguro em CP850). */
export function formatDateTimeAscii(iso: string): string {
  try {
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return PRINT_PLACEHOLDER
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = String(d.getFullYear())
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
  } catch {
    return PRINT_PLACEHOLDER
  }
}

export function truncate(s: string, maxLen: number): string {
  const t = stringifySafe(s)
  if (t.length <= maxLen) return t
  if (maxLen <= 1) return '.'
  return `${t.slice(0, maxLen - 1)}.`
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

/** Quebra texto, depois centra cada linha (cabeçalhos de loja longos). */
export function centerWrappedBlock(text: string, width: number): string[] {
  const raw = sanitizePrintText(stringifySafe(text)).trim()
  if (!raw) return [center(PRINT_PLACEHOLDER, width)]
  return wrapText(raw, width).map((ln) => center(ln.trim() || PRINT_PLACEHOLDER, width))
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

/**
 * Expande `items_summary` em linhas para cupom:
 * - Novo: `2x Item=12,50; 1x Outro=5,00` (preço = total da linha)
 * - Legado: `1x A, 2x B` ou `x A, x B` (qty 1 implícita; sem preço à direita)
 */
export function expandOrderItemLines(summary: string, width: number): string[] {
  const s = sanitizePrintText(stringifySafe(summary)).trim()
  if (!s) return [`${PRINT_PLACEHOLDER} (sem itens)`]

  const segments = (s.includes(';') ? s.split(';') : s.split(/,(?=\s*(\d+\s*)?x\s)/i))
    .map((t) => t.trim())
    .filter(Boolean)
  if (!segments.length) return wrapText(s, width)

  const out: string[] = []
  const indent = '  '
  const priceColMin = 10

  for (const seg of segments) {
    const withPrice = seg.match(/^(\d+)\s*x\s*(.+?)\s*=\s*([\d.,]+)\s*$/i)
    if (withPrice) {
      const qty = withPrice[1]!
      const name = sanitizePrintText(withPrice[2]!.trim())
      const lineTotal = parseMoneySegment(withPrice[3]!)
      const priceStr = lineTotal != null ? moneyBrl(lineTotal) : PRINT_PLACEHOLDER
      const prefix = `${qty}x `
      const maxNameW = Math.max(6, width - prefix.length - priceColMin)
      const nameLines = wrapText(name, maxNameW)
      const first = (nameLines[0] || PRINT_PLACEHOLDER).trim() || PRINT_PLACEHOLDER
      out.push(leftRight(truncate(prefix + first, width - priceColMin), priceStr, width))
      for (let i = 1; i < nameLines.length; i++) {
        const cont = nameLines[i]!.trim()
        if (cont) out.push(truncate(indent + cont, width))
      }
      continue
    }

    const mQty = seg.match(/^(\d+)\s*x\s*(.+)$/i)
    const mBare = seg.match(/^x\s+(.+)$/i)
    if (mQty) {
      const qty = mQty[1]!
      const name = sanitizePrintText(mQty[2]!.trim())
      const prefix = `${qty}x `
      const maxNameW = Math.max(4, width - prefix.length)
      const nameLines = wrapText(name, maxNameW)
      const first = (nameLines[0] || PRINT_PLACEHOLDER).trim() || PRINT_PLACEHOLDER
      out.push(truncate(prefix + first, width))
      for (let i = 1; i < nameLines.length; i++) {
        const cont = nameLines[i]!.trim()
        if (cont) out.push(truncate(indent + cont, width))
      }
    } else if (mBare) {
      const name = sanitizePrintText(mBare[1]!.trim())
      const prefix = `1x `
      const maxNameW = Math.max(4, width - prefix.length)
      const nameLines = wrapText(name, maxNameW)
      const first = (nameLines[0] || PRINT_PLACEHOLDER).trim() || PRINT_PLACEHOLDER
      out.push(truncate(prefix + first, width))
      for (let i = 1; i < nameLines.length; i++) {
        const cont = nameLines[i]!.trim()
        if (cont) out.push(truncate(indent + cont, width))
      }
    } else {
      out.push(...wrapText(seg, width))
    }
  }
  return out
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

export { PRINT_PLACEHOLDER } from '@/lib/print/sanitize'
