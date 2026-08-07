'use client'

/**
 * Coordenação de refetch após Realtime:
 * - Dados operacionais sincronizam sempre (aba visível ou em background).
 * - `shouldThrottleOperationalUiEffects` limita apenas beeps/banners, não pulls.
 * - Ao voltar o foco, `subscribeOperationalVisibilityRefresh` força refetch imediato.
 */
export const OPERATIONAL_SYNC_DEBOUNCE_MS = 800

/** Fallback periódico com Realtime ligado (redundância). */
export const OPERATIONAL_POLL_MS_CONNECTED = 30_000

/** Fallback quando Realtime degradado — prioriza consistência. */
export const OPERATIONAL_POLL_MS_DEGRADED = 12_000

/** Contagem leve (badge pending). */
export const OPERATIONAL_POLL_MS_LIGHT = 60_000

const realtimeStatusByStore = new Map<string, StoreRealtimeStatusDetail['status']>()

/** @deprecated Use shouldThrottleOperationalUiEffects — não bloqueie sync de dados. */
export function isOperationalSyncTabVisible(): boolean {
  return !shouldThrottleOperationalUiEffects()
}

/** Throttle só para efeitos de UI (som, animações), nunca para fetch de dados. */
export function shouldThrottleOperationalUiEffects(): boolean {
  return typeof document !== 'undefined' && document.visibilityState !== 'visible'
}

export function isStoreRealtimeConnected(storeId: string): boolean {
  return realtimeStatusByStore.get(storeId) === 'connected'
}

export function getOperationalPollIntervalMs(storeId: string): number {
  return isStoreRealtimeConnected(storeId)
    ? OPERATIONAL_POLL_MS_CONNECTED
    : OPERATIONAL_POLL_MS_DEGRADED
}

/** Regista estado Realtime (bridge) para ajustar polling em todos os painéis. */
export function setStoreRealtimeStatus(
  storeId: string,
  status: StoreRealtimeStatusDetail['status']
): void {
  realtimeStatusByStore.set(storeId, status)
}

export function subscribeStoreRealtimeStatus(
  storeId: string,
  callback: (status: StoreRealtimeStatusDetail['status']) => void
): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<StoreRealtimeStatusDetail>).detail
    if (detail?.storeId !== storeId) return
    realtimeStatusByStore.set(storeId, detail.status)
    callback(detail.status)
  }
  window.addEventListener(STORE_REALTIME_STATUS_EVENT, handler)
  const current = realtimeStatusByStore.get(storeId)
  if (current) callback(current)
  return () => window.removeEventListener(STORE_REALTIME_STATUS_EVENT, handler)
}

/**
 * Polling de fallback periódico — roda sempre (visível ou em background).
 * `forceIntervalMs` fixa o intervalo (ex.: badge com query leve).
 */
export function subscribeOperationalPolling(
  storeId: string,
  callback: () => void,
  options?: { forceIntervalMs?: number; runWhenConnected?: boolean }
): () => void {
  if (typeof window === 'undefined') return () => {}

  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  function intervalMs(): number {
    if (options?.forceIntervalMs != null) return options.forceIntervalMs
    return getOperationalPollIntervalMs(storeId)
  }

  function tick() {
    if (disposed) return
    callback()
    schedule()
  }

  function schedule() {
    if (timer) clearTimeout(timer)
    if (disposed) return
    timer = setTimeout(tick, intervalMs())
  }

  const unsubRt = subscribeStoreRealtimeStatus(storeId, () => schedule())
  schedule()

  return () => {
    disposed = true
    if (timer) clearTimeout(timer)
    unsubRt()
  }
}

/** Refetch imediato quando o separador volta ao primeiro plano. */
export function subscribeOperationalVisibilityRefresh(callback: () => void): () => void {
  if (typeof document === 'undefined') return () => {}
  const onVisibility = () => {
    if (document.visibilityState === 'visible') callback()
  }
  document.addEventListener('visibilitychange', onVisibility)
  return () => document.removeEventListener('visibilitychange', onVisibility)
}

export const STORE_ORDERS_SYNC_EVENT = 'vyria-store-orders-sync'
export const STORE_REALTIME_STATUS_EVENT = 'vyria-store-realtime-status'

export type StoreRealtimeStatusDetail = {
  storeId: string
  status: 'connected' | 'degraded' | 'error'
}

export type StoreOrdersSyncSource =
  | 'orders'
  | 'order_items'
  | 'order_payments'
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
