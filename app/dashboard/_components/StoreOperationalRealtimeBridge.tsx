'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  dispatchStoreOrdersSync,
  type StoreOrdersSyncSource,
} from '@/lib/store-operational-realtime.client'

type Props = {
  storeId: string | null
}

/**
 * Uma única subscrição Supabase Realtime por loja no painel.
 * Propaga mudanças de comandas/mesas/caixa a todas as janelas (KDS, garçom, caixa, etc.).
 */
export function StoreOperationalRealtimeBridge({ storeId }: Props) {
  useEffect(() => {
    if (!storeId) return
    const activeStoreId = storeId

    const supabase = createClient()
    let debounceTimer: number | null = null

    function notify(source: StoreOrdersSyncSource, eventType?: string) {
      if (debounceTimer) window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null
        dispatchStoreOrdersSync({ storeId: activeStoreId, source, eventType })
      }, 120)
    }

    const channel = supabase
      .channel(`store-ops-bridge-${activeStoreId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${activeStoreId}`,
        },
        (payload) => {
          notify('orders', payload.eventType)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items',
        },
        (payload) => {
          notify('order_items', payload.eventType)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'store_tables',
          filter: `store_id=eq.${activeStoreId}`,
        },
        (payload) => {
          notify('store_tables', payload.eventType)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'caixas_turnos',
          filter: `store_id=eq.${activeStoreId}`,
        },
        (payload) => {
          notify('caixas_turnos', payload.eventType)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'caixa_movimentacoes',
          filter: `store_id=eq.${activeStoreId}`,
        },
        (payload) => {
          notify('caixa_movimentacoes', payload.eventType)
        }
      )
      .subscribe()

    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer)
      void supabase.removeChannel(channel)
    }
  }, [storeId])

  return null
}
