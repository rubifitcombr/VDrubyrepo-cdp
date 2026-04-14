'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'

type Row = {
  productId: string
  name: string
  category: string | null
  active: boolean
  quantity: number
  lowStockAlert: number | null
}

type Draft = {
  quantity: string
  low: string
}

export function InventoryClient({ initialRows }: { initialRows: Row[] }) {
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

  const sorted = useMemo(() => {
    return [...initialRows].sort((a, b) => {
      const ca = (a.category || '').localeCompare(b.category || '', 'pt')
      if (ca !== 0) return ca
      return a.name.localeCompare(b.name, 'pt')
    })
  }, [initialRows])

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
      const items = initialRows.map((r) => {
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

      const res = await fetch('/api/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
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
      window.setTimeout(() => setSuccess(false), 4000)
    } finally {
      setSaving(false)
    }
  }, [drafts, initialRows])

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
      </header>

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
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-zinc-50/90 text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
                <th className="px-4 py-3">Produto</th>
                <th className="w-28 px-2 py-3">Categoria</th>
                <th className="w-28 px-2 py-3">Qtd.</th>
                <th className="w-32 px-2 py-3">Alerta ≤</th>
                <th className="w-20 px-2 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
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
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

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
