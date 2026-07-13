'use client'

import { MenuImage } from '@/app/_components/MenuImage'
import { useEffect, useMemo, useState } from 'react'
import type { CartAddonPick } from '@/app/context/CartContext'
import { useCart } from '@/app/context/CartContext'
import type { StorefrontMenuProduct } from './storefront-menu-types'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

type AddonGroup = {
  name: string
  required: boolean
  items: { name: string; price: number }[]
}

function pickKey(g: number, i: number) {
  return `${g}:${i}`
}

function buildLineName(
  base: string,
  addons: CartAddonPick[],
  notes: string | null | undefined
): string {
  let s = base.trim() || 'Item'
  if (addons.length > 0) {
    s += ` [${addons
      .map((a) => (a.quantity > 1 ? `${a.itemName} x${a.quantity}` : a.itemName))
      .join(', ')}]`
  }
  if (notes?.trim()) {
    s += ` — Obs: ${notes.trim()}`
  }
  return s
}

function discountPercent(original: number, current: number) {
  if (!Number.isFinite(original) || original <= 0) return 0
  const pct = Math.round((1 - current / original) * 100)
  return pct > 0 ? pct : 0
}

function ProductThumbPlaceholder({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || 'P'
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#f0f2f5] text-3xl font-bold text-neutral-500">
      {initial}
    </div>
  )
}

