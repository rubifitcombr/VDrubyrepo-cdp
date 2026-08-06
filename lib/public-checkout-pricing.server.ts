import type { SupabaseClient } from '@supabase/supabase-js'

export type CheckoutAddonPick = {
  groupName: string
  itemName: string
  price: number
  quantity: number
}

type AddonCatalogItem = {
  groupName: string
  itemName: string
  price: number
}

type AddonCatalog = Map<string, AddonCatalogItem[]>

export type AddonGroupRule = {
  groupName: string
  required: boolean
  minSelect: number
}

function parseAddonPicks(raw: unknown): CheckoutAddonPick[] {
  if (!Array.isArray(raw)) return []
  const out: CheckoutAddonPick[] = []
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

export async function loadAddonCatalogForProducts(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<AddonCatalog> {
  const catalog: AddonCatalog = new Map()
  const ids = [...new Set(productIds.filter(Boolean))]
  if (!ids.length) return catalog

  const { data: groups } = await supabase
    .from('addon_groups')
    .select('id, product_id, name')
    .in('product_id', ids)

  if (!groups?.length) return catalog

  const groupIds = groups.map((g) => String((g as { id: string }).id))
  const { data: items } = await supabase
    .from('addon_items')
    .select('group_id, name, price')
    .in('group_id', groupIds)

  const itemsByGroup = new Map<string, { name: string; price: number }[]>()
  for (const row of items ?? []) {
    const r = row as { group_id: string; name: string; price: number | string }
    const gid = String(r.group_id)
    if (!itemsByGroup.has(gid)) itemsByGroup.set(gid, [])
    itemsByGroup.get(gid)!.push({
      name: String(r.name ?? '').trim(),
      price: Number(r.price) || 0,
    })
  }

  for (const g of groups as { id: string; product_id: string; name: string }[]) {
    const pid = String(g.product_id)
    const groupName = String(g.name ?? '').trim()
    const list = itemsByGroup.get(String(g.id)) ?? []
    if (!catalog.has(pid)) catalog.set(pid, [])
    for (const it of list) {
      catalog.get(pid)!.push({
        groupName,
        itemName: it.name,
        price: it.price,
      })
    }
  }

  return catalog
}

export async function loadAddonGroupRulesForProducts(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Map<string, AddonGroupRule[]>> {
  const rules: Map<string, AddonGroupRule[]> = new Map()
  const ids = [...new Set(productIds.filter(Boolean))]
  if (!ids.length) return rules

  const { data: groups } = await supabase
    .from('addon_groups')
    .select('product_id, name, required, min_select')
    .in('product_id', ids)

  for (const row of groups ?? []) {
    const r = row as {
      product_id: string
      name: string
      required?: boolean
      min_select?: number
    }
    const pid = String(r.product_id)
    const groupName = String(r.name ?? '').trim()
    if (!groupName) continue
    if (!rules.has(pid)) rules.set(pid, [])
    rules.get(pid)!.push({
      groupName,
      required: r.required === true,
      minSelect: Math.max(0, Math.floor(Number(r.min_select) || 0)),
    })
  }

  return rules
}

export function validateRequiredAddonPicks(
  rules: AddonGroupRule[],
  picks: CheckoutAddonPick[]
): boolean {
  for (const rule of rules) {
    const min = rule.required ? Math.max(1, rule.minSelect) : rule.minSelect
    if (min <= 0) continue
    const count = picks
      .filter((p) => p.groupName === rule.groupName)
      .reduce((sum, p) => sum + p.quantity, 0)
    if (count < min) return false
  }
  return true
}

function findCatalogPrice(
  catalog: AddonCatalogItem[],
  pick: CheckoutAddonPick
): number | null {
  const match = catalog.find(
    (c) =>
      c.groupName === pick.groupName &&
      c.itemName === pick.itemName
  )
  return match ? match.price : null
}

export function addonTotalFromCatalog(
  catalog: AddonCatalogItem[],
  picks: CheckoutAddonPick[]
): number {
  let sum = 0
  for (const pick of picks) {
    const unit = findCatalogPrice(catalog, pick)
    if (unit == null) return NaN
    sum += unit * pick.quantity
  }
  return Math.round(sum * 100) / 100
}

export function parseCheckoutAddons(raw: unknown): CheckoutAddonPick[] {
  return parseAddonPicks(raw)
}
