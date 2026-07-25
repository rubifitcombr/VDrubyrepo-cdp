import 'server-only'

import type { StoreOrderRow } from '@/lib/store-order'
import {
  mapStoreOrderRow,
  ORDER_SELECT,
  orderIsVisibleAfterPixConfirmation,
} from '@/lib/store-order'
import {
  isSalonMapOrderSource,
} from '@/lib/waiter-order-notes'
import {
  isWaiterSalonOpenOrder,
} from '@/lib/presencial-table-orders'
import { createClient } from '@/lib/supabase/server'

const OPEN_STATUSES = ['pending', 'preparing', 'ready', 'confirmed', 'delivered']

export async function getWaiterOpenOrdersForStore(
  storeId: string
): Promise<StoreOrderRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('store_id', storeId)
    .in('source', ['waiter', 'autoatendimento'])
    .in('status', OPEN_STATUSES)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[waiter] list open orders:', error.message)
    return []
  }
  return (data ?? [])
    .map((row) => mapStoreOrderRow(row as Record<string, unknown>))
    .filter(
      (o) =>
        isSalonMapOrderSource(o.source) &&
        orderIsVisibleAfterPixConfirmation(o) &&
        isWaiterSalonOpenOrder(o)
    )
}

