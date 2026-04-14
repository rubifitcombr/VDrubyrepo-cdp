import 'server-only'

import type { StoreOrderRow } from '@/lib/store-order'
import { ORDER_SELECT } from '@/lib/store-order'
import { createClient } from '@/lib/supabase/server'

export async function getStoreOrders(
  storeId: string
): Promise<StoreOrderRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[orders]', error.message)
    return []
  }
  return (data as StoreOrderRow[]) ?? []
}
