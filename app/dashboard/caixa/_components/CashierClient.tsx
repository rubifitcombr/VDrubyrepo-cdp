'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import type { StoreOrderRow } from '@/lib/store-order'

type SourceKey = 'waiter' | 'pdv' | 'menu_link'
type ShiftState = {
  openedAt: string
  operator: string
  openingCash: number
}
type ShiftHistory = {
  id: string
  openedAt: string
  closedAt: string
  operator: string
  openingCash: number
  revenue: number
  orderCount: number
}

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function mapSource(source: string | null | undefined): SourceKey {
  const s = (source || '').trim().toLowerCase()
  if (s === 'waiter') return 'waiter'
  if (s === 'pdv') return 'pdv'
  return 'menu_link'
}

function sourceLabel(k: SourceKey): string {
  if (k === 'waiter') return 'Garçom'
  if (k === 'pdv') return 'Balcão'
  return 'Link de cardápio'
}

function paymentLabel(v: string | null | undefined): string {
  const p = String(v ?? '').trim().toLowerCase()
  if (p === 'pix') return 'PIX'
  if (p === 'card') return 'Cartão'
  if (p === 'cash') return 'Dinheiro'
  return '—'
}

function periodStart(period: 'today' | '7d' | '30d'): number {
  const now = Date.now()
  if (period === 'today') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (period === '7d') return now - 7 * 86400000
  return now - 30 * 86400000
}

