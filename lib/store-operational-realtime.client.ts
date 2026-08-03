'use client'

/**
 * Coordenação de refetch após Realtime (item 5 do hardening de egress):
 * - Não há pull centralizado único (evita refactor grande no shell).
 * - Cada subscriber ignora eventos com aba em segundo plano (mesmo guard do polling).
 * - O bridge aumenta debounce antes de broadcast para agrupar rajadas.
 */
export const OPERATIONAL_SYNC_DEBOUNCE_MS = 400

/** Só dispara fetch PostgREST quando o separador do dashboard está visível. */
export function isOperationalSyncTabVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

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

/** Atalho para notificar alteração de comandas em todos os painéis da loja. */
export function notifyStoreOrdersChanged(
  storeId: string,
  opts?: {
    source?: StoreOrdersSyncSource
    eventType?: 'INSERT' | 'UPDATE' | 'DELETE'
  }
): void {
  dispatchStoreOrdersSync({
    storeId,
    source: opts?.source ?? 'orders',
    eventType: opts?.eventType ?? 'UPDATE',
  })
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
