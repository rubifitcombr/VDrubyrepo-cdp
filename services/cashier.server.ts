import 'server-only'

import type { StoreOrderRow } from '@/lib/store-order'
import { ORDER_SELECT } from '@/lib/store-order'
import { createClient } from '@/lib/supabase/server'

export async function getCashierOrdersForStore(
  storeId: string,
  lookbackDays = 45
): Promise<StoreOrderRow[]> {
  const supabase = await createClient()
  const from = new Date(Date.now() - lookbackDays * 86400000).toISOString()
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('store_id', storeId)
    .gte('created_at', from)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[cashier] list orders:', error.message)
    return []
  }
  return (data as StoreOrderRow[]) ?? []
}

