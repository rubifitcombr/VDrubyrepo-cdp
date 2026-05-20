import { createClient } from '@/lib/supabase/client'
import type { StoreOrderRow } from '@/lib/store-order'
import { ORDER_SELECT, orderIsVisibleAfterPixConfirmation } from '@/lib/store-order'

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
  return ((data as StoreOrderRow[]) ?? []).filter(orderIsVisibleAfterPixConfirmation)
}

export async function updateOrderStatus(
  orderId: string,
  status: string
): Promise<{ error: Error | null; deliveryNotified?: boolean }> {
  try {
    const res = await fetch('/api/orders/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, status }),
    })
    const data = (await res.json()) as {
      error?: string
      deliveryNotified?: boolean
    }
    if (!res.ok) {
      return {
        error: new Error(data?.error || res.statusText || 'Erro ao atualizar.'),
      }
    }
    return {
      error: null,
      deliveryNotified: data.deliveryNotified === true,
    }
  } catch (e) {
    return {
      error: new Error(e instanceof Error ? e.message : 'Erro de rede.'),
    }
  }
}
