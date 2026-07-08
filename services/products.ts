import {
  MENU_PRODUCT_SELECT,
  normalizeMenuProductRow,
  sortMenuProductRows,
  type MenuProductRow,
} from '@/lib/menu-product'
import { createClient } from '@/lib/supabase/client'
import { normalizeMenuImageUrlForSave } from '@/lib/menu-image-url'

function normalizeCategoryLabel(c: string | null | undefined) {
  return (c || '').trim() || null
}

/** Cardápio: colunas usadas no gestor (DB: promotion_active = is_promotion no UI). */
export async function getMenuProducts(
  storeId: string
): Promise<MenuProductRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('products')
    .select(MENU_PRODUCT_SELECT)
    .eq('store_id', storeId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) {
    console.warn('[menu] select menu columns failed, using *:', error.message)
    const { data: all, error: e2 } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .order('name', { ascending: true })
    if (e2) {
      console.error('[menu] products fallback *:', e2.message)
      throw new Error(e2.message)
    }
    return sortMenuProductRows(
      ((all as Record<string, unknown>[]) ?? []).map(normalizeMenuProductRow)
    )
  }
  return sortMenuProductRows((data as MenuProductRow[]) ?? [])
}

export async function getProducts(storeId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) {
    const { data: fallback } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .order('name', { ascending: true })
    return fallback
  }
  return data
}

export async function getProductById(productId: string) {
  const supabase = createClient()
  return supabase.from('products').select('*').eq('id', productId).single()
}

export async function createProduct(product: Record<string, unknown>) {
  const supabase = createClient()
  return supabase.from('products').insert(product)
}

export async function deleteProduct(id: string) {
  const supabase = createClient()
  await supabase.from('products').delete().eq('id', id)
}

export type MenuProductPayload = {
  store_id: string
  name: string
  price: number
  description?: string | null
  active?: boolean
  category?: string | null
  image_url?: string | null
  cardapio_meta?: Record<string, unknown>
  sort_order?: number
  promotional_price?: number | null
  promotion_active?: boolean
  delivery_price?: number | null
  dine_in_price?: number | null
  delivery_promotional_price?: number | null
  delivery_promotion_active?: boolean
  dine_in_promotional_price?: number | null
  dine_in_promotion_active?: boolean
}

export async function getNextProductSortOrder(
  storeId: string,
  categoryLabel: string | null
): Promise<number> {
  let rows: MenuProductRow[] = []
  try {
    rows = await getMenuProducts(storeId)
  } catch (e) {
    console.warn('[menu] getNextProductSortOrder:', e)
    return 1
  }
  const target = normalizeCategoryLabel(categoryLabel)
  const inCat = (rows || []).filter((r: { category?: string | null }) => {
    const c = normalizeCategoryLabel(r.category)
    if (target) return c === target
    return c == null
  })
  let max = 0
  for (const r of inCat) {
    const so = Number((r as { sort_order?: number | null }).sort_order)
    if (!Number.isNaN(so) && so > max) max = so
  }
  return max + 1
}

export async function createMenuProduct(payload: MenuProductPayload) {
  const supabase = createClient()
  const row: Record<string, unknown> = {
    store_id: payload.store_id,
    name: payload.name,
    price: payload.price,
    active: payload.active ?? true,
  }
  if (payload.description?.trim()) {
    row.description = payload.description.trim()
  }
  if (payload.category?.trim()) {
    row.category = payload.category.trim()
  }
  if (payload.image_url?.trim()) {
    row.image_url =
      normalizeMenuImageUrlForSave(payload.image_url, payload.store_id) ??
      payload.image_url.trim()
  }
  if (payload.cardapio_meta && Object.keys(payload.cardapio_meta).length > 0) {
    row.cardapio_meta = payload.cardapio_meta
  }
  if (typeof payload.sort_order === 'number') {
    row.sort_order = payload.sort_order
  }
  if (payload.promotional_price != null && !Number.isNaN(Number(payload.promotional_price))) {
    row.promotional_price = Number(payload.promotional_price)
  }
  if (typeof payload.promotion_active === 'boolean') {
    row.promotion_active = payload.promotion_active
  }
  if (payload.delivery_price != null && !Number.isNaN(Number(payload.delivery_price))) {
    row.delivery_price = Number(payload.delivery_price)
  }
  if (payload.dine_in_price != null && !Number.isNaN(Number(payload.dine_in_price))) {
    row.dine_in_price = Number(payload.dine_in_price)
  }
  if (
    payload.delivery_promotional_price != null &&
    !Number.isNaN(Number(payload.delivery_promotional_price))
  ) {
    row.delivery_promotional_price = Number(payload.delivery_promotional_price)
  }
  if (typeof payload.delivery_promotion_active === 'boolean') {
    row.delivery_promotion_active = payload.delivery_promotion_active
  }
  if (
    payload.dine_in_promotional_price != null &&
    !Number.isNaN(Number(payload.dine_in_promotional_price))
  ) {
    row.dine_in_promotional_price = Number(payload.dine_in_promotional_price)
  }
  if (typeof payload.dine_in_promotion_active === 'boolean') {
    row.dine_in_promotion_active = payload.dine_in_promotion_active
  }
  return supabase.from('products').insert(row).select('id').single()
}

