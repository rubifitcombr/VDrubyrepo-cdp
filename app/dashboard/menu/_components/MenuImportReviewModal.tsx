'use client'

import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import { useCallback, useEffect, useState } from 'react'
import type { Plan } from '@/lib/plan'
import { hasProMarketingAi } from '@/lib/plan'

export type ImportProductDraft = {
  key: string
  name: string
  description: string
  priceStr: string
}

export type ImportCategoryDraft = {
  key: string
  categoryLabel: string
  products: ImportProductDraft[]
}

function aiDataToDrafts(parsed: unknown): ImportCategoryDraft[] {
  if (!parsed || typeof parsed !== 'object') return []
  const items = (parsed as { items?: unknown }).items
  if (!Array.isArray(items)) return []

  const map = new Map<string, ImportProductDraft[]>()

  for (const row of items) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    if (!name) continue

    const catRaw = typeof o.category === 'string' ? o.category.trim() : ''
    const label = catRaw || 'Sem categoria'

    const description =
      typeof o.description === 'string' ? o.description.trim() : ''

    let priceStr = ''
    if (typeof o.price === 'number' && !Number.isNaN(o.price)) {
      priceStr = String(o.price).replace('.', ',')
    } else if (o.price != null && o.price !== '') {
      const n = Number(String(o.price).replace(',', '.'))
      if (!Number.isNaN(n)) priceStr = String(n).replace('.', ',')
    }

    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push({
      key: crypto.randomUUID(),
      name,
      description,
      priceStr,
    })
  }

  return [...map.entries()].map(([categoryLabel, products]) => ({
    key: crypto.randomUUID(),
    categoryLabel,
    products,
  }))
}

const inputClass =
  'mt-1 w-full rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-sm text-[#1a1614] outline-none focus:border-[var(--dash-primary)]/40 focus:ring-2 focus:ring-[var(--dash-primary)]/12'

