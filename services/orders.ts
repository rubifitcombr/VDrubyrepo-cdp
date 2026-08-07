import { notifyStoreOrdersChanged } from '@/lib/store-operational-realtime.client'

export async function updateOrderStatus(
  orderId: string,
  status: string,
  opts?: { storeId?: string | null }
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
    const storeId = opts?.storeId?.trim()
    if (storeId) {
      notifyStoreOrdersChanged(storeId, { eventType: 'UPDATE' })
    }
    return { error: null, ...(fiscal ? { fiscal } : {}) }
  } catch (e) {
    return {
      error: new Error(e instanceof Error ? e.message : 'Erro de rede.'),
    }
  }
}