export async function updateProduct(
  id: string,
  patch: Partial<{
    name: string
    price: number
    description: string | null
    active: boolean
    category: string | null
    image_url: string | null
    cardapio_meta: Record<string, unknown>
    sort_order: number
    promotional_price: number | null
    promotion_active: boolean
    delivery_price: number | null
    dine_in_price: number | null
    delivery_promotional_price: number | null
    delivery_promotion_active: boolean
    dine_in_promotional_price: number | null
    dine_in_promotion_active: boolean
  }>
) {
  const supabase = createClient()
  const normalized = { ...patch }
  if ('image_url' in normalized) {
    normalized.image_url = normalized.image_url
      ? normalizeMenuImageUrlForSave(normalized.image_url) ??
        String(normalized.image_url).trim()
      : null
  }
  return supabase.from('products').update(normalized).eq('id', id)
}

/* ------------------------------------------------------------------ */
/* Dados fiscais por produto (NFC-e)                                   */
/* ------------------------------------------------------------------ */

export const PRODUCT_FISCAL_SELECT =
  'id, name, category, ncm, cfop, cest, cst_csosn, origem, unidade'

export type ProductFiscalRow = {
  id: string
  name: string
  category: string | null
  ncm: string | null
  cfop: string | null
  cest: string | null
  cst_csosn: string | null
  origem: string | null
  unidade: string | null
}

export type ProductFiscalPatch = {
  ncm?: string | null
  cfop?: string | null
  cest?: string | null
  cst_csosn?: string | null
  origem?: string | null
  unidade?: string | null
}

export async function getProductsFiscal(storeId: string): Promise<ProductFiscalRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_FISCAL_SELECT)
    .eq('store_id', storeId)
    .order('category', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    category: r.category != null ? String(r.category) : null,
    ncm: r.ncm != null ? String(r.ncm) : null,
    cfop: r.cfop != null ? String(r.cfop) : null,
    cest: r.cest != null ? String(r.cest) : null,
    cst_csosn: r.cst_csosn != null ? String(r.cst_csosn) : null,
    origem: r.origem != null ? String(r.origem) : null,
    unidade: r.unidade != null ? String(r.unidade) : null,
  }))
}

export async function updateProductFiscal(id: string, patch: ProductFiscalPatch) {
  const supabase = createClient()
  return supabase.from('products').update(patch).eq('id', id)
}

export async function reorderProduct(
  storeId: string,
  productId: string,
  direction: 'up' | 'down',
  categoryDisplay: string
) {
  const supabase = createClient()
  let all: MenuProductRow[] = []
  try {
    all = await getMenuProducts(storeId)
  } catch (e) {
    console.warn('[menu] reorderProduct load:', e)
    return { error: new Error('Não foi possível carregar o cardápio.') }
  }
  const displayToNorm = (d: string) =>
    d === 'Sem categoria' ? null : d.trim() || null
  const targetCat = displayToNorm(categoryDisplay)
  const inCat = all
    .filter((p) => normalizeCategoryLabel(p.category) === targetCat)
    .sort((a, b) => {
      const soA = a.sort_order ?? 0
      const soB = b.sort_order ?? 0
      if (soA !== soB) return soA - soB
      return a.name.localeCompare(b.name, 'pt')
    })
  const idx = inCat.findIndex((p) => p.id === productId)
  if (idx < 0) return { error: new Error('Item não encontrado') }
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= inCat.length) return { error: null }
  const a = inCat[idx]
  const b = inCat[swapIdx]
  const orderA = Number(a.sort_order ?? idx * 1000)
  const orderB = Number(b.sort_order ?? swapIdx * 1000)
  const { error: e1 } = await supabase
    .from('products')
    .update({ sort_order: orderB })
    .eq('id', a.id)
  const { error: e2 } = await supabase
    .from('products')
    .update({ sort_order: orderA })
    .eq('id', b.id)
  return { error: e1 || e2 || null }
}
