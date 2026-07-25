import 'server-only'

import type { StoreOrderRow } from '@/lib/store-order'
import { ORDER_SELECT, orderIsVisibleAfterPixConfirmation } from '@/lib/store-order'
import { KDS_KITCHEN_STATUSES } from '@/lib/kds-order-display'
import { slugChannelSourcesForSupabaseIn } from '@/lib/slug-channel-orders'
import { createClient } from '@/lib/supabase/server'

export async function getStoreOrders(
  storeId: string,
  options?: { slugChannelSourcesOnly?: boolean; limit?: number; kitchenOnly?: boolean }
): Promise<StoreOrderRow[]> {
  const supabase = await createClient()
  const limit = options?.limit ?? 250
  let q = supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('store_id', storeId)
  if (options?.slugChannelSourcesOnly) {
    q = q.in('source', slugChannelSourcesForSupabaseIn())
  }
  if (options?.kitchenOnly) {
    q = q.in('status', [...KDS_KITCHEN_STATUSES])
  }
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[orders]', error.message)
    return []
  }
  return ((data as StoreOrderRow[]) ?? []).filter(orderIsVisibleAfterPixConfirmation)
}
