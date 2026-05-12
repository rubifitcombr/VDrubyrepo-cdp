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
import { openOrderTicketPrintDeduped, orderTicketVariantFromSource } from '@/lib/order-print-window'
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
 * Cobre pedidos do cardápio/slug, QR de mesa, Garçom e PDV (pendente → preparando), bem como
 * transições já feitas no servidor (checkout com aceite automático). Realtime INSERT/UPDATE +
 * mapa de estados (não depende de REPLICA IDENTITY FULL em `orders`).
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
  /** Último estado conhecido por pedido — para detectar transição → preparando sem `payload.old`. */
  const lastOrderStatusRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (!storeId || (!autoAcceptOrders && !printing.print_auto_on_confirm)) {
      attemptedRef.current.clear()
      lastOrderStatusRef.current.clear()
      return
    }

    const orderStatusMap = lastOrderStatusRef.current

    const supabase = createClient()
    const trackPrint = printing.print_auto_on_confirm

    async function fetchOrdersSnapshot(): Promise<StoreOrderRow[]> {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
      if (error || !data?.length) return []
      return (data as Record<string, unknown>[]).map(mapStoreOrderRow)
    }

    async function seedStatusMapFromServer() {
      if (!trackPrint) return
      const rows = await fetchOrdersSnapshot()
      const m = lastOrderStatusRef.current
      for (const r of rows.slice(0, 400)) {
        if (r.id) m.set(r.id, (r.status || '').trim() || 'pending')
      }
    }

    void seedStatusMapFromServer()

    async function printOrderPreparing(
      orderId: string,
      newRowHint?: Record<string, unknown>
    ) {
      const delaysMs = [0, 80, 200, 500, 1200, 2500]
      for (let i = 0; i < delaysMs.length; i++) {
        const wait = delaysMs[i]!
        if (wait > 0) {
          await new Promise((r) => setTimeout(r, wait))
        }

        const rows = await fetchOrdersSnapshot()
        const fromDb = rows.find((o) => o.id === orderId)

        let order: StoreOrderRow | undefined
        if (fromDb?.status === 'preparing') {
          order = fromDb
        } else if (newRowHint && String(newRowHint.id ?? '') === orderId) {
          const hinted = mapStoreOrderRow(newRowHint)
          if (hinted.status === 'preparing') {
            order = hinted
          }
        }

        if (!order || order.status !== 'preparing') continue

        const displayRows =
          rows.some((r) => r.id === orderId) ? rows : [...rows, order]
        const displayById = buildDisplayRefById(displayRows)
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
            print_paper_mm: printing.print_paper_mm,
          },
          variant: orderTicketVariantFromSource(order.source),
        })
        return
      }
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

          if (trackPrint) {
            lastOrderStatusRef.current.set(order.id, 'preparing')
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
                print_paper_mm: printing.print_paper_mm,
              },
              variant: orderTicketVariantFromSource(order.source),
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

    function onOrderInsert(payload: { new?: Record<string, unknown> }) {
      if (!trackPrint || !payload.new) return
      const raw = payload.new
      const id = String(raw.id ?? '')
      if (!id) return
      const status =
        typeof raw.status === 'string' && raw.status.trim()
          ? raw.status.trim()
          : 'pending'
      lastOrderStatusRef.current.set(id, status)
      if (status === 'preparing') {
        void printOrderPreparing(id, raw)
      }
    }

    function onOrderUpdate(payload: {
      new?: Record<string, unknown>
      old?: Record<string, unknown>
    }) {
      if (!trackPrint || !payload.new) return
      const raw = payload.new
      const id = String(raw.id ?? '')
      if (!id) return
      const newStatus =
        typeof raw.status === 'string' && raw.status.trim()
          ? raw.status.trim()
          : ''
      const oldRaw = payload.old as { status?: unknown } | undefined
      const oldFromPayload =
        typeof oldRaw?.status === 'string' ? oldRaw.status.trim() : undefined
      const prevFromMap = lastOrderStatusRef.current.get(id)
      const prev = oldFromPayload ?? prevFromMap

      if (newStatus === 'preparing' && prev !== 'preparing') {
        void printOrderPreparing(id, raw)
      }
      lastOrderStatusRef.current.set(id, newStatus || prev || 'pending')
    }

    void acceptPending()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acceptPending()
    }
    if (autoAcceptOrders) {
      document.addEventListener('visibilitychange', onVisibility)
    }

    let channel = supabase.channel(`dashboard-order-automation-${storeId}`)

    if (trackPrint) {
      channel = channel
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'orders',
            filter: `store_id=eq.${storeId}`,
          },
          (payload) => {
            onOrderInsert(payload as { new?: Record<string, unknown> })
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `store_id=eq.${storeId}`,
          },
          (payload) => {
            onOrderUpdate(
              payload as {
                new?: Record<string, unknown>
                old?: Record<string, unknown>
              }
            )
          }
        )
    }

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

    channel.subscribe()

    const poll =
      autoAcceptOrders ?
        window.setInterval(() => {
          scheduleAccept()
        }, 22000)
      : null

    return () => {
      if (autoAcceptOrders) {
        document.removeEventListener('visibilitychange', onVisibility)
      }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (poll != null) window.clearInterval(poll)
      void supabase.removeChannel(channel)
      orderStatusMap.clear()
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
    printing.print_paper_mm,
  ])

  return null
}
