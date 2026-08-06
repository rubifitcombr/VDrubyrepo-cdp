export type ProductAddonPick = {
  groupName: string
  itemName: string
  price: number
  quantity: number
}

export type ProductAddonGroup = {
  name: string
  required: boolean
  items: { name: string; price: number }[]
}

export function addonPickKey(g: number, i: number): string {
  return `${g}:${i}`
}

export function buildProductLineName(
  base: string,
  addons: ProductAddonPick[],
  notes?: string | null
): string {
  let s = base.trim() || 'Item'
  if (addons.length > 0) {
    s += ` [${addons
      .map((a) => (a.quantity > 1 ? `${a.itemName} x${a.quantity}` : a.itemName))
      .join(', ')}]`
  }
  if (notes?.trim()) {
    s += ` — Obs: ${notes.trim()}`
  }
  return s
}

export function addonPicksFromSelection(
  groups: ProductAddonGroup[],
  selectedQty: Record<string, number>
): ProductAddonPick[] {
  const picks: ProductAddonPick[] = []
  for (const [key, quantity] of Object.entries(selectedQty)) {
    if (!quantity || quantity < 1) continue
    const [gs, is] = key.split(':').map(Number)
    const g = groups[gs]
    const it = g?.items[is]
    if (g && it) {
      picks.push({
        groupName: g.name,
        itemName: it.name,
        price: it.price,
        quantity,
      })
    }
  }
  return picks
}

export function addonTotalFromPicks(picks: ProductAddonPick[]): number {
  return picks.reduce((sum, pick) => sum + pick.price * pick.quantity, 0)
}

/** Rehidrata picks guardados em `order_items.addons` (JSON). */
export function parseProductAddonPicks(raw: unknown): ProductAddonPick[] {
  if (!Array.isArray(raw)) return []
  const out: ProductAddonPick[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const o = entry as Record<string, unknown>
    const groupName = typeof o.groupName === 'string' ? o.groupName.trim() : ''
    const itemName = typeof o.itemName === 'string' ? o.itemName.trim() : ''
    const price = Number(o.price)
    const quantity = Number(o.quantity)
    if (!groupName || !itemName) continue
    if (!Number.isFinite(price) || price < 0) continue
    if (!Number.isFinite(quantity) || quantity < 1) continue
    out.push({ groupName, itemName, price, quantity: Math.floor(quantity) })
  }
  return out
}

export function requiredAddonGroupsOk(
  groups: ProductAddonGroup[],
  selectedQty: Record<string, number>
): boolean {
  for (let g = 0; g < groups.length; g++) {
    if (!groups[g]?.required) continue
    const has = groups[g].items.some(
      (_, i) => (selectedQty[addonPickKey(g, i)] ?? 0) > 0
    )
    if (!has) return false
  }
  return true
}
