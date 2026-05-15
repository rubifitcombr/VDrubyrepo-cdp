'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ORDER_SELECT,
  mapStoreOrderRow,
  type StoreOrderRow,
} from '@/lib/store-order'
import type { StorePrintingState } from '@/lib/store-printing'
import { openOrderTicketPrintDeduped, orderTicketVariantFromSource } from '@/lib/order-print-window'
import { slugChannelSourcesForSupabaseIn, isSlugChannelOrderSource } from '@/lib/slug-channel-orders'
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

function isOrderPendingStatus(status: string | null | undefined): boolean {
  const s = (status ?? '').trim().toLowerCase()
  return s === 'pending' || s === ''
}

/**
 * Aceita pedidos em «Pendente» quando a automação está ativa, e dispara impressão térmica se
 * «Impressão automática ao aceitar» estiver ligada — com o painel em **qualquer** rota do
 * dashboard (não só /dashboard/orders): Realtime + polling + catch-up ao voltar à aba.
 *
 * Cobre cardápio/slug, QR de mesa, Garçom e PDV (pendente → preparando), bem como transições
 * feitas no servidor (checkout com aceite automático). Realtime usa INSERT e UPDATE explícitos
 * para o aceite automático mesmo sem «impressão ao aceitar» (evita depender de `event: '*'`).
 * O mapa de estados tolera ausência de
 * `payload.old` em UPDATEs (REPLICA IDENTITY).
 */
export function DashboardAutoAcceptOrders({
  storeId,
  storeName,
  manualClosed,
  autoAcceptOrders,
  printing,
  slugChannelSourcesOnly = false,
}: {
  storeId: string | null
  storeName: string
  manualClosed: boolean
  autoAcceptOrders: boolean
  printing: StorePrintingState
  slugChannelSourcesOnly?: boolean
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
      let q = supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('store_id', storeId)
      if (slugChannelSourcesOnly) {
        q = q.in('source', slugChannelSourcesForSupabaseIn())
      }
      const { data, error } = await q.order('created_at', { ascending: false })
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
      /** Realtime já traz a linha em «preparando»: imprime de imediato sem esperar replicação. */
      if (trackPrint && newRowHint) {
        const hinted = mapStoreOrderRow(newRowHint)
        if (hinted.id === orderId && hinted.status === 'preparing') {
          const rows = await fetchOrdersSnapshot()
          const fromDb = rows.find((o) => o.id === orderId)
          const order =
            fromDb?.status === 'preparing' ? fromDb : hinted
          if (order.status === 'preparing') {
            const displayRows = rows.some((r) => r.id === orderId)
              ? rows
              : [...rows, order]
            const displayById = buildDisplayRefById(displayRows)
            const ref =
              displayById.get(orderId) ??
              orderId.replace(/-/g, '').slice(0, 8)
            const opened = openOrderTicketPrintDeduped(orderId, {
              storeName,
              order,
              orderDisplayRef: ref,
              printing: {
                print_include_customer_details:
                  printing.print_include_customer_details,
                print_delivery_copy: printing.print_delivery_copy,
                print_paper_mm: printing.print_paper_mm,
              },
              variant: orderTicketVariantFromSource(order.source, order),
            })
            if (opened) return
          }
        }
      }

      const delaysMs = [0, 40, 100, 240, 600, 1400]
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
          variant: orderTicketVariantFromSource(order.source, order),
        })
        return
      }
    }

    /**
     * Garante impressão mesmo se o evento Realtime falhar ou o separador estiver em segundo plano.
     * Compara com `lastOrderStatusRef` (alimentado pelo seed, INSERT/UPDATE e polls anteriores).
     */
    async function pollPrintCatchUp() {
      if (!trackPrint || !storeId) return
      try {
        const rows = await fetchOrdersSnapshot()
        const m = lastOrderStatusRef.current
        for (const r of rows.slice(0, 400)) {
          const id = r.id
          const st = (r.status || '').trim() || 'pending'
          const prev = m.get(id)
          if (st === 'preparing' && prev !== 'preparing') {
            void printOrderPreparing(id, undefined)
          }
          m.set(id, st)
        }
      } catch {
        /* ignore */
      }
    }

    async function acceptPending() {
      if (!autoAcceptOrders) return
      if (runningRef.current) return
      // Só respeitamos fecho manual (inclui alinhamento por «Fechar fora de horas» no layout).
      // O horário do cardápio público não bloqueia aqui: pedidos PDV/garçom/QR podem existir
      // fora desse intervalo e ainda precisam de aceite automático.
      if (manualClosed) return

      runningRef.current = true
      try {
        const rows = await fetchOrdersSnapshot()
        if (!rows.length) return

        const displayById = buildDisplayRefById(rows)
        const pending = rows.filter((o) => isOrderPendingStatus(o.status))

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
              variant: orderTicketVariantFromSource(order.source, order),
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
      }, 220)
    }

    function onOrderInsert(payload: { new?: Record<string, unknown> }) {
      if (!payload.new) return
      if (
        slugChannelSourcesOnly &&
        !isSlugChannelOrderSource(payload.new.source as string | null)
      ) {
        return
      }
      if (trackPrint) {
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
      if (autoAcceptOrders) scheduleAccept()
    }

    function onOrderUpdate(payload: {
      new?: Record<string, unknown>
      old?: Record<string, unknown>
    }) {
      if (!payload.new) return
      if (
        slugChannelSourcesOnly &&
        !isSlugChannelOrderSource(payload.new.source as string | null)
      ) {
        return
      }
      if (trackPrint) {
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
      if (autoAcceptOrders) scheduleAccept()
    }

    void acceptPending()
    if (trackPrint) void pollPrintCatchUp()

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      void acceptPending()
      if (trackPrint) void pollPrintCatchUp()
    }
    if (autoAcceptOrders || trackPrint) {
      document.addEventListener('visibilitychange', onVisibility)
    }

    let channel = supabase.channel(`dashboard-order-automation-${storeId}`)

    if (trackPrint || autoAcceptOrders) {
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

    channel.subscribe()

    const pollAccept =
      autoAcceptOrders ?
        window.setInterval(() => {
          scheduleAccept()
        }, 22000)
      : null

    const pollPrint =
      trackPrint ?
        window.setInterval(() => {
          void pollPrintCatchUp()
        }, 12000)
      : null

    return () => {
      if (autoAcceptOrders || trackPrint) {
        document.removeEventListener('visibilitychange', onVisibility)
      }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (pollAccept != null) window.clearInterval(pollAccept)
      if (pollPrint != null) window.clearInterval(pollPrint)
      void supabase.removeChannel(channel)
      orderStatusMap.clear()
    }
  }, [
    storeId,
    storeName,
    manualClosed,
    autoAcceptOrders,
    slugChannelSourcesOnly,
    printing.print_auto_on_confirm,
    printing.print_include_customer_details,
    printing.print_delivery_copy,
    printing.print_paper_mm,
  ])

  return null
}
