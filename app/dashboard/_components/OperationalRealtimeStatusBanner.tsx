'use client'

import { useEffect, useState } from 'react'
import {
  STORE_REALTIME_STATUS_EVENT,
  type StoreRealtimeStatusDetail,
} from '@/lib/store-operational-realtime.client'

export function OperationalRealtimeStatusBanner({
  storeId,
}: {
  storeId: string | null
}) {
  const [status, setStatus] = useState<StoreRealtimeStatusDetail['status'] | null>(
    null
  )

  useEffect(() => {
    if (!storeId) return

    let backgroundStaleTimer: number | null = null
    let hiddenAt: number | null = null
    const BACKGROUND_STALE_MS = 5000

    function onStatus(event: Event) {
      const detail = (event as CustomEvent<StoreRealtimeStatusDetail>).detail
      if (!detail || detail.storeId !== storeId) return
      setStatus(detail.status)
      if (detail.status === 'connected' && backgroundStaleTimer) {
        window.clearTimeout(backgroundStaleTimer)
        backgroundStaleTimer = null
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      if (document.visibilityState !== 'visible' || hiddenAt == null) return
      const elapsed = Date.now() - hiddenAt
      hiddenAt = null
      if (elapsed < BACKGROUND_STALE_MS) return
      setStatus('degraded')
      if (backgroundStaleTimer) window.clearTimeout(backgroundStaleTimer)
      backgroundStaleTimer = window.setTimeout(() => {
        backgroundStaleTimer = null
        setStatus((prev) => (prev === 'degraded' ? null : prev))
      }, 12_000)
    }

    window.addEventListener(STORE_REALTIME_STATUS_EVENT, onStatus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener(STORE_REALTIME_STATUS_EVENT, onStatus)
      document.removeEventListener('visibilitychange', onVisibility)
      if (backgroundStaleTimer) window.clearTimeout(backgroundStaleTimer)
    }
  }, [storeId])

  if (!status || status === 'connected') return null

  const isError = status === 'error'
  const message = isError
    ? 'Sincronização em tempo real interrompida — os dados podem estar desatualizados até a ligação ser restabelecida.'
    : 'Separador esteve em segundo plano — a actualizar dados. Confirme pedidos críticos antes de agir.'

  return (
    <div
      className={
        isError
          ? 'border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-950'
          : 'border-b border-sky-200 bg-sky-50 px-4 py-2 text-center text-xs font-medium text-sky-950'
      }
      role="status"
    >
      {message}
    </div>
  )
}
