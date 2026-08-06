'use client'

import { useEffect, useMemo, useState } from 'react'
import type { MenuProductRow } from '@/lib/menu-product'
import { effectiveProductPrice } from '@/lib/product-pricing'
import {
  addonPickKey,
  addonPicksFromSelection,
  addonTotalFromPicks,
  requiredAddonGroupsOk,
  type ProductAddonGroup,
  type ProductAddonPick,
} from '@/lib/product-addon-line'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function GarcomProductAddonModal({
  product,
  groups,
  onClose,
  onConfirm,
}: {
  product: MenuProductRow
  groups: ProductAddonGroup[]
  onClose: () => void
  onConfirm: (picks: ProductAddonPick[], notes: string) => void
}) {
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [groupQuery, setGroupQuery] = useState<Record<number, string>>({})

  useEffect(() => {
    const initial: Record<string, number> = {}
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi]
      if (!g?.required || g.items.length === 0) continue
      const defaultIdx = g.items.findIndex((it) => it.price === 0)
      const idx = defaultIdx >= 0 ? defaultIdx : 0
      initial[addonPickKey(gi, idx)] = 1
    }
    setSelectedQty(initial)
    setNotes('')
    setGroupQuery({})
  }, [product.id, groups])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const basePrice = effectiveProductPrice(product, 'dine_in')
  const picks = useMemo(
    () => addonPicksFromSelection(groups, selectedQty),
    [groups, selectedQty]
  )
  const addonTotal = useMemo(() => addonTotalFromPicks(picks), [picks])
  const unitTotal = basePrice + addonTotal
  const requiredOk = useMemo(
    () => requiredAddonGroupsOk(groups, selectedQty),
    [groups, selectedQty]
  )

  function groupMaxSelect(g: ProductAddonGroup): number {
    const n = g.maxSelect
    return Number.isFinite(n) && (n as number) >= 1 ? (n as number) : 1
  }

  function selectSingleAddon(gi: number, ii: number) {
    setSelectedQty((prev) => {
      const next = { ...prev }
      const g = groups[gi]
      if (!g) return prev
      for (let j = 0; j < g.items.length; j++) {
        const k = addonPickKey(gi, j)
        if (j === ii) next[k] = 1
        else delete next[k]
      }
      return next
    })
  }

  function changeAddonQty(g: number, i: number, delta: number) {
    const k = addonPickKey(g, i)
    const maxSelect = groupMaxSelect(groups[g] ?? { name: '', required: false, items: [] })
    setSelectedQty((prev) => {
      const next = { ...prev }
      const cur = next[k] ?? 0
      let value = Math.max(0, cur + delta)
      if (maxSelect === 1) {
        if (delta > 0) {
          for (let j = 0; j < (groups[g]?.items.length ?? 0); j++) {
            const key = addonPickKey(g, j)
            if (j === i) next[key] = 1
            else delete next[key]
          }
        } else {
          delete next[k]
        }
        return next
      }
      if (value === 0) delete next[k]
      else next[k] = value
      return next
    })
  }

  return (
    <div
      className="fixed inset-0 z-[94] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="garcom-addon-title"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:max-h-[88dvh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--card-border)] px-4 py-4">
          <div className="min-w-0">
            <h2
              id="garcom-addon-title"
              className="text-lg font-bold leading-tight text-[#1a1614]"
            >
              {product.name}
            </h2>
            <p className="mt-1 text-sm font-semibold text-[var(--dash-primary)]">
              {money.format(basePrice)}
              {addonTotal > 0 ? (
                <span className="ml-2 font-medium text-[#6b7280]">
                  + {money.format(addonTotal)} adicionais
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-[#6b7280] hover:bg-[#f4f5f7]"
          >
            Fechar
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-3">
            {groups.map((g, gi) => {
              const q = (groupQuery[gi] ?? '').trim().toLowerCase()
              const singleSelect = groupMaxSelect(g) === 1
              const selectedInGroup = g.items.reduce(
                (sum, _it, ii) => sum + (selectedQty[addonPickKey(gi, ii)] ?? 0),
                0
              )
              const filtered = g.items
                .map((it, ii) => ({ it, ii }))
                .filter(
                  ({ it }) => !q || it.name.toLowerCase().includes(q)
                )
              return (
                <div
                  key={`${g.name}-${gi}`}
                  className="overflow-hidden rounded-xl border border-[var(--card-border)] bg-[#fafafa]"
                >
                  <div className="flex flex-wrap items-center gap-2 border-b border-[var(--card-border)] bg-[#f4f5f7] px-3 py-2.5">
                    <span className="text-sm font-bold text-[#1a1614]">{g.name}</span>
                    {g.required ? (
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-900">
                        Obrigatório
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#6b7280]">Opcional</span>
                    )}
                    {g.required && selectedInGroup === 0 ? (
                      <span className="ml-auto text-[11px] font-medium text-amber-800">
                        Escolha uma opção
                      </span>
                    ) : selectedInGroup > 0 ? (
                      <span className="ml-auto rounded-full bg-[var(--dash-primary)] px-2 py-0.5 text-[11px] font-semibold text-white">
                        {selectedInGroup} selecionado{selectedInGroup > 1 ? 's' : ''}
                      </span>
                    ) : null}
                  </div>
                  <div className="px-3 py-2">
                    {g.items.length > 4 ? (
                      <input
                        type="search"
                        className="mb-2 w-full rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--dash-primary)]"
                        placeholder="Pesquisar pelo nome"
                        value={groupQuery[gi] ?? ''}
                        onChange={(e) =>
                          setGroupQuery((prev) => ({
                            ...prev,
                            [gi]: e.target.value,
                          }))
                        }
                      />
                    ) : null}
                    <ul className="space-y-1">
                      {filtered.map(({ it, ii }) => {
                        const selectedCount = selectedQty[addonPickKey(gi, ii)] ?? 0
                        const active = selectedCount > 0
                        return (
                          <li key={addonPickKey(gi, ii)}>
                            {singleSelect ? (
                              <button
                                type="button"
                                onClick={() => selectSingleAddon(gi, ii)}
                                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-left text-sm transition-colors ${
                                  active
                                    ? 'border-2 border-[var(--dash-primary)] bg-white'
                                    : 'border border-transparent hover:bg-white/80'
                                }`}
                              >
                                <span className="pr-2 font-medium text-[#1a1614]">
                                  {it.name}
                                  {it.price > 0 ? (
                                    <span className="ml-1 text-xs font-normal text-[#6b7280]">
                                      (+{money.format(it.price)})
                                    </span>
                                  ) : (
                                    <span className="ml-1 text-xs font-normal text-[#6b7280]">
                                      (incluído)
                                    </span>
                                  )}
                                </span>
                                <span
                                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                    active
                                      ? 'border-[var(--dash-primary)] bg-[var(--dash-primary)]'
                                      : 'border-[#d1d5db] bg-white'
                                  }`}
                                  aria-hidden
                                >
                                  {active ? (
                                    <span className="h-2 w-2 rounded-full bg-white" />
                                  ) : null}
                                </span>
                              </button>
                            ) : (
                              <div
                                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-left text-sm transition-colors ${
                                  active
                                    ? 'border-2 border-[var(--dash-primary)] bg-white'
                                    : 'border border-transparent hover:bg-white/80'
                                }`}
                              >
                                <span className="pr-2 font-medium text-[#1a1614]">
                                  {it.name}
                                  {it.price > 0 ? (
                                    <span className="ml-1 text-xs font-normal text-[#6b7280]">
                                      (+{money.format(it.price)})
                                    </span>
                                  ) : null}
                                </span>
                                <div className="inline-flex shrink-0 items-center rounded-full border border-[var(--card-border)] bg-white">
                                  <button
                                    type="button"
                                    onClick={() => changeAddonQty(gi, ii, -1)}
                                    disabled={!active}
                                    className="rounded-l-full px-2.5 py-1 text-base font-bold text-[#1a1614] transition-colors active:bg-[#f4f5f7] disabled:opacity-35"
                                    aria-label={`Remover ${it.name}`}
                                  >
                                    −
                                  </button>
                                  <span className="min-w-6 text-center text-xs font-semibold tabular-nums text-[#1a1614]">
                                    {selectedCount}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => changeAddonQty(gi, ii, 1)}
                                    className="rounded-r-full px-2.5 py-1 text-base font-bold text-[#1a1614] transition-colors active:bg-[#f4f5f7]"
                                    aria-label={`Adicionar ${it.name}`}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </div>
              )
            })}
          </div>

          <label className="mt-4 block text-sm font-medium text-[#1a1614]">
            Observações
            <textarea
              className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm text-[#1a1614] outline-none placeholder:text-[#9ca3af] focus:border-[var(--dash-primary)]"
              rows={2}
              placeholder="Ex.: sem cebola, ponto da carne…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>

        <div className="shrink-0 border-t border-[var(--card-border)] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {!requiredOk ? (
            <p className="mb-2 text-center text-xs font-medium text-amber-800">
              Complete as opções obrigatórias para adicionar ao pedido.
            </p>
          ) : null}
          <button
            type="button"
            disabled={!requiredOk}
            onClick={() => onConfirm(picks, notes.trim())}
            className="w-full rounded-xl bg-[var(--dash-primary)] py-3.5 text-sm font-bold text-white shadow-sm transition enabled:hover:brightness-105 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Adicionar · {money.format(unitTotal)}
          </button>
        </div>
      </div>
    </div>
  )
}