export function CashierClient({
  initialOrders,
  operatorLabel,
}: {
  initialOrders: StoreOrderRow[]
  operatorLabel: string
}) {
  const [orders, setOrders] = useState<StoreOrderRow[]>(initialOrders)
  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('today')
  const [sourceFilter, setSourceFilter] = useState<'all' | SourceKey>('all')
  const [shift, setShift] = useState<ShiftState | null>(null)
  const [openingCashInput, setOpeningCashInput] = useState('')
  const [shiftHistory, setShiftHistory] = useState<ShiftHistory[]>([])
  const [paymentDraftByOrder, setPaymentDraftByOrder] = useState<Record<string, 'cash' | 'pix' | 'card'>>({})
  const [closingOrderId, setClosingOrderId] = useState<string | null>(null)
  const [cashierError, setCashierError] = useState<string | null>(null)
  const storageKey = 'vyria.cashier.shift.v1'
  const historyKey = 'vyria.cashier.shift.history.v1'

  const filteredOrders = useMemo(() => {
    const from = periodStart(period)
    return orders.filter((o) => {
      const created = new Date(o.created_at).getTime()
      if (!Number.isFinite(created) || created < from) return false
      if (o.status === 'cancelled') return false
      if (sourceFilter === 'all') return true
      return mapSource(o.source) === sourceFilter
    })
  }, [orders, period, sourceFilter])

  const summary = useMemo(() => {
    const base: Record<SourceKey, { count: number; total: number }> = {
      waiter: { count: 0, total: 0 },
      pdv: { count: 0, total: 0 },
      menu_link: { count: 0, total: 0 },
    }
    for (const o of filteredOrders) {
      const k = mapSource(o.source)
      const total = Number(o.total) || 0
      base[k].count += 1
      base[k].total += total
    }
    return base
  }, [filteredOrders])

  const totalCount = filteredOrders.length
  const totalRevenue = summary.waiter.total + summary.pdv.total + summary.menu_link.total
  const avgTicket = totalCount > 0 ? totalRevenue / totalCount : 0

  useEffect(() => {
    try {
      const rawShift = window.localStorage.getItem(storageKey)
      const rawHistory = window.localStorage.getItem(historyKey)
      if (rawShift) setShift(JSON.parse(rawShift) as ShiftState)
      if (rawHistory) setShiftHistory(JSON.parse(rawHistory) as ShiftHistory[])
    } catch {
      // ignore storage errors
    }
  }, [])

  useEffect(() => {
    try {
      if (shift) window.localStorage.setItem(storageKey, JSON.stringify(shift))
      else window.localStorage.removeItem(storageKey)
    } catch {
      // ignore storage errors
    }
  }, [shift])

  useEffect(() => {
    try {
      window.localStorage.setItem(historyKey, JSON.stringify(shiftHistory.slice(0, 10)))
    } catch {
      // ignore storage errors
    }
  }, [shiftHistory])

  function parseOpeningCash() {
    const n = Number(openingCashInput.replace(',', '.').trim())
    if (Number.isNaN(n) || n < 0) return 0
    return n
  }

  function openShift() {
    if (shift) return
    setShift({
      openedAt: new Date().toISOString(),
      operator: operatorLabel,
      openingCash: parseOpeningCash(),
    })
  }

  function closeShift() {
    if (!shift) return
    const openedTs = new Date(shift.openedAt).getTime()
    const shiftOrders = orders.filter((o) => {
      const ts = new Date(o.created_at).getTime()
      return Number.isFinite(ts) && ts >= openedTs && o.status !== 'cancelled'
    })
    const revenue = shiftOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
    const closed: ShiftHistory = {
      id: `${Date.now()}`,
      openedAt: shift.openedAt,
      closedAt: new Date().toISOString(),
      operator: shift.operator,
      openingCash: shift.openingCash,
      revenue,
      orderCount: shiftOrders.length,
    }
    setShiftHistory((prev) => [closed, ...prev])
    setShift(null)
    setOpeningCashInput('')
  }

  const openComandas = useMemo(() => {
    return orders.filter((o) => {
      if (o.status === 'cancelled' || o.status === 'delivered') return false
      const src = mapSource(o.source)
      return src === 'pdv' || src === 'waiter'
    })
  }, [orders])

  function paymentDraft(order: StoreOrderRow): 'cash' | 'pix' | 'card' {
    const existing = paymentDraftByOrder[order.id]
    if (existing) return existing
    const current = String(order.payment_method ?? '').toLowerCase()
    if (current === 'pix' || current === 'card' || current === 'cash') return current
    return 'cash'
  }

  async function closeComanda(order: StoreOrderRow) {
    setCashierError(null)
    const paymentMethod = paymentDraft(order)
    setClosingOrderId(order.id)
    try {
      const res = await dashboardFetch('/api/cashier/orders/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, paymentMethod }),
      })
      if (res.status === 403) return
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        order?: { id: string; status: string; payment_method: string; notes?: string }
      }
      if (!res.ok) {
        setCashierError(json.error || 'Não foi possível fechar a comanda.')
        return
      }
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? {
                ...o,
                status: json.order?.status || 'delivered',
                payment_method: json.order?.payment_method || paymentMethod,
                notes: json.order?.notes ?? o.notes,
              }
            : o
        )
      )
    } finally {
      setClosingOrderId(null)
    }
  }

  function exportCsv() {
    const header = [
      'id',
      'data_hora',
      'responsavel',
      'origem',
      'status',
      'cliente',
      'resumo_itens',
      'total',
      'pagamento',
    ]
    const lines = filteredOrders.map((o) => [
      o.id,
      new Date(o.created_at).toISOString(),
      operatorLabel,
      sourceLabel(mapSource(o.source)),
      o.status || '',
      (o.customer_name || '').replaceAll(';', ','),
      (o.items_summary || '').replaceAll(';', ','),
      String(Number(o.total) || 0),
      o.payment_method || '',
    ])
    const csv = [header, ...lines].map((r) => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `caixa-${period}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <nav className="text-xs text-[#6b7280]">
        <Link href="/dashboard" className="hover:text-[#1a1614]">
          Início
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-[#1a1614]">Caixa</span>
      </nav>

      <header className="mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1a1614] md:text-3xl">
              Caixa
            </h1>
            <p className="mt-1 text-sm text-[#6b7280]">
              Visão completa do faturamento, com divisória por origem dos pedidos.
            </p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-2 text-sm font-semibold text-[#1f2937] shadow-sm hover:bg-[#f9fafb]"
          >
            Exportar CSV
          </button>
        </div>
      </header>

      <section className="mt-5 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1a1614]">Fechamento de caixa por turno</h2>
        {!shift ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs text-[#6b7280]">
              Fundo inicial (R$)
              <input
                type="text"
                inputMode="decimal"
                value={openingCashInput}
                onChange={(e) => setOpeningCashInput(e.target.value)}
                placeholder="0,00"
                className="mt-1 block rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={openShift}
              className="rounded-xl bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white"
            >
              Abrir turno ({operatorLabel})
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-[#374151]">
              Operador: <span className="font-semibold">{shift.operator}</span> · Abertura:{' '}
              <span className="font-semibold">{dateTime.format(new Date(shift.openedAt))}</span>
            </p>
            <p className="text-sm text-[#374151]">
              Fundo inicial: <span className="font-semibold">{money.format(shift.openingCash)}</span>
            </p>
            <button
              type="button"
              onClick={closeShift}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"
            >
              Fechar turno
            </button>
          </div>
        )}
      </section>

      <section className="mt-5 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1a1614]">
          Receber e fechar comanda (PDV/Garçom)
        </h2>
        <p className="mt-1 text-xs text-[#6b7280]">
          Ao fechar, o pedido é marcado como entregue e permanece lançado no Financeiro com o pagamento informado.
        </p>
        {cashierError ? (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{cashierError}</p>
        ) : null}
        {openComandas.length === 0 ? (
          <p className="mt-2 text-sm text-[#6b7280]">Sem comandas abertas de balcão/garçom.</p>
        ) : (
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {openComandas.map((o) => (
              <li
                key={o.id}
                className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-white shadow-sm shadow-black/[0.04]"
              >
                <div className="border-b border-[var(--card-border)] bg-[#fafafa] px-4 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                      {sourceLabel(mapSource(o.source))}
                    </p>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                      Em aberto
                    </span>
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold text-[#1a1614]">
                      {o.customer_name || 'Cliente'}
                    </p>
                    <p className="line-clamp-2 text-sm text-[#374151]">
                      {o.items_summary || 'Comanda'}
                    </p>
                    <p className="text-xs text-[#6b7280]">
                      {dateTime.format(new Date(o.created_at))}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--card-border)] pt-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">
                        Total
                      </p>
                      <p className="text-lg font-bold text-[#1a1614]">
                        {money.format(Number(o.total) || 0)}
                      </p>
                      <p className="text-xs text-[#6b7280]">
                        Atual: {paymentLabel(o.payment_method)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={paymentDraft(o)}
                        onChange={(e) =>
                          setPaymentDraftByOrder((prev) => ({
                            ...prev,
                            [o.id]: e.target.value as 'cash' | 'pix' | 'card',
                          }))
                        }
                        className="rounded-lg border border-[var(--card-border)] bg-white px-2 py-2 text-xs font-semibold text-[#1f2937]"
                      >
                        <option value="cash">Dinheiro</option>
                        <option value="pix">PIX</option>
                        <option value="card">Cartão</option>
                      </select>
                      <button
                        type="button"
                        disabled={closingOrderId === o.id}
                        onClick={() => void closeComanda(o)}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {closingOrderId === o.id ? 'Fechando...' : 'Receber e fechar'}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            Faturamento
          </p>
          <p className="mt-2 text-2xl font-bold text-[#1a1614]">{money.format(totalRevenue)}</p>
        </div>
        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">Pedidos</p>
          <p className="mt-2 text-2xl font-bold text-[#1a1614]">{totalCount}</p>
        </div>
        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            Ticket médio
          </p>
          <p className="mt-2 text-2xl font-bold text-[#1a1614]">{money.format(avgTicket)}</p>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['today', 'Hoje'],
              ['7d', 'Últimos 7 dias'],
              ['30d', 'Últimos 30 dias'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPeriod(id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                period === id
                  ? 'bg-[var(--dash-primary)] text-white'
                  : 'border border-[var(--card-border)] bg-white text-[#374151]'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-[var(--card-border)]" />
          {(['all', 'waiter', 'pdv', 'menu_link'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSourceFilter(id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                sourceFilter === id
                  ? 'bg-[#111827] text-white'
                  : 'border border-[var(--card-border)] bg-white text-[#374151]'
              }`}
            >
              {id === 'all' ? 'Todos' : sourceLabel(id)}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-3">
        {(['waiter', 'pdv', 'menu_link'] as const).map((k) => (
          <div key={k} className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-[#1a1614]">{sourceLabel(k)}</p>
            <p className="mt-2 text-2xl font-bold text-[var(--dash-primary)]">
              {money.format(summary[k].total)}
            </p>
            <p className="text-xs text-[#6b7280]">{summary[k].count} pedidos</p>
          </div>
        ))}
      </section>

      <section className="mt-5 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1a1614]">Lançamentos recentes</h2>
        {filteredOrders.length === 0 ? (
          <p className="mt-2 text-sm text-[#6b7280]">Sem pedidos no filtro selecionado.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {filteredOrders.slice(0, 60).map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--card-border)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#1a1614]">
                    {sourceLabel(mapSource(o.source))} · {o.items_summary || 'Pedido'}
                  </p>
                  <p className="text-xs text-[#6b7280]">
                    {dateTime.format(new Date(o.created_at))}
                  </p>
                </div>
                <span className="text-sm font-bold text-[#1a1614]">
                  {money.format(Number(o.total) || 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {shiftHistory.length > 0 ? (
        <section className="mt-5 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#1a1614]">Histórico de fechamentos</h2>
          <ul className="mt-3 space-y-2">
            {shiftHistory.slice(0, 6).map((h) => (
              <li key={h.id} className="rounded-xl border border-[var(--card-border)] px-3 py-2">
                <p className="text-sm font-semibold text-[#1a1614]">
                  {h.operator} · {dateTime.format(new Date(h.openedAt))} →{' '}
                  {dateTime.format(new Date(h.closedAt))}
                </p>
                <p className="text-xs text-[#6b7280]">
                  Pedidos: {h.orderCount} · Faturamento: {money.format(h.revenue)} · Fundo:{' '}
                  {money.format(h.openingCash)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

