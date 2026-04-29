import 'server-only'

import type { StoreOrderRow } from '@/lib/store-order'
import { ORDER_SELECT } from '@/lib/store-order'
import { createClient } from '@/lib/supabase/server'

const OPEN_STATUSES = ['pending', 'preparing', 'ready', 'confirmed']

export async function getWaiterOpenOrdersForStore(
  storeId: string
): Promise<StoreOrderRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('store_id', storeId)
    .eq('source', 'waiter')
    .in('status', OPEN_STATUSES)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[waiter] list open orders:', error.message)
    return []
  }
  return (data as StoreOrderRow[]) ?? []
}

