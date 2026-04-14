import { createClient } from '@/lib/supabase/client'
import type { StoreOrderRow } from '@/lib/store-order'
import { ORDER_SELECT } from '@/lib/store-order'

export async function getStoreOrders(storeId: string): Promise<StoreOrderRow[]> {
  const supabase = createClient()
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

export async function updateOrderStatus(
  orderId: string,
  status: string
): Promise<{ error: Error | null }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId)

  return { error: error ? new Error(error.message) : null }
}
