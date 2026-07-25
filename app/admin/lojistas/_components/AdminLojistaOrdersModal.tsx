'use client'

import type { StoreOrderRow } from '@/lib/store-order'
import { useCallback, useEffect, useState } from 'react'

const moneyBr = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d)
}

function orderStatusLabel(status: string | null | undefined): string {
  switch (String(status ?? '').trim().toLowerCase()) {
    case 'pending':
      return 'Pendente'
    case 'preparing':
      return 'A preparar'
    case 'ready':
      return 'Pronto'
    case 'confirmed':
      return 'Em curso'
    case 'delivered':
      return 'Entregue'
    case 'cancelled':
    case 'canceled':
      return 'Cancelado'
    default:
      return status?.trim() || '—'
  }
}

function orderStatusClass(status: string | null | undefined): string {
  switch (String(status ?? '').trim().toLowerCase()) {
    case 'pending':
      return 'bg-red-50 text-red-800 ring-red-200/80'
    case 'preparing':
      return 'bg-orange-50 text-[var(--dash-primary)] ring-orange-200/80'
    case 'ready':
      return 'bg-violet-50 text-violet-900 ring-violet-200/80'
    case 'confirmed':
      return 'bg-sky-50 text-sky-900 ring-sky-200/80'
    case 'delivered':
      return 'bg-emerald-50 text-emerald-900 ring-emerald-200/80'
    case 'cancelled':
    case 'canceled':
      return 'bg-[#f3f4f6] text-[#6b7280] ring-black/10'
    default:
      return 'bg-[#f3f4f6] text-[#6b7280] ring-black/10'
  }
}

function orderSourceLabel(source: string | null | undefined): string {
  const s = String(source ?? '').trim().toLowerCase()
  if (s === 'waiter') return 'Garçom'
  if (s === 'autoatendimento') return 'QR mesa'
  if (s === 'pdv') return 'Balcão'
  if (s === 'site_live' || s === 'menu_link' || s === 'slug') return 'Cardápio online'
  if (s === 'ifood' || s === 'rappi' || s === 'uber_eats') return s
  return source?.trim() || '—'
}

function orderTotal(order: StoreOrderRow): number {
  const n =
    typeof order.total === 'number'
      ? order.total
      : Number(String(order.total ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function shortOrderId(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase()
}

type Props = {
  open: boolean
  storeId: string | null
  storeName: string
  onClose: () => void
}

export function AdminLojistaOrdersModal({
  open,
  storeId,
  storeName,
  onClose,
}: Props) {
  const [orders, setOrders] = useState<StoreOrderRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (!storeId) return
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/admin/lojistas/${storeId}/orders?page=${nextPage}&limit=50`,
          { credentials: 'include' }
        )
        const data = (await res.json()) as {
          ok?: boolean
          error?: string
          orders?: StoreOrderRow[]
          total?: number
          hasMore?: boolean
        }
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Erro ao carregar pedidos.')
        }
        const rows = data.orders ?? []
        setOrders((prev) => (replace ? rows : [...prev, ...rows]))
        setTotal(data.total ?? 0)
        setHasMore(Boolean(data.hasMore))
        setPage(nextPage)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar pedidos.')
        if (replace) setOrders([])
      } finally {
        setLoading(false)
      }
    },
    [storeId]
  )

  useEffect(() => {
    if (!open || !storeId) return
    setOrders([])
    setTotal(0)
    setPage(1)
    setHasMore(false)
    void loadPage(1, true)
  }, [open, storeId, loadPage])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-3 sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Histórico de pedidos"
        className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3">
          <div className="min-w-0 pr-3">
            <h2 className="truncate text-base font-semibold text-[#1a1614]">
              Histórico de pedidos
            </h2>
            <p className="truncate text-xs text-[#6b7280]">{storeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-xl leading-none text-[#6b7280] hover:bg-[#f5f5f5]"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : loading && orders.length === 0 ? (
            <p className="text-sm text-[#6b7280]">A carregar pedidos…</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-[#6b7280]">Nenhum pedido registado para esta loja.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-[#6b7280]">
                {total} pedido{total === 1 ? '' : 's'} no total
              </p>
              <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-[var(--card-border)] bg-[#f9fafb] text-[10px] font-semibold uppercase tracking-wide text-[#6b7280]">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2">Data</th>
                      <th className="whitespace-nowrap px-3 py-2">Ref.</th>
                      <th className="whitespace-nowrap px-3 py-2">Cliente</th>
                      <th className="whitespace-nowrap px-3 py-2">Origem</th>
                      <th className="whitespace-nowrap px-3 py-2">Estado</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--card-border)]">
                    {orders.map((order) => (
                      <tr key={order.id} className="bg-white">
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[#374151]">
                          {fmtDateTime(order.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-[#6b7280]">
                          {shortOrderId(order.id)}
                        </td>
                        <td className="max-w-[10rem] truncate px-3 py-2 text-[#1a1614]">
                          {order.customer_name?.trim() || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-[#374151]">
                          {orderSourceLabel(order.source)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${orderStatusClass(order.status)}`}
                          >
                            {orderStatusLabel(order.status)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium text-[#1a1614]">
                          {moneyBr.format(orderTotal(order))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasMore ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void loadPage(page + 1, false)}
                  className="mt-4 w-full rounded-xl border border-[var(--card-border)] bg-white py-2.5 text-sm font-semibold text-[#374151] hover:bg-[#f9fafb] disabled:opacity-50"
                >
                  {loading ? 'A carregar…' : 'Carregar mais'}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
