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
): Promise<{
  error: Error | null
  fiscal?: {
    attempted: boolean
    skipped: boolean
    ok: boolean
    status?: string
    motivo?: string
  }
}> {
  try {
    const res = await fetch('/api/orders/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, status }),
    })
    const data = (await res.json()) as {
      error?: string
      fiscal?: {
        attempted?: boolean
        skipped?: boolean
        ok?: boolean
        status?: string
        motivo?: string
      }
    }
    if (!res.ok) {
      return {
        error: new Error(data?.error || res.statusText || 'Erro ao atualizar.'),
      }
    }
    const fiscal = data.fiscal
      ? {
          attempted: Boolean(data.fiscal.attempted),
          skipped: Boolean(data.fiscal.skipped),
          ok: Boolean(data.fiscal.ok),
          status: data.fiscal.status,
          motivo: data.fiscal.motivo,
        }
      : undefined
    return { error: null, ...(fiscal ? { fiscal } : {}) }
  } catch (e) {
    return {
      error: new Error(e instanceof Error ? e.message : 'Erro de rede.'),
    }
  }
}
