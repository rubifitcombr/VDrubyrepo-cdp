'use client'

import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

type Row = {
  productId: string
  name: string
  category: string | null
  active: boolean
  quantity: number
  lowStockAlert: number | null
  updatedAt: string | null
}

type Draft = {
  quantity: string
  low: string
}

export function InventoryClient({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initialRows)
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const o: Record<string, Draft> = {}
    for (const r of initialRows) {
      o[r.productId] = {
        quantity: String(r.quantity),
        low: r.lowStockAlert == null ? '' : String(r.lowStockAlert),
      }
    }
    return o
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'low' | 'out' | 'inactive'>(
    'all'
  )
  const [page, setPage] = useState(1)
  const pageSize = 25

  useEffect(() => {
    setRows(initialRows)
    const o: Record<string, Draft> = {}
    for (const r of initialRows) {
      o[r.productId] = {
        quantity: String(r.quantity),
        low: r.lowStockAlert == null ? '' : String(r.lowStockAlert),
      }
    }
    setDrafts(o)
  }, [initialRows])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ca = (a.category || '').localeCompare(b.category || '', 'pt')
      if (ca !== 0) return ca
      return a.name.localeCompare(b.name, 'pt')
    })
  }, [rows])

  const stats = useMemo(() => {
    let out = 0
    let low = 0
    let inactive = 0
    for (const r of rows) {
      const d = drafts[r.productId]
      const qty = Math.max(0, Math.floor(parseFloat((d?.quantity || '0').replace(',', '.')) || 0))
      const lowNum =
        !d || d.low.trim() === ''
          ? null
          : Math.max(0, Math.floor(parseFloat(d.low.replace(',', '.')) || 0))
      if (!r.active) {
        inactive += 1
      } else if (qty <= 0) {
        out += 1
      } else if (lowNum != null && lowNum > 0 && qty <= lowNum) {
        low += 1
      }
    }
    return { total: rows.length, out, low, inactive }
  }, [rows, drafts])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sorted.filter((r) => {
      const d = drafts[r.productId]
      const qty = Math.max(0, Math.floor(parseFloat((d?.quantity || '0').replace(',', '.')) || 0))
      const lowNum =
        !d || d.low.trim() === ''
          ? null
          : Math.max(0, Math.floor(parseFloat(d.low.replace(',', '.')) || 0))
      const isOut = r.active && qty <= 0
      const isLow = r.active && lowNum != null && lowNum > 0 && qty > 0 && qty <= lowNum
      const isOk = r.active && !isOut && !isLow

      const statusMatches =
        statusFilter === 'all'
          ? true
          : statusFilter === 'inactive'
            ? !r.active
            : statusFilter === 'out'
              ? isOut
              : statusFilter === 'low'
                ? isLow
                : isOk
      if (!statusMatches) return false

      if (!q) return true
      const name = r.name.toLowerCase()
      const cat = (r.category || '').toLowerCase()
      return name.includes(q) || cat.includes(q)
    })
  }, [sorted, query, statusFilter, drafts])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageRows = useMemo(() => {
    const safePage = Math.min(Math.max(1, page), totalPages)
    const start = (safePage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, totalPages])

  useEffect(() => {
    setPage(1)
  }, [query, statusFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const dirty = useMemo(() => {
    for (const r of rows) {
      const d = drafts[r.productId]
      if (!d) continue
      const qty = Math.max(0, Math.floor(parseFloat(d.quantity.replace(',', '.')) || 0))
      const low =
        d.low.trim() === '' ? null : Math.max(0, Math.floor(parseFloat(d.low.replace(',', '.')) || 0))
      if (qty !== r.quantity || low !== r.lowStockAlert) return true
    }
    return false
  }, [rows, drafts])

  const updateDraft = useCallback(
    (productId: string, patch: Partial<Draft>) => {
      setSuccess(false)
      setError(null)
      setDrafts((prev) => ({
        ...prev,
        [productId]: { ...prev[productId], ...patch },
      }))
    },
    []
  )

  const save = useCallback(async () => {
    setError(null)
    setSuccess(false)
    setSaving(true)
    try {
      const items = rows.map((r) => {
        const d = drafts[r.productId] ?? {
          quantity: '0',
          low: '',
        }
        const qty = Math.max(0, Math.floor(parseFloat(d.quantity.replace(',', '.')) || 0))
        const lowRaw = d.low.trim()
        const low =
          lowRaw === ''
            ? null
            : Math.max(0, Math.floor(parseFloat(lowRaw.replace(',', '.')) || 0))
        return {
          product_id: r.productId,
          quantity: qty,
          low_stock_alert: low,
        }
      })

      const res = await dashboardFetch('/api/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (res.status === 403) return
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          typeof json.error === 'string'
            ? json.error
            : 'Não foi possível guardar.'
        )
        return
      }
      setSuccess(true)
      setRows((prev) =>
        prev.map((r) => {
          const d = drafts[r.productId]
          if (!d) return r
          const qty = Math.max(0, Math.floor(parseFloat(d.quantity.replace(',', '.')) || 0))
          const low =
            d.low.trim() === ''
              ? null
              : Math.max(0, Math.floor(parseFloat(d.low.replace(',', '.')) || 0))
          return { ...r, quantity: qty, lowStockAlert: low }
        })
      )
      window.setTimeout(() => setSuccess(false), 4000)
    } finally {
      setSaving(false)
    }
  }, [drafts, rows])

  const applyLowAlertToAll = useCallback(() => {
    setDrafts((prev) => {
      const next = { ...prev }
      for (const r of rows) {
        const base = next[r.productId] ?? { quantity: '0', low: '' }
        if (!base.low.trim()) {
          const suggested = Math.max(1, Math.ceil((Number(base.quantity) || 0) * 0.2))
          next[r.productId] = { ...base, low: String(suggested) }
        }
      }
      return next
    })
    setSuccess(false)
    setError(null)
  }, [rows])

  const resetAll = useCallback(() => {
    const o: Record<string, Draft> = {}
    for (const r of rows) {
      o[r.productId] = {
        quantity: String(r.quantity),
        low: r.lowStockAlert == null ? '' : String(r.lowStockAlert),
      }
    }
    setDrafts(o)
    setSuccess(false)
    setError(null)
  }, [rows])

  return (
    <div className="mt-4 space-y-6 pb-10">
      <header>
        <h1 className="font-brand text-2xl font-bold text-vyria-navy md:text-3xl">
          Estoque
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-vyria-navy-muted">
          Define quantidades e alertas por produto. Com stock registado, cada
          venda no site ou no PDV desconta automaticamente; cancelar o pedido em
          Pedidos repõe o stock. Produtos sem linha aqui continuam ilimitados.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--card-border)] bg-white px-3 py-1 text-xs font-semibold text-vyria-navy">
            Total: {stats.total}
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
            Baixo: {stats.low}
          </span>
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800">
            Zerado: {stats.out}
          </span>
          <span className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
            Inativos: {stats.inactive}
          </span>
        </div>
      </header>

      <div className="rounded-2xl border border-[var(--card-border)] bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por produto ou categoria"
            className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm outline-none ring-[var(--dash-primary)] focus:ring-2 lg:max-w-md"
          />
          <div className="flex flex-wrap gap-2">
            {[
              ['all', 'Todos'],
              ['ok', 'OK'],
              ['low', 'Baixo'],
              ['out', 'Sem estoque'],
              ['inactive', 'Inativos'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id as 'all' | 'ok' | 'low' | 'out' | 'inactive')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  statusFilter === id
                    ? 'bg-[var(--dash-primary)] text-white'
                    : 'border border-[var(--card-border)] bg-white text-vyria-navy-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      {success ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          Estoque atualizado.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-zinc-50/90 text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
                <th className="px-4 py-3">Produto</th>
                <th className="w-28 px-2 py-3">Categoria</th>
                <th className="w-28 px-2 py-3">Qtd.</th>
                <th className="w-32 px-2 py-3">Alerta ≤</th>
                <th className="w-20 px-2 py-3">Estado</th>
                <th className="w-40 px-2 py-3">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const d = drafts[r.productId] ?? {
                  quantity: '0',
                  low: '',
                }
                const qty = Math.max(
                  0,
                  Math.floor(parseFloat(d.quantity.replace(',', '.')) || 0)
                )
                const lowNum =
                  d.low.trim() === ''
                    ? null
                    : Math.max(
                        0,
                        Math.floor(parseFloat(d.low.replace(',', '.')) || 0)
                      )
                const warn =
                  lowNum != null && lowNum > 0 && qty <= lowNum
                return (
                  <tr
                    key={r.productId}
                    className="border-b border-[var(--card-border)] last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-vyria-navy">
                      <span className="line-clamp-2">{r.name}</span>
                    </td>
                    <td className="px-2 py-3 text-xs text-vyria-navy-muted">
                      {r.category || '—'}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        className="w-full rounded-lg border border-[var(--card-border)] px-2 py-2 tabular-nums outline-none ring-[var(--dash-primary)] focus:ring-2"
                        value={d.quantity}
                        onChange={(e) =>
                          updateDraft(r.productId, { quantity: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        placeholder="—"
                        className="w-full rounded-lg border border-[var(--card-border)] px-2 py-2 tabular-nums outline-none ring-[var(--dash-primary)] focus:ring-2"
                        value={d.low}
                        onChange={(e) =>
                          updateDraft(r.productId, { low: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-2 py-3">
                      {!r.active ? (
                        <span className="text-xs text-zinc-400">Inativo</span>
                      ) : warn ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          Baixo
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-700">OK</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-xs text-vyria-navy-muted">
                      {r.updatedAt
                        ? new Date(r.updatedAt).toLocaleString('pt-BR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-white px-3 py-2 text-xs text-vyria-navy-muted">
          <span>
            Mostrando {(Math.min(page, totalPages) - 1) * pageSize + 1}-
            {Math.min(Math.min(page, totalPages) * pageSize, filtered.length)} de {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-1.5 font-semibold text-vyria-navy disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="font-semibold text-vyria-navy">
              Página {Math.min(page, totalPages)} de {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-1.5 font-semibold text-vyria-navy disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      ) : null}
      {sorted.length > 0 && filtered.length === 0 ? (
        <p className="text-sm text-vyria-navy-muted">
          Nenhum item encontrado para os filtros atuais.
        </p>
      ) : null}

      {sorted.length === 0 ? (
        <p className="text-sm text-vyria-navy-muted">
          Ainda não há produtos. Cria itens em{' '}
          <Link
            href="/dashboard/menu"
            className="font-semibold text-[var(--dash-primary)] underline"
          >
            Produtos
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={applyLowAlertToAll}
            className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-[var(--card-border)] bg-white px-4 text-sm font-semibold text-vyria-navy transition hover:bg-zinc-50 disabled:opacity-50"
          >
            Preencher alertas faltantes
          </button>
          <button
            type="button"
            disabled={saving || !dirty}
            onClick={resetAll}
            className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-[var(--card-border)] bg-white px-4 text-sm font-semibold text-vyria-navy-muted transition hover:bg-zinc-50 disabled:opacity-50"
          >
            Descartar alterações
          </button>
          <button
            type="button"
            disabled={saving || !dirty}
            onClick={() => void save()}
            className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-[var(--dash-primary)] px-8 text-base font-bold text-white shadow-md shadow-[var(--dash-primary)]/30 transition enabled:hover:opacity-95 enabled:active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? 'A guardar…' : 'Guardar estoque'}
          </button>
        </div>
      )}
    </div>
  )
}
