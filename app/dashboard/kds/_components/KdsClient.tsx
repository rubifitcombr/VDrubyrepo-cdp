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
import { openOrderTicketAutoPrintOnConfirm } from '@/lib/order-print-window'
import { updateOrderStatus } from '@/services/orders'

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
}: {
  initialOrders: StoreOrderRow[]
  storeId: string
  storeName: string
  printing: StorePrintingState
}) {
  const [orders, setOrders] = useState<StoreOrderRow[]>(initialOrders)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [liveOk, setLiveOk] = useState(false)
  const [waNotice, setWaNotice] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const waNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const displayNumberById = useMemo(() => {
    const sorted = [...orders].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    const m = new Map<string, string>()
    sorted.forEach((o, i) => {
      m.set(o.id, String(i + 1).padStart(3, '0'))
    })
    return m
  }, [orders])

  const byColumn = useMemo(() => {
    const map: Record<Col, StoreOrderRow[]> = {
      pending: [],
      preparing: [],
      ready: [],
    }
    for (const o of orders) {
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
  }, [orders])

  const pullOrders = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
    if (error || !data) return
    setOrders(
      (data as Record<string, unknown>[])
        .map(mapStoreOrderRow)
        .filter(orderIsVisibleAfterPixConfirmation)
    )
  }, [storeId])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`kds-${storeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${storeId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            const row = mapStoreOrderRow(payload.new as Record<string, unknown>)
            if (!orderIsVisibleAfterPixConfirmation(row)) return
            setOrders((prev) => {
              if (prev.some((p) => p.id === row.id)) return prev
              return [row, ...prev]
            })
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const row = mapStoreOrderRow(payload.new as Record<string, unknown>)
            if (!orderIsVisibleAfterPixConfirmation(row)) {
              setOrders((prev) => prev.filter((p) => p.id !== row.id))
              return
            }
            setOrders((prev) =>
              prev.some((p) => p.id === row.id)
                ? prev.map((p) => (p.id === row.id ? row : p))
                : [row, ...prev]
            )
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const id = String((payload.old as { id?: string }).id ?? '')
            if (id) setOrders((prev) => prev.filter((p) => p.id !== id))
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setLiveOk(true)
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setLiveOk(false)
      })

    const poll = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void pullOrders()
    }, 20000)

    return () => {
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
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
    const { error, deliveryNotified } = await updateOrderStatus(orderId, status)
    setBusyId(null)
    if (error) {
      alert(error.message)
      return
    }
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status } : o))
    )
    if (deliveryNotified) {
      flashWaNotice('Aviso de entrega enviado ao cliente por WhatsApp.')
    }
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
          variant: 'kitchen',
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

  return (
    <div
      ref={rootRef}
      className="flex min-h-[calc(100vh-4rem)] flex-col bg-[#0f0f0f] text-white"
    >
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/orders"
            className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Pedidos
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
                  return (
                    <li
                      key={o.id}
                      className="rounded-xl border border-white/10 bg-black/30 p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-lg font-black text-[var(--dash-primary)]">
                          {ref}
                        </span>
                        <span className="text-sm font-bold tabular-nums text-emerald-300">
                          {money.format(parseTotal(o.total))}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-4 text-sm leading-snug text-white/85">
                        {items}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {col.id === 'pending' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patch(o.id, 'preparing')}
                            className="flex-1 rounded-lg bg-amber-500 px-3 py-2.5 text-sm font-bold text-black min-[480px]:flex-none"
                          >
                            Cozinhar
                          </button>
                        ) : null}
                        {col.id === 'preparing' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patch(o.id, 'ready')}
                            className="flex-1 rounded-lg bg-emerald-500 px-3 py-2.5 text-sm font-bold text-black min-[480px]:flex-none"
                          >
                            Pronto
                          </button>
                        ) : null}
                        {col.id === 'ready' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patch(o.id, 'confirmed')}
                            className="flex-1 rounded-lg bg-sky-500 px-3 py-2.5 text-sm font-bold text-white min-[480px]:flex-none"
                          >
                            Saiu / entrega
                          </button>
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
