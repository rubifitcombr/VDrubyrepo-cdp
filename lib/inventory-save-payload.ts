export type InventorySaveDraft = {
  quantity: string
  low: string
}

export type InventorySaveSourceRow = {
  productId: string
  quantity: number
  lowStockAlert: number | null
}

function parseDraftQuantity(raw: string): number {
  return Math.max(0, Math.floor(parseFloat(raw.replace(',', '.')) || 0))
}

function parseDraftLow(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  return Math.max(0, Math.floor(parseFloat(trimmed.replace(',', '.')) || 0))
}

/** Monta o payload do PUT /api/inventory só para produtos tocados nesta sessão. */
export function buildInventorySaveItems(
  rows: InventorySaveSourceRow[],
  drafts: Record<string, InventorySaveDraft>,
  touchedProductIds: ReadonlySet<string>
): Array<{
  product_id: string
  quantity: number
  low_stock_alert: number | null
}> {
  const items: Array<{
    product_id: string
    quantity: number
    low_stock_alert: number | null
  }> = []

  for (const row of rows) {
    if (!touchedProductIds.has(row.productId)) continue

    const draft = drafts[row.productId] ?? { quantity: '0', low: '' }
    items.push({
      product_id: row.productId,
      quantity: parseDraftQuantity(draft.quantity),
      low_stock_alert: parseDraftLow(draft.low),
    })
  }

  return items
}

export function inventoryRowHasDraftChanges(
  row: InventorySaveSourceRow,
  draft: InventorySaveDraft | undefined
): boolean {
  if (!draft) return false
  const qty = parseDraftQuantity(draft.quantity)
  const low = parseDraftLow(draft.low)
  return qty !== row.quantity || low !== row.lowStockAlert
}
