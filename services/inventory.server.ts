import 'server-only'

import { createClient } from '@/lib/supabase/server'

export type ProductStockRow = {
  productId: string
  quantity: number
  lowStockAlert: number | null
}

export async function getProductStocksForStore(
  storeId: string
): Promise<Map<string, { quantity: number; lowStockAlert: number | null }>> {
  const map = new Map<
    string,
    { quantity: number; lowStockAlert: number | null }
  >()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('store_product_stock')
    .select('product_id, quantity, low_stock_alert')
    .eq('store_id', storeId)

  if (error) {
    if (
      error.message.includes('store_product_stock') ||
      error.message.includes('does not exist')
    ) {
      return map
    }
    console.error('[inventory] select:', error.message)
    return map
  }

  for (const row of data ?? []) {
    const pid = String(row.product_id ?? '')
    if (!pid) continue
    map.set(pid, {
      quantity: Math.max(0, Number(row.quantity) || 0),
      lowStockAlert:
        row.low_stock_alert == null
          ? null
          : Math.max(0, Number(row.low_stock_alert)),
    })
  }
  return map
}
