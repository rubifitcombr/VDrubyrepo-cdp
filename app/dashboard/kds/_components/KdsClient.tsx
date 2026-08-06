'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ORDER_SELECT,
  mapStoreOrderRow,
  orderIsVisibleAfterPixConfirmation,
  type StoreOrderRow,
} from '@/lib/store-order'
import type { StorePrintingState } from '@/lib/store-printing'
import {
  openOrderTicketAutoPrintOnConfirm,
  orderTicketVariantFromSource,
} from '@/lib/order-print-window'
import {
  isOperationalSyncTabVisible,
  notifyStoreOrdersChanged,
  subscribeOperationalPolling,
  subscribeOperationalVisibilityRefresh,
  subscribeStoreOrdersSync,
} from '@/lib/store-operational-realtime.client'
import {
  type KdsChannelFilter,
  isKdsKitchenQueueOrder,
  kdsChannelBadgeClass,
  kdsKitchenChannel,
  kdsKitchenChannelLabel,
  kdsKitchenFilterGroup,
  kdsOrderMatchesChannelFilter,
  kdsOrderSubtitle,
  KDS_KITCHEN_STATUSES,
} from '@/lib/kds-order-display'
import { updateOrderStatus } from '@/services/orders'
import {
  kitchenReadyActionLabel,
  kitchenReadyAdvancesFromReady,
  statusAfterKitchenReady,
} from '@/lib/order-status-transitions'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function parseTotal(v: number | string | null | undefined): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

type Col = 'pending' | 'preparing' | 'ready'

const COLS: { id: Col; label: string; match: (s: string | null) => boolean }[] =
  [
    { id: 'pending', label: 'Novos', match: (s) => s === 'pending' },
    { id: 'preparing', label: 'Em preparação', match: (s) => s === 'preparing' },
    { id: 'ready', label: 'Pronto', match: (s) => s === 'ready' },
  ]

