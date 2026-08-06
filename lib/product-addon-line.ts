export type ProductAddonPick = {
  groupName: string
  itemName: string
  price: number
  quantity: number
}

export type ProductAddonGroup = {
  name: string
  required: boolean
  /** Mínimo de itens no grupo (0 = opcional se não required). */
  minSelect?: number
  /** Máximo de itens no grupo (1 = escolha única, ex. tipo de carne). */
  maxSelect?: number
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

export function addonGroupMaxSelect(g: ProductAddonGroup): number {
  const n = g.maxSelect
  return Number.isFinite(n) && (n as number) >= 1 ? (n as number) : 1
}

/** Pré-selecção para grupos obrigatórios (ex.: Bovino incluído). */
export function defaultRequiredAddonSelection(
  groups: ProductAddonGroup[]
): Record<string, number> {
  const initial: Record<string, number> = {}
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]
    if (!g?.required || g.items.length === 0) continue
    const defaultIdx = g.items.findIndex((it) => it.price === 0)
    const idx = defaultIdx >= 0 ? defaultIdx : 0
    initial[addonPickKey(gi, idx)] = 1
  }
  return initial
}

/**
 * Rehidrata picks a partir do nome da linha («Simples [Frango]») quando
 * `order_items.addons` ainda não foi gravado (comandas antigas).
 */
export function inferAddonPicksFromLineName(
  lineName: string,
  groups: ProductAddonGroup[]
): ProductAddonPick[] {
  const bracket = lineName.match(/\s\[([^\]]+)\]/)
  if (!bracket || !groups.length) return []
  const tokens = bracket[1].split(',').map((s) => s.trim()).filter(Boolean)
  const picks: ProductAddonPick[] = []
  for (const token of tokens) {
    const m = token.match(/^(.+?)(?:\sx(\d+))?$/i)
    const itemName = (m?.[1] ?? token).trim()
    const quantity = m?.[2] ? Math.max(1, parseInt(m[2], 10)) : 1
    for (const g of groups) {
      const it = g.items.find((i) => i.name === itemName)
      if (it) {
        picks.push({
          groupName: g.name,
          itemName: it.name,
          price: it.price,
          quantity,
        })
        break
      }
    }
  }
  return picks
}
