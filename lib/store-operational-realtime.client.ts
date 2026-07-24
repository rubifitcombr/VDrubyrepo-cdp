'use client'

export const STORE_ORDERS_SYNC_EVENT = 'vyria-store-orders-sync'

export type StoreOrdersSyncSource =
  | 'orders'
  | 'order_items'
  | 'store_tables'
  | 'caixas_turnos'
  | 'caixa_movimentacoes'

export type StoreOrdersSyncDetail = {
  storeId: string
  source: StoreOrdersSyncSource
  eventType?: string
}

function broadcastChannelName(storeId: string): string {
  return `vyria-ops-${storeId}`
}

/** Propaga alteração operacional a todos os painéis abertos (mesma aba + outras abas). */
export function dispatchStoreOrdersSync(detail: StoreOrdersSyncDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<StoreOrdersSyncDetail>(STORE_ORDERS_SYNC_EVENT, {
      detail,
    })
  )
  try {
    const bc = new BroadcastChannel(broadcastChannelName(detail.storeId))
    bc.postMessage(detail)
    bc.close()
  } catch {
    /* BroadcastChannel indisponível */
  }
}

export function subscribeStoreOrdersSync(
  storeId: string,
  callback: (detail: StoreOrdersSyncDetail) => void
): () => void {
  if (typeof window === 'undefined') return () => {}

  const onWindow = (event: Event) => {
    const detail = (event as CustomEvent<StoreOrdersSyncDetail>).detail
    if (detail?.storeId === storeId) callback(detail)
  }
  window.addEventListener(STORE_ORDERS_SYNC_EVENT, onWindow)

  let bc: BroadcastChannel | null = null
  try {
    bc = new BroadcastChannel(broadcastChannelName(storeId))
    bc.onmessage = (event) => {
      const detail = event.data as StoreOrdersSyncDetail
      if (detail?.storeId === storeId) callback(detail)
    }
  } catch {
    /* ignore */
  }

  return () => {
    window.removeEventListener(STORE_ORDERS_SYNC_EVENT, onWindow)
    bc?.close()
  }
}
