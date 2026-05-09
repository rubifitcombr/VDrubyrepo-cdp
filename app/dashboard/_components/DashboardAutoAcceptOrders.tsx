'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getStoreOpenState } from '@/lib/business-hours'
import {
  ORDER_SELECT,
  mapStoreOrderRow,
  type StoreOrderRow,
} from '@/lib/store-order'
import type { StorePrintingState } from '@/lib/store-printing'
import { openOrderTicketPrintDeduped } from '@/lib/order-print-window'
import { updateOrderStatus } from '@/services/orders'

function buildDisplayRefById(rows: StoreOrderRow[]): Map<string, string> {
  const sorted = [...rows].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  const m = new Map<string, string>()
  sorted.forEach((o, i) => {
    m.set(o.id, String(i + 1).padStart(3, '0'))
  })
  return m
}

/**
 * Aceita pedidos em «Pendente» quando a automação está ativa (painel aberto),
 * e dispara impressão térmica se «Impressão automática ao aceitar» estiver ligada.
 * Impressão também cobre aceite feito no servidor (checkout) quando o painel está aberto.
 */
export function DashboardAutoAcceptOrders({
  storeId,
  storeName,
  businessHours,
  manualClosed,
  autoAcceptOrders,
  printing,
}: {
  storeId: string | null
  storeName: string
  businessHours: unknown
  manualClosed: boolean
  autoAcceptOrders: boolean
  printing: StorePrintingState
}) {
  const attemptedRef = useRef<Set<string>>(new Set())
  const runningRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!storeId || (!autoAcceptOrders && !printing.print_auto_on_confirm)) {
      attemptedRef.current.clear()
      return
    }

    const supabase = createClient()

    async function fetchOrdersSnapshot(): Promise<StoreOrderRow[]> {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
      if (error || !data?.length) return []
      return (data as Record<string, unknown>[]).map(mapStoreOrderRow)
    }

    async function printOrderPreparing(orderId: string) {
      const rows = await fetchOrdersSnapshot()
      const order = rows.find((o) => o.id === orderId)
      if (!order || order.status !== 'preparing') return
      const displayById = buildDisplayRefById(rows)
      const ref =
        displayById.get(orderId) ?? orderId.replace(/-/g, '').slice(0, 8)
      openOrderTicketPrintDeduped(orderId, {
        storeName,
        order,
        orderDisplayRef: ref,
        printing: {
          print_include_customer_details:
            printing.print_include_customer_details,
          print_delivery_copy: printing.print_delivery_copy,
        },
      })
    }

    async function acceptPending() {
      if (!autoAcceptOrders) return
      if (runningRef.current) return
      const { open } = getStoreOpenState(businessHours, { manualClosed })
      if (!open) return

      runningRef.current = true
      try {
        const rows = await fetchOrdersSnapshot()
        if (!rows.length) return

        const displayById = buildDisplayRefById(rows)
        const pending = rows.filter((o) => o.status === 'pending')

        for (const order of pending) {
          if (attemptedRef.current.has(order.id)) continue
          attemptedRef.current.add(order.id)

          const { error: upErr } = await updateOrderStatus(
            order.id,
            'preparing'
          )

          if (upErr) {
            attemptedRef.current.delete(order.id)
            continue
          }

          if (printing.print_auto_on_confirm) {
            const ref =
              displayById.get(order.id) ??
              order.id.replace(/-/g, '').slice(0, 8)
            openOrderTicketPrintDeduped(order.id, {
              storeName,
              order: { ...order, status: 'preparing' },
              orderDisplayRef: ref,
              printing: {
                print_include_customer_details:
                  printing.print_include_customer_details,
                print_delivery_copy: printing.print_delivery_copy,
              },
            })
          }
        }
      } finally {
        runningRef.current = false
      }
    }

    function scheduleAccept() {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        void acceptPending()
      }, 450)
    }

    function handleRealtimeUpdate(payload: {
      old?: Record<string, unknown>
      new?: Record<string, unknown>
    }) {
      if (!printing.print_auto_on_confirm) return
      const oldRow = payload.old as { status?: string } | undefined
      const newRow = payload.new as { status?: string; id?: string } | undefined
      if (
        oldRow?.status !== 'pending' ||
        newRow?.status !== 'preparing' ||
        !newRow?.id
      ) {
        return
      }
      void printOrderPreparing(newRow.id)
    }

    void acceptPending()

    let channel = supabase.channel(`dashboard-order-automation-${storeId}`)

    if (autoAcceptOrders) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${storeId}`,
        },
        () => {
          scheduleAccept()
        }
      )
    }

    if (printing.print_auto_on_confirm) {
      // payload.old com status requer REPLICA IDENTITY FULL em public.orders — ver scripts/supabase-orders-replica-identity.sql
      channel = channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${storeId}`,
        },
        handleRealtimeUpdate
      )
    }

    channel.subscribe()

    const poll =
      autoAcceptOrders ?
        window.setInterval(() => {
          scheduleAccept()
        }, 22000)
      : null

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (poll != null) window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [
    storeId,
    storeName,
    businessHours,
    manualClosed,
    autoAcceptOrders,
    printing.print_auto_on_confirm,
    printing.print_include_customer_details,
    printing.print_delivery_copy,
  ])

  return null
}
