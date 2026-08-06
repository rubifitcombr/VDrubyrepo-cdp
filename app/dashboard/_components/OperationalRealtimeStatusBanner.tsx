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

    function onStatus(event: Event) {
      const detail = (event as CustomEvent<StoreRealtimeStatusDetail>).detail
      if (!detail || detail.storeId !== storeId) return
      setStatus(detail.status)
    }

    window.addEventListener(STORE_REALTIME_STATUS_EVENT, onStatus)
    return () => window.removeEventListener(STORE_REALTIME_STATUS_EVENT, onStatus)
  }, [storeId])

  if (status !== 'error') return null

  return (
    <div
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-950"
      role="status"
    >
      Sincronização em tempo real interrompida — os dados podem estar desatualizados até
      a ligação ser restabelecida.
    </div>
  )
}