export function ProductDetailModal({
  product,
  theme,
  onClose,
}: {
  product: StorefrontMenuProduct
  theme: { primary: string; secondary: string }
  onClose: () => void
}) {
  const { addItem } = useCart()
  const [groups, setGroups] = useState<AddonGroup[]>([])
  const [loadingAddons, setLoadingAddons] = useState(true)
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [qty, setQty] = useState(1)
  const [groupQuery, setGroupQuery] = useState<Record<number, string>>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingAddons(true)
      try {
        const res = await fetch(
          `/api/public/product-addons?productId=${encodeURIComponent(product.id)}`
        )
        const data = (await res.json()) as { groups?: AddonGroup[] }
        if (!cancelled && Array.isArray(data.groups)) {
          setGroups(data.groups)
        }
      } catch {
        if (!cancelled) setGroups([])
      } finally {
        if (!cancelled) setLoadingAddons(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [product.id])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const pct =
    product.originalPrice != null
      ? discountPercent(product.originalPrice, product.price)
      : 0

  const addonTotal = useMemo(() => {
    let sum = 0
    for (const [key, quantity] of Object.entries(selectedQty)) {
      if (!quantity || quantity < 1) continue
      const [gs, is] = key.split(':').map(Number)
      const it = groups[gs]?.items[is]
      if (it) sum += it.price * quantity
    }
    return sum
  }, [selectedQty, groups])

  const unitTotal = product.price + addonTotal

  const requiredOk = useMemo(() => {
    for (let g = 0; g < groups.length; g++) {
      if (!groups[g]?.required) continue
      const has = groups[g].items.some(
        (_, i) => (selectedQty[pickKey(g, i)] ?? 0) > 0
      )
      if (!has) return false
    }
    return true
  }, [groups, selectedQty])

  const canAdd = requiredOk && !loadingAddons

  function changeAddonQty(g: number, i: number, delta: number) {
    const k = pickKey(g, i)
    setSelectedQty((prev) => {
      const next = { ...prev }
      const cur = next[k] ?? 0
      const value = Math.max(0, cur + delta)
      if (value === 0) delete next[k]
      else next[k] = value
      return next
    })
  }

  function handleAdd() {
    if (!canAdd) return
    const picks: CartAddonPick[] = []
    for (const [key, quantity] of Object.entries(selectedQty)) {
      if (!quantity || quantity < 1) continue
      const [gs, is] = key.split(':').map(Number)
      const g = groups[gs]
      const it = g?.items[is]
      if (g && it) {
        picks.push({
          groupName: g.name,
          itemName: it.name,
          price: it.price,
          quantity,
        })
      }
    }
    const name = buildLineName(product.name, picks, notes || null)
    addItem({
      productId: product.id,
      name,
      price: unitTotal,
      quantity: qty,
      notes: notes.trim() || null,
      addons: picks.length ? picks : undefined,
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/50"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
        className="flex h-[100dvh] max-h-[100dvh] w-full flex-col bg-white sm:h-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-2xl sm:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 overflow-hidden rounded-t-2xl sm:rounded-t-2xl sm:rounded-b-none">
          <div className="relative aspect-[16/10] w-full bg-neutral-100">
            {product.imageUrl ? (
              <MenuImage
                src={product.imageUrl}
                alt=""
                fill
                className="object-cover"
                sizes="100vw"
                priority
                fallback={<ProductThumbPlaceholder name={product.name} />}
              />
            ) : (
              <ProductThumbPlaceholder name={product.name} />
            )}
            <div
              className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"
              aria-hidden
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-neutral-800 shadow-md backdrop-blur-sm transition-colors active:bg-neutral-200"
            aria-label="Fechar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 sm:px-5">
          <h2
            id="product-detail-title"
            className="text-xl font-bold leading-tight text-neutral-900"
          >
            {product.name}
          </h2>

          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            {product.originalPrice != null ? (
              <span className="text-sm tabular-nums text-neutral-400 line-through">
                {money.format(product.originalPrice)}
              </span>
            ) : null}
            <span
              className="text-lg font-bold tabular-nums"
              style={{ color: theme.primary }}
            >
              {money.format(product.price)}
            </span>
            {pct > 0 ? (
              <span
                className="rounded px-1.5 py-0.5 text-xs font-bold text-white"
                style={{ backgroundColor: theme.primary }}
              >
                {pct}%
              </span>
            ) : null}
          </div>

          {product.description ? (
            <p className="mt-3 text-sm leading-relaxed text-neutral-600">
              {product.description}
            </p>
          ) : null}

          {loadingAddons ? (
            <p className="mt-4 text-sm text-neutral-500">A carregar opções…</p>
          ) : groups.length > 0 ? (
            <div className="mt-5 space-y-3">
              {groups.map((g, gi) => {
                const q = (groupQuery[gi] ?? '').trim().toLowerCase()
                const selectedInGroup = g.items.reduce(
                  (sum, _it, ii) => sum + (selectedQty[pickKey(gi, ii)] ?? 0),
                  0
                )
                const filtered = g.items
                  .map((it, ii) => ({ it, ii }))
                  .filter(
                    ({ it }) =>
                      !q ||
                      it.name.toLowerCase().includes(q)
                  )
                return (
                  <div
                    key={`${g.name}-${gi}`}
                    className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50/80"
                  >
                    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200/80 bg-neutral-100/90 px-3 py-2.5">
                      <span className="text-sm font-bold text-neutral-900">
                        {g.name}
                      </span>
                      {g.required ? (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-900">
                          Obrigatório
                        </span>
                      ) : (
                        <span className="text-[11px] text-neutral-500">
                          Opcional
                        </span>
                      )}
                      {selectedInGroup > 0 ? (
                        <span className="ml-auto rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                          {selectedInGroup} selecionado{selectedInGroup > 1 ? 's' : ''}
                        </span>
                      ) : null}
                    </div>
                    <div className="px-3 py-2">
                      {g.items.length > 4 ? (
                        <input
                          type="search"
                          className="mb-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-300"
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
                          const selectedCount = selectedQty[pickKey(gi, ii)] ?? 0
                          const active = selectedCount > 0
                          return (
                            <li key={pickKey(gi, ii)}>
                              <div
                                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-left text-sm transition-colors ${
                                  active
                                    ? 'border-2 bg-white'
                                    : 'border border-transparent hover:bg-white/80'
                                }`}
                                style={active ? { borderColor: theme.primary } : undefined}
                              >
                                <span className="font-medium text-neutral-900 pr-2">
                                  {it.name}
                                  {it.price > 0 ? (
                                    <span className="ml-1 text-xs font-normal text-neutral-500">
                                      (+{money.format(it.price)})
                                    </span>
                                  ) : null}
                                </span>
                                <div className="inline-flex shrink-0 items-center rounded-full border border-neutral-200 bg-white">
                                  <button
                                    type="button"
                                    onClick={() => changeAddonQty(gi, ii, -1)}
                                    disabled={!active}
                                    className="rounded-l-full px-2.5 py-1 text-base font-bold text-neutral-700 transition-colors active:bg-neutral-200 disabled:opacity-35"
                                    aria-label={`Remover ${it.name}`}
                                  >
                                    −
                                  </button>
                                  <span className="min-w-6 text-center text-xs font-semibold tabular-nums text-neutral-800">
                                    {selectedCount}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => changeAddonQty(gi, ii, 1)}
                                    className="rounded-r-full px-2.5 py-1 text-base font-bold text-neutral-700 transition-colors active:bg-neutral-200"
                                    aria-label={`Adicionar ${it.name}`}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          <label className="mt-5 block text-sm font-medium text-neutral-800">
            Observações
            <textarea
              className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300"
              rows={3}
              placeholder="Ex.: sem cebola, ponto da carne…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
            <span className="text-sm font-medium text-neutral-700">Quantidade</span>
            <div className="inline-flex items-center rounded-full border border-neutral-200 bg-white">
              <button
                type="button"
                className="rounded-l-full px-3 py-1.5 text-lg font-bold text-neutral-700 transition-colors active:bg-neutral-200 disabled:opacity-40"
                disabled={qty <= 1}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <span className="min-w-8 text-center text-sm font-semibold tabular-nums">
                {qty}
              </span>
              <button
                type="button"
                className="rounded-r-full px-3 py-1.5 text-lg font-bold text-neutral-700 transition-colors active:bg-neutral-200"
                onClick={() => setQty((q) => q + 1)}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-neutral-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.06)] sm:rounded-b-2xl sm:pb-4">
          <button
            type="button"
            disabled={!canAdd}
            onClick={handleAdd}
            className="w-full rounded-xl py-3.5 text-sm font-bold text-white shadow-md transition-[filter,transform] enabled:hover:brightness-105 enabled:active:scale-[0.99] enabled:active:brightness-[0.88] disabled:cursor-not-allowed disabled:opacity-45"
            style={{
              background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
            }}
          >
            Adicionar ao carrinho · {money.format(unitTotal * qty)}
          </button>
        </div>
      </div>
    </div>
  )
}