export function MenuImportReviewModal({
  open,
  onClose,
  storeId,
  parsed,
  onSaved,
  plan,
}: {
  open: boolean
  onClose: () => void
  storeId: string
  parsed: unknown | null
  onSaved: () => void
  plan: Plan
}) {
  const [groups, setGroups] = useState<ImportCategoryDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [batchDescBusy, setBatchDescBusy] = useState(false)
  const [batchDescProgress, setBatchDescProgress] = useState<{
    done: number
    total: number
  } | null>(null)

  useEffect(() => {
    if (open && parsed != null) {
      setGroups(aiDataToDrafts(parsed))
    }
  }, [open, parsed])

  const patchCategoryLabel = useCallback((gkey: string, categoryLabel: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.key === gkey ? { ...g, categoryLabel } : g))
    )
  }, [])

  const patchProduct = useCallback(
    (
      gkey: string,
      pkey: string,
      patch: Partial<Pick<ImportProductDraft, 'name' | 'description' | 'priceStr'>>
    ) => {
      setGroups((prev) =>
        prev.map((g) =>
          g.key !== gkey
            ? g
            : {
                ...g,
                products: g.products.map((p) =>
                  p.key === pkey ? { ...p, ...patch } : p
                ),
              }
        )
      )
    },
    []
  )

  const handleCancel = useCallback(() => {
    if (saving || batchDescBusy) return
    onClose()
  }, [saving, batchDescBusy, onClose])

  const runBatchDescriptions = useCallback(async () => {
    if (!hasProMarketingAi(plan)) return
    let total = 0
    for (const g of groups) total += g.products.length
    if (total === 0) return

    if (
      !confirm(
        `A IA (gpt-4o-mini) será chamada ${total} vez(es), uma por produto. Continuar?`
      )
    ) {
      return
    }

    setBatchDescBusy(true)
    setBatchDescProgress({ done: 0, total })
    let done = 0

    try {
      for (const g of groups) {
        const category =
          g.categoryLabel.trim() === ''
            ? 'Sem categoria'
            : g.categoryLabel.trim()

        for (const p of g.products) {
          const name = p.name.trim()
          const raw = p.priceStr.trim().replace(',', '.')
          const priceNum = raw === '' ? 0 : Number(raw)

          if (!name || Number.isNaN(priceNum) || priceNum < 0) {
            done += 1
            setBatchDescProgress({ done, total })
            continue
          }

          const res = await dashboardFetch('/api/ai/product-description', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storeId,
              name,
              category,
              price: priceNum,
              ...(p.description.trim()
                ? { existingDescription: p.description.trim() }
                : {}),
            }),
          })

          const data = (await res.json()) as {
            description?: string
            error?: string
          }

          if (!res.ok) {
            alert(data.error || 'Erro ao gerar descrição em lote.')
            return
          }

          if (typeof data.description === 'string' && data.description.trim()) {
            patchProduct(g.key, p.key, {
              description: data.description.trim(),
            })
          }

          done += 1
          setBatchDescProgress({ done, total })
        }
      }

      alert(`Descrições concluídas para ${done} item(ns). Revê o texto e guarda o cardápio.`)
    } finally {
      setBatchDescBusy(false)
      setBatchDescProgress(null)
    }
  }, [groups, patchProduct, plan, storeId])

  const handleSave = useCallback(async () => {
    for (const g of groups) {
      for (const p of g.products) {
        const name = p.name.trim()
        if (!name) {
          alert('Todos os itens precisam de nome.')
          return
        }
        const raw = p.priceStr.trim().replace(',', '.')
        const priceNum = raw === '' ? 0 : Number(raw)
        if (Number.isNaN(priceNum) || priceNum < 0) {
          alert(`Preço inválido: "${name}".`)
          return
        }
      }
    }

    setSaving(true)
    try {
      const categories = groups.map((g) => {
        const name =
          g.categoryLabel.trim() === ''
            ? 'Sem categoria'
            : g.categoryLabel.trim()
        return {
          name,
          products: g.products.map((p) => {
            const raw = p.priceStr.trim().replace(',', '.')
            const priceNum = raw === '' ? 0 : Number(raw)
            return {
              name: p.name.trim(),
              description: p.description.trim() || null,
              price: priceNum,
            }
          }),
        }
      })

      const res = await dashboardFetch('/api/menu/import/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, categories }),
      })

      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        success?: boolean
        createdProducts?: number
        createdCategories?: number
      }

      if (!res.ok) {
        alert(
          typeof data.error === 'string'
            ? data.error
            : 'Não foi possível guardar o cardápio.'
        )
        return
      }

      const n = typeof data.createdProducts === 'number' ? data.createdProducts : 0
      const c =
        typeof data.createdCategories === 'number' ? data.createdCategories : 0

      onSaved()
      onClose()
      alert(
        `${n} produto(s) em ${c} categoria(s) adicionado(s) ao cardápio.`
      )
    } finally {
      setSaving(false)
    }
  }, [groups, onClose, onSaved, storeId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving && !batchDescBusy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving, batchDescBusy, onClose])

  if (!open) return null

  const totalProducts = groups.reduce((acc, g) => acc + g.products.length, 0)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={
        saving || batchDescBusy ? undefined : handleCancel
      }
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-review-title"
        className="flex max-h-[min(95dvh,48rem)] w-full max-w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--card-border)] bg-white shadow-2xl sm:max-h-[min(90dvh,44rem)] sm:max-w-2xl sm:rounded-xl lg:max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--card-border)] px-4 py-3 sm:px-5">
          <div>
            <h2
              id="import-review-title"
              className="text-base font-semibold text-vyria-navy sm:text-lg"
            >
              Revisar importação
            </h2>
            <p className="mt-0.5 text-xs text-vyria-navy-muted sm:text-sm">
              {totalProducts === 0
                ? 'Nenhum item — ajusta na foto ou cancela.'
                : `${totalProducts} item(ns) em ${groups.length} categoria(s). Edita e guarda.`}
            </p>
          </div>
          <button
            type="button"
            disabled={saving || batchDescBusy}
            onClick={handleCancel}
            className="rounded-lg px-2 py-1 text-xl leading-none text-vyria-navy-muted hover:bg-[#f5f5f5] hover:text-vyria-navy disabled:opacity-50"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          {groups.length === 0 ? (
            <p className="text-sm text-vyria-navy-muted">
              Não há dados para rever. Fecha e tenta outra imagem.
            </p>
          ) : (
            <div className="space-y-8">
              {hasProMarketingAi(plan) && totalProducts > 0 ? (
                <div className="rounded-xl border border-vyria-plum/25 bg-vyria-plum/[0.06] px-3 py-3 sm:px-4">
                  <p className="text-xs font-semibold text-vyria-plum sm:text-sm">
                    IA de marketing (Pro ou Master)
                  </p>
                  <button
                    type="button"
                    disabled={saving || batchDescBusy}
                    onClick={() => void runBatchDescriptions()}
                    className="mt-2 rounded-lg border border-vyria-plum/30 bg-white px-3 py-2 text-xs font-semibold text-vyria-plum shadow-sm hover:bg-vyria-plum/5 disabled:opacity-50 sm:text-sm"
                  >
                    {batchDescBusy && batchDescProgress
                      ? `A gerar descrições… ${batchDescProgress.done}/${batchDescProgress.total}`
                      : `Melhorar todas as descrições com IA (${totalProducts})`}
                  </button>
                </div>
              ) : null}
              {groups.map((g) => (
                <section key={g.key} className="space-y-3">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                    Categoria
                    <input
                      value={g.categoryLabel}
                      onChange={(e) =>
                        patchCategoryLabel(g.key, e.target.value)
                      }
                      className={inputClass}
                      placeholder="Ex.: Hambúrgueres"
                    />
                  </label>
                  <ul className="space-y-4 border-t border-[var(--card-border)] pt-4">
                    {g.products.map((p, idx) => (
                      <li
                        key={p.key}
                        className="rounded-xl border border-[var(--card-border)] bg-[#fafafa] p-3 sm:p-4"
                      >
                        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#9ca3af]">
                          Produto {idx + 1}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-xs font-medium text-vyria-navy sm:col-span-2">
                            Nome
                            <input
                              value={p.name}
                              onChange={(e) =>
                                patchProduct(g.key, p.key, {
                                  name: e.target.value,
                                })
                              }
                              className={inputClass}
                            />
                          </label>
                          <label className="block text-xs font-medium text-vyria-navy">
                            Preço (R$)
                            <input
                              value={p.priceStr}
                              onChange={(e) =>
                                patchProduct(g.key, p.key, {
                                  priceStr: e.target.value,
                                })
                              }
                              inputMode="decimal"
                              placeholder="0,00"
                              className={inputClass}
                            />
                          </label>
                          <label className="block text-xs font-medium text-vyria-navy sm:col-span-2">
                            Descrição
                            <textarea
                              value={p.description}
                              onChange={(e) =>
                                patchProduct(g.key, p.key, {
                                  description: e.target.value,
                                })
                              }
                              rows={2}
                              className={`${inputClass} resize-y`}
                            />
                          </label>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--card-border)] bg-white px-4 py-3 sm:flex-row sm:justify-end sm:gap-3 sm:px-5 sm:py-4">
          <button
            type="button"
            disabled={saving || batchDescBusy}
            onClick={handleCancel}
            className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[#374151] hover:bg-[#f9fafb] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || batchDescBusy || totalProducts === 0}
            onClick={() => void handleSave()}
            className="rounded-xl bg-[var(--dash-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 hover:brightness-105 disabled:opacity-50"
          >
            {saving ? 'A guardar…' : 'Salvar cardápio'}
          </button>
        </div>
      </div>
    </div>
  )
}
