import 'server-only'

import { isPdvWaiterComandaSource } from '@/lib/cashier-pro-delivery-scope'
import type { StoreOrderRow } from '@/lib/store-order'
import { mapStoreOrderRow, ORDER_SELECT } from '@/lib/store-order'
import { createClient } from '@/lib/supabase/server'

export async function getCashierOrdersForStore(
  storeId: string,
  lookbackDays = 45,
  opts?: { excludePdvWaiterComandas?: boolean }
): Promise<StoreOrderRow[]> {
  const supabase = await createClient()
  const from = new Date(Date.now() - lookbackDays * 86400000).toISOString()
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('store_id', storeId)
    .gte('created_at', from)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[cashier] list orders:', error.message)
    return []
  }
  let rows = (data ?? []).map((row) => mapStoreOrderRow(row as Record<string, unknown>))
  if (opts?.excludePdvWaiterComandas) {
    rows = rows.filter((o) => !isPdvWaiterComandaSource(o.source))
  }
  return rows
}

