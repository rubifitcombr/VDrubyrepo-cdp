import 'server-only'

import {
  MENU_PRODUCT_SELECT,
  normalizeMenuProductRow,
  sortMenuProductRows,
  type MenuProductRow,
} from '@/lib/menu-product'
import { createClient } from '@/lib/supabase/server'

export async function getMenuProductsForStore(
  storeId: string
): Promise<MenuProductRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select(MENU_PRODUCT_SELECT)
    .eq('store_id', storeId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) {
    console.warn('[menu] select failed, fallback *:', error.message)
    const { data: all, error: e2 } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .order('name', { ascending: true })
    if (e2) {
      console.error('[menu] fallback *:', e2.message)
      return []
    }
    return sortMenuProductRows(
      ((all as Record<string, unknown>[]) ?? []).map((row) =>
        normalizeMenuProductRow(row, storeId)
      )
    )
  }
  return sortMenuProductRows(
    ((data as Record<string, unknown>[]) ?? []).map((row) =>
      normalizeMenuProductRow(row, storeId)
    )
  )
}
