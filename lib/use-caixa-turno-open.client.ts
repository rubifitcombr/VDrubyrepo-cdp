'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { subscribeStoreOrdersSync } from '@/lib/store-operational-realtime.client'

export function useCaixaTurnoOpen(
  storeId: string,
  initialOpen: boolean
): boolean {
  const [open, setOpen] = useState(initialOpen)

  const refresh = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('caixas_turnos')
      .select('id')
      .eq('store_id', storeId)
      .eq('status', 'aberto')
      .maybeSingle()
    setOpen(Boolean(data?.id))
  }, [storeId])

  useEffect(() => {
    setOpen(initialOpen)
  }, [initialOpen])

  useEffect(() => {
    void refresh()
    const unsubscribe = subscribeStoreOrdersSync(storeId, (detail) => {
      if (detail.source === 'caixas_turnos') void refresh()
    })
    return unsubscribe
  }, [storeId, refresh])

  return open
}