export function KdsClient({
  initialOrders,
  storeId,
  storeName,
  printing,
  deliveryPipelineEnabled = true,
  entregadoresEnabled = false,
}: {
  initialOrders: StoreOrderRow[]
  storeId: string
  storeName: string
  printing: StorePrintingState
  deliveryPipelineEnabled?: boolean
  entregadoresEnabled?: boolean
}) {
  const [orders, setOrders] = useState<StoreOrderRow[]>(initialOrders)
  const [channelFilter, setChannelFilter] = useState<KdsChannelFilter>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [liveOk, setLiveOk] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [waNotice, setWaNotice] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const waNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const kitchenOrders = useMemo(
    () => orders.filter(isKdsKitchenQueueOrder),
    [orders]
  )

  const filteredKitchenOrders = useMemo(
    () => kitchenOrders.filter((o) => kdsOrderMatchesChannelFilter(o, channelFilter)),
    [channelFilter, kitchenOrders]
  )

  const channelCounts = useMemo(() => {
    let delivery = 0
    let presencial = 0
    for (const o of kitchenOrders) {
      if (kdsKitchenFilterGroup(kdsKitchenChannel(o)) === 'delivery') delivery += 1
      else presencial += 1
    }
    return { all: kitchenOrders.length, delivery, presencial }
  }, [kitchenOrders])

  const displayNumberById = useMemo(() => {
    const sorted = [...filteredKitchenOrders].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    const m = new Map<string, string>()
    sorted.forEach((o, i) => {
      m.set(o.id, String(i + 1).padStart(3, '0'))
    })
    return m
  }, [filteredKitchenOrders])

  const byColumn = useMemo(() => {
    const map: Record<Col, StoreOrderRow[]> = {
      pending: [],
      preparing: [],
      ready: [],
    }
    for (const o of filteredKitchenOrders) {
      const st = o.status
      for (const c of COLS) {
        if (c.match(st)) {
          map[c.id].push(o)
          break
        }
      }
    }
    for (const k of Object.keys(map) as Col[]) {
      map[k].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    }
    return map
  }, [filteredKitchenOrders])

  const pullOrders = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('store_id', storeId)
      .in('status', [...KDS_KITCHEN_STATUSES])
      .order('created_at', { ascending: false })
      .limit(150)
    if (error) {
      if (/column|does not exist|42P01/i.test(error.message)) {
        setSchemaError(
          'Colunas de pedidos em falta. Aplica supabase/migrations/20260725190006_kds_schema.sql no Supabase.'
        )
      }
      return
    }
    setSchemaError(null)
    if (!data) return
    setOrders(
      (data as Record<string, unknown>[])
        .map(mapStoreOrderRow)
        .filter(orderIsVisibleAfterPixConfirmation)
    )
  }, [storeId])

  useEffect(() => {
    // Busca inicial da fila — pullOrders actualiza estado após fetch async.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount + realtime refresh
    void pullOrders()

    const unsubscribe = subscribeStoreOrdersSync(storeId, (detail) => {
      if (!isOperationalSyncTabVisible()) return
      if (detail.source !== 'orders' && detail.source !== 'order_items') return
      void pullOrders()
      setLiveOk(true)
    })

    const unsubscribeVis = subscribeOperationalVisibilityRefresh(() => {
      void pullOrders()
      setLiveOk(true)
    })

    const unsubscribePoll = subscribeOperationalPolling(storeId, () => {
      void pullOrders()
      setLiveOk(true)
    })

    return () => {
      unsubscribePoll()
      unsubscribe()
      unsubscribeVis()
    }
  }, [storeId, pullOrders])

  useEffect(() => {
    return () => {
      if (waNoticeTimerRef.current) {
        clearTimeout(waNoticeTimerRef.current)
        waNoticeTimerRef.current = null
      }
    }
  }, [])

  function flashWaNotice(message: string) {
    if (waNoticeTimerRef.current) {
      clearTimeout(waNoticeTimerRef.current)
      waNoticeTimerRef.current = null
    }
    setWaNotice(message)
    waNoticeTimerRef.current = setTimeout(() => {
      setWaNotice(null)
      waNoticeTimerRef.current = null
    }, 5000)
  }

  async function patch(orderId: string, status: string) {
    const orderBefore = orders.find((o) => o.id === orderId)
    setBusyId(orderId)
    const { error } = await updateOrderStatus(orderId, status, { storeId })
    setBusyId(null)
    if (error) {
      alert(error.message)
      return
    }
    setOrders((prev) =>
      prev
        .map((o) => (o.id === orderId ? { ...o, status } : o))
        .filter(isKdsKitchenQueueOrder)
    )
    notifyStoreOrdersChanged(storeId, { eventType: 'UPDATE' })
    if (
      status === 'preparing' &&
      printing.print_auto_on_confirm &&
      orderBefore
    ) {
      const ref =
        displayNumberById.get(orderId) ?? orderId.replace(/-/g, '').slice(0, 8)
      const ok = openOrderTicketAutoPrintOnConfirm(
        orderId,
        {
          storeName,
          order: { ...orderBefore, status: 'preparing' },
          orderDisplayRef: ref,
          printing: {
            print_include_customer_details:
              printing.print_include_customer_details,
            print_delivery_copy: printing.print_delivery_copy,
            print_paper_mm: printing.print_paper_mm,
          },
          variant: orderTicketVariantFromSource(orderBefore.source, orderBefore),
        },
        printing
      )
      if (!ok) {
        flashWaNotice(
          'Permite pop-ups neste site para a impressão automática funcionar.'
        )
      }
    }
  }

  function enterFullscreen() {
    const el = rootRef.current
    if (!el) return
    void el.requestFullscreen?.().catch(() => {})
  }

  const filterTabs: { id: KdsChannelFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Todos', count: channelCounts.all },
    { id: 'delivery', label: 'Delivery', count: channelCounts.delivery },
    { id: 'presencial', label: 'Presencial', count: channelCounts.presencial },
  ]

  return (
    <div
      ref={rootRef}
      className="flex min-h-[calc(100vh-4rem)] flex-col bg-[#0f0f0f] text-white"
    >
      {schemaError ? (
        <div className="border-b border-amber-500/40 bg-amber-500/15 px-4 py-3 text-sm text-amber-100 md:px-6">
          {schemaError}
        </div>
      ) : null}

      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 md:px-6">
        <div>
          <nav className="text-xs text-white/50">
            <Link href="/dashboard" className="hover:text-white">
              Início
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/80">KDS</span>
          </nav>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight md:text-xl">
              {storeName}
            </h1>
            {liveOk ? (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-500/40">
                Ao vivo
              </span>
            ) : (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">
                Sync ~20s
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-white/45">
            Cozinha unificada — delivery e presencial sincronizados com Pedidos e Garçom.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/orders"
            className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Pedidos
          </Link>
          <Link
            href="/dashboard/garcom"
            className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Garçom
          </Link>
          <button
            type="button"
            onClick={() => void enterFullscreen()}
            className="rounded-xl bg-[var(--dash-primary)] px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-[var(--dash-primary)]/25"
          >
            Ecrã completo
          </button>
        </div>
      </header>

      <div className="border-b border-white/10 px-3 py-2 md:px-4">
        <div className="flex flex-wrap gap-2">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setChannelFilter(tab.id)}
              className={`rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wide ring-1 transition ${
                channelFilter === tab.id
                  ? 'bg-white text-black ring-white'
                  : 'bg-white/5 text-white/75 ring-white/15 hover:bg-white/10'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 tabular-nums opacity-80">({tab.count})</span>
            </button>
          ))}
        </div>
      </div>

      {waNotice ? (
        <div
          className="mx-3 mt-2 flex items-start justify-between gap-3 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-50 md:mx-4"
          role="status"
        >
          <p className="min-w-0 flex-1 leading-snug">{waNotice}</p>
          <button
            type="button"
            onClick={() => {
              if (waNoticeTimerRef.current) {
                clearTimeout(waNoticeTimerRef.current)
                waNoticeTimerRef.current = null
              }
              setWaNotice(null)
            }}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-100 hover:bg-white/10"
          >
            Fechar
          </button>
        </div>
      ) : null}

      <div className="grid flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-3 md:gap-4 md:p-4">
        {COLS.map((col) => (
          <section
            key={col.id}
            className="flex min-h-[280px] flex-col rounded-2xl border border-white/10 bg-white/[0.04] md:min-h-0"
          >
            <div className="border-b border-white/10 px-3 py-2 md:px-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-white/90">
                {col.label}
              </h2>
              <p className="text-xs text-white/45">
                {byColumn[col.id].length} pedido
                {byColumn[col.id].length === 1 ? '' : 's'}
              </p>
            </div>
            <ul className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 md:p-3">
              {byColumn[col.id].length === 0 ? (
                <li className="rounded-xl border border-dashed border-white/15 py-10 text-center text-sm text-white/40">
                  —
                </li>
              ) : (
                byColumn[col.id].map((o) => {
                  const ref = `#${displayNumberById.get(o.id) ?? '—'}`
                  const busy = busyId === o.id
                  const items =
                    o.items_summary?.trim() || 'Sem resumo de itens.'
                  const channel = kdsKitchenChannel(o)
                  const channelLabel = kdsKitchenChannelLabel(channel)
                  const subtitle = kdsOrderSubtitle(o)
                  const needsPedidosDispatch =
                    col.id === 'ready' &&
                    !kitchenReadyAdvancesFromReady(
                      o,
                      deliveryPipelineEnabled,
                      entregadoresEnabled
                    )
                  return (
                    <li
                      key={o.id}
                      className="rounded-xl border border-white/10 bg-black/30 p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-lg font-black text-[var(--dash-primary)]">
                            {ref}
                          </span>
                          <span
                            className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${kdsChannelBadgeClass(channel)}`}
                          >
                            {channelLabel}
                          </span>
                        </div>
                        <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-300">
                          {money.format(parseTotal(o.total))}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-xs font-semibold text-white/65">
                        {subtitle}
                      </p>
                      <p className="mt-2 line-clamp-4 text-sm leading-snug text-white/85">
                        {items}
                      </p>
                      <div className="mt-3 flex flex-col gap-2">
                        {col.id === 'pending' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patch(o.id, 'preparing')}
                            className="w-full rounded-lg bg-amber-500 px-3 py-2.5 text-sm font-bold text-black"
                          >
                            {busy ? '…' : 'Cozinhar'}
                          </button>
                        ) : null}
                        {col.id === 'preparing' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patch(o.id, 'ready')}
                            className="w-full rounded-lg bg-emerald-500 px-3 py-2.5 text-sm font-bold text-black"
                          >
                            {busy ? '…' : 'Pronto'}
                          </button>
                        ) : null}
                        {col.id === 'ready' ? (
                          needsPedidosDispatch ? (
                            <Link
                              href="/dashboard/orders"
                              className="flex w-full items-center justify-center rounded-lg border border-sky-400/40 bg-sky-500/15 px-3 py-2.5 text-center text-xs font-bold text-sky-100 hover:bg-sky-500/25"
                            >
                              Despachar em Pedidos →
                            </Link>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void patch(
                                  o.id,
                                  statusAfterKitchenReady(
                                    o,
                                    deliveryPipelineEnabled,
                                    entregadoresEnabled
                                  )
                                )
                              }
                              className="w-full rounded-lg bg-sky-500 px-3 py-2.5 text-sm font-bold text-white"
                            >
                              {busy
                                ? '…'
                                : kitchenReadyActionLabel(
                                    o,
                                    deliveryPipelineEnabled,
                                    entregadoresEnabled
                                  )}
                            </button>
                          )
                        ) : null}
                      </div>
                    </li>
                  )
                })
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
