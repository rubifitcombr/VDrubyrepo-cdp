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
