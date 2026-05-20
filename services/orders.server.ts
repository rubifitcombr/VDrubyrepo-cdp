import 'server-only'

import type { StoreOrderRow } from '@/lib/store-order'
import { ORDER_SELECT, orderIsVisibleAfterPixConfirmation } from '@/lib/store-order'
import { slugChannelSourcesForSupabaseIn } from '@/lib/slug-channel-orders'
import { createClient } from '@/lib/supabase/server'

export async function getStoreOrders(
  storeId: string,
  options?: { slugChannelSourcesOnly?: boolean }
): Promise<StoreOrderRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('store_id', storeId)
  if (options?.slugChannelSourcesOnly) {
    q = q.in('source', slugChannelSourcesForSupabaseIn())
  }
  const { data, error } = await q.order('created_at', { ascending: false })

  if (error) {
    console.error('[orders]', error.message)
    return []
  }
  return ((data as StoreOrderRow[]) ?? []).filter(orderIsVisibleAfterPixConfirmation)
}
