function parseCommaMoneySegment(raw: string): number | null {
  const t = raw.trim().replace(/\./g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/**
 * Soma totais por linha em `items_summary` no formato `…=12,50; …=5,00`.
 * Usado como fallback no cupom quando `orders.total` vem vazio ou zero.
 */
export function sumLineTotalsFromItemsSummary(summary: string | null | undefined): number | null {
  const s = String(summary ?? '').trim()
  if (!s) return null
  let sum = 0
  let count = 0
  for (const seg of s.split(';')) {
    const t = seg.trim()
    if (!t) continue
    const m = t.match(/=\s*([\d.,]+)\s*$/i)
    if (!m?.[1]) continue
    const v = parseCommaMoneySegment(m[1])
    if (v == null) continue
    sum += v
    count++
  }
  return count > 0 ? Math.round(sum * 100) / 100 : null
}

/** Formato estável para cupom térmico: `2x Nome=12,50; 1x Outro=5,00` (só `;` entre itens). */
export function buildItemsSummaryWithLineTotals(
  lines: ReadonlyArray<{ quantity: number; name: string; unit_price: number }>
): string {
  return lines
    .map((l) => {
      const q = Math.max(1, Math.floor(l.quantity || 1))
      const unit = Math.max(0, Number(l.unit_price) || 0)
      const lineTotal = Math.round(q * unit * 100) / 100
      const totalStr = lineTotal.toFixed(2).replace('.', ',')
      const name = String(l.name ?? '').trim() || 'Item'
      return `${q}x ${name}=${totalStr}`
    })
    .join('; ')
}
