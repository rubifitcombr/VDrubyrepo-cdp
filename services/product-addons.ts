import { createClient } from '@/lib/supabase/client'

export type AddonItemSaved = {
  name: string
  price: number
}

export type AddonGroupSaved = {
  name: string
  required: boolean
  minSelect: number
  maxSelect: number
  items: AddonItemSaved[]
}

export async function fetchProductAddonTree(
  productId: string
): Promise<AddonGroupSaved[]> {
  const supabase = createClient()
  const { data: groups, error: gErr } = await supabase
    .from('addon_groups')
    .select('id, name, required, min_select, max_select, sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })

  if (gErr) {
    throw new Error(gErr.message || 'Erro ao carregar grupos de adicionais.')
  }
  if (!groups?.length) return []

  const groupIds = groups.map((g: { id: string }) => g.id)
  const { data: items, error: iErr } = await supabase
    .from('addon_items')
    .select('group_id, name, price, sort_order')
    .in('group_id', groupIds)
    .order('sort_order', { ascending: true })

  if (iErr) {
    throw new Error(iErr.message || 'Erro ao carregar itens de adicionais.')
  }

  const byGroup = new Map<string, AddonItemSaved[]>()
  for (const row of items ?? []) {
    const r = row as {
      group_id: string
      name: string
      price: number | string
    }
    if (!byGroup.has(r.group_id)) byGroup.set(r.group_id, [])
    byGroup.get(r.group_id)!.push({
      name: r.name,
      price: Number(r.price) || 0,
    })
  }

  return (
    groups as {
      id: string
      name: string
      required: boolean
      min_select?: number | null
      max_select?: number | null
    }[]
  )
    .map((g) => {
      const minSelect = Number(g.min_select)
      const maxSelect = Number(g.max_select)
      return {
        name: g.name,
        required: !!g.required,
        minSelect: Number.isFinite(minSelect) && minSelect >= 0 ? minSelect : 0,
        maxSelect:
          Number.isFinite(maxSelect) && maxSelect >= 1 ? maxSelect : 1,
        items: byGroup.get(g.id) ?? [],
      }
    })
    .filter((g) => g.items.length > 0 || !g.required)
}

/**
 * Remove grupos antigos do produto e grava a árvore nova (grupos → itens).
 */
export async function replaceProductAddons(
  productId: string,
  groups: AddonGroupSaved[]
): Promise<{ error: Error | null }> {
  const supabase = createClient()

  const { error: delErr } = await supabase
    .from('addon_groups')
    .delete()
    .eq('product_id', productId)

  if (delErr) return { error: new Error(delErr.message) }

  const cleaned = groups
    .map((g, gi) => ({
      name: g.name.trim(),
      required: g.required,
      min_select: g.required ? Math.max(1, g.minSelect ?? 1) : g.minSelect ?? 0,
      max_select: Math.max(1, g.maxSelect ?? 1),
      sort_order: gi,
      items: g.items
        .map((it, ii) => ({
          name: it.name.trim(),
          price: it.price,
          sort_order: ii,
        }))
        .filter((it) => it.name.length > 0 && !Number.isNaN(it.price)),
    }))
    .filter((g) => g.name.length > 0)

  for (const g of cleaned) {
    const { data: row, error: insG } = await supabase
      .from('addon_groups')
      .insert({
        product_id: productId,
        name: g.name,
        required: g.required,
        min_select: g.min_select,
        max_select: g.max_select,
        sort_order: g.sort_order,
      })
      .select('id')
      .single()

    if (insG || !row) {
      return { error: new Error(insG?.message ?? 'Erro ao criar grupo de adicionais') }
    }

    const gid = (row as { id: string }).id
    if (g.items.length > 0) {
      const { error: insI } = await supabase.from('addon_items').insert(
        g.items.map((it) => ({
          group_id: gid,
          name: it.name,
          price: it.price,
          sort_order: it.sort_order,
        }))
      )
      if (insI) return { error: new Error(insI.message) }
    }
  }

  return { error: null }
}
