'use client'

import { MenuImage } from '@/app/_components/MenuImage'
import Link from 'next/link'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { IconTrash } from '@/app/dashboard/_components/NavIcons'
import type { MenuProductRow } from '@/lib/menu-product'
import {
  baseProductPriceForChannel,
  effectiveProductPrice,
  hasActivePromotion,
} from '@/lib/product-pricing'
import {
  submitPdvSale,
  type PdvCloseMode,
  type PdvImmediatePaymentMethod,
} from '@/services/pdv'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function normSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

type CartLine = {
  productId: string
  name: string
  imageUrl: string | null
  unitPrice: number
  quantity: number
}

export function PdvClient({
  storeId,
  initialProducts,
  cashierPanelEnabled,
}: {
  storeId: string
  initialProducts: MenuProductRow[]
  /** Plano com módulo Caixa: mostra «Enviar para o Caixa». Sem Caixa (ex.: Start presencial), só receber no balcão. */
  cashierPanelEnabled: boolean
}) {
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerName, setCustomerName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successKind, setSuccessKind] = useState<
    null | 'cashier' | 'immediate'
  >(null)
  const [closeMode, setCloseMode] = useState<PdvCloseMode>(() =>
    cashierPanelEnabled ? 'cashier' : 'immediate'
  )
  const [immediatePayment, setImmediatePayment] =
    useState<PdvImmediatePaymentMethod>('cash')
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearch = useDeferredValue(searchQuery)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [internalNotes, setInternalNotes] = useState('')
  const [discountInput, setDiscountInput] = useState('')
  const [canFullscreen, setCanFullscreen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const qtyInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const fullscreenRootRef = useRef<HTMLDivElement>(null)

  const products = initialProducts

  const categories = useMemo(() => {
    const s = new Set<string>()
    for (const p of products) {
      const c = p.category?.trim()
      if (c) s.add(c)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'pt'))
  }, [products])

  const filteredProducts = useMemo(() => {
    let list = products
    if (categoryFilter !== 'all') {
      list = list.filter(
        (p) => (p.category?.trim() || '') === categoryFilter
      )
    }
    const q = deferredSearch.trim()
    if (q) {
      const nq = normSearch(q)
      list = list.filter((p) => {
        const name = normSearch(p.name)
        const cat = normSearch(p.category || '')
        return name.includes(nq) || cat.includes(nq)
      })
    }
    return list
  }, [products, categoryFilter, deferredSearch])

  const subtotal = useMemo(
    () =>
      Math.round(
        cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100
      ) / 100,
    [cart]
  )

  const discountParsed = useMemo(() => {
    const t = discountInput.replace(/\s/g, '').replace(',', '.')
    const n = parseFloat(t)
    if (Number.isNaN(n) || n < 0) return 0
    return Math.round(n * 100) / 100
  }, [discountInput])

  const discountApplied = useMemo(
    () => Math.min(discountParsed, subtotal),
    [discountParsed, subtotal]
  )

  const totalPayable = useMemo(
    () => Math.round((subtotal - discountApplied) * 100) / 100,
    [subtotal, discountApplied]
  )

  const cartItemCount = useMemo(
    () => cart.reduce((s, l) => s + l.quantity, 0),
    [cart]
  )

  useEffect(() => {
    if (!successKind) return
    const t = window.setTimeout(() => setSuccessKind(null), 4500)
    return () => window.clearTimeout(t)
  }, [successKind])

  useEffect(() => {
    const hasApi = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen
    setCanFullscreen(hasApi)
    if (!hasApi) return
    const sync = () =>
      setIsFullscreen(document.fullscreenElement === fullscreenRootRef.current)
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      const inField =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (e.target as HTMLElement)?.isContentEditable

      if (
        e.key === '/' &&
        !inField &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      if (e.ctrlKey && e.key === 'Enter' && cart.length > 0 && !submitting) {
        e.preventDefault()
        formRef.current?.requestSubmit()
      }
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        cart.length > 0
      ) {
        const k = e.key
        if (k >= '1' && k <= '9') {
          const idx = parseInt(k, 10) - 1
          if (idx < cart.length) {
            e.preventDefault()
            const id = cart[idx]?.productId
            if (id) {
              const el = qtyInputRefs.current.get(id)
              el?.focus()
              el?.select()
            }
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cart, submitting])

  const addProduct = useCallback((p: MenuProductRow) => {
    setError(null)
    setSuccessKind(null)
    const price = effectiveProductPrice(p, 'dine_in')
    const id = p.id
    setCart((prev) => {
      const i = prev.findIndex((l) => l.productId === id)
      if (i >= 0) {
        const next = [...prev]
        next[i] = { ...next[i], quantity: next[i].quantity + 1 }
        return next
      }
      return [
        ...prev,
        {
          productId: id,
          name: p.name,
          imageUrl: p.image_url,
          unitPrice: price,
          quantity: 1,
        },
      ]
    })
  }, [])

  const setQty = useCallback((productId: string, quantity: number) => {
    setError(null)
    setSuccessKind(null)
    if (quantity < 1) {
      setCart((prev) => prev.filter((l) => l.productId !== productId))
      return
    }
    setCart((prev) =>
      prev.map((l) =>
        l.productId === productId ? { ...l, quantity } : l
      )
    )
  }, [])

  const removeLine = useCallback((productId: string) => {
    setError(null)
    setSuccessKind(null)
    setCart((prev) => prev.filter((l) => l.productId !== productId))
  }, [])

  const clearCart = useCallback(() => {
    if (!cart.length) return
    if (!confirm('Limpar todo o carrinho?')) return
    setError(null)
    setSuccessKind(null)
    setCart([])
    setInternalNotes('')
    setDiscountInput('')
  }, [cart.length])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!cart.length || submitting) return
    setError(null)
    setSuccessKind(null)
    setSubmitting(true)
    try {
      const result = await submitPdvSale({
        storeId,
        customerName: customerName.trim() || null,
        items: cart.map((l) => ({
          productId: l.productId,
          name: l.name,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        discountBrl: discountApplied,
        internalNotes: internalNotes.trim() || null,
        closeMode,
        immediatePaymentMethod:
          closeMode === 'immediate' ? immediatePayment : null,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setCart([])
      setCustomerName('')
      setInternalNotes('')
      setDiscountInput('')
      setSuccessKind(result.closedImmediately ? 'immediate' : 'cashier')
      searchInputRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleFullscreen() {
    if (!canFullscreen || !fullscreenRootRef.current) return
    try {
      if (document.fullscreenElement === fullscreenRootRef.current) {
        await document.exitFullscreen()
      } else {
        await fullscreenRootRef.current.requestFullscreen()
      }
    } catch {
      setError('Não foi possível alternar o ecrã completo neste navegador.')
    }
  }

  return (
    <div
      ref={fullscreenRootRef}
      className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-[var(--dash-surface)] md:min-h-[calc(100dvh-1px)] lg:flex-row"
    >
      {isFullscreen ? (
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="fixed right-3 top-3 z-[80] inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/35 bg-black/65 text-sm font-bold text-white shadow-lg backdrop-blur-sm hover:bg-black/75"
          aria-label="Fechar ecrã completo"
          title="Fechar ecrã completo"
        >
          ×
        </button>
      ) : null}
      {successKind ? (
        <div
          className="fixed inset-x-0 top-14 z-40 mx-auto max-w-lg px-3 md:top-4 md:max-w-md"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-emerald-900/20">
            {successKind === 'immediate'
              ? cashierPanelEnabled
                ? 'Pagamento registado no turno de caixa. Comanda fechada.'
                : 'Pagamento registado. Comanda fechada.'
              : 'Comanda enviada ao Caixa para fecho e pagamento.'}
          </div>
        </div>
      ) : null}

      <section className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-[var(--card-border)] bg-white/60 lg:border-b-0 lg:border-r">
        <header className="shrink-0 space-y-3 border-b border-[var(--card-border)] px-3 py-3 md:px-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <nav className="text-xs text-vyria-navy-muted">
                <Link href="/dashboard" className="hover:text-vyria-navy">
                  Início
                </Link>
                <span className="mx-1">/</span>
                <span className="font-medium text-vyria-navy">PDV</span>
              </nav>
              <h1 className="mt-1 font-brand text-lg font-bold text-vyria-navy md:text-xl">
                Balcão
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {canFullscreen && !isFullscreen ? (
                <button
                  type="button"
                  onClick={() => void toggleFullscreen()}
                  className="rounded-xl border border-[var(--card-border)] bg-white px-3 py-2 text-xs font-semibold text-vyria-navy transition hover:bg-zinc-50"
                >
                  Ecrã completo
                </button>
              ) : null}
              <div className="text-right text-xs text-vyria-navy-muted">
                <span className="tabular-nums">{products.length}</span> produtos
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="pdv-search">
              Pesquisar produto
            </label>
            <input
              ref={searchInputRef}
              id="pdv-search"
              type="search"
              autoComplete="off"
              placeholder="Pesquisar por nome ou categoria…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--dash-primary)] focus:ring-2"
            />
          </div>

          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  categoryFilter === 'all'
                    ? 'bg-[var(--dash-primary)] text-white'
                    : 'bg-zinc-100 text-vyria-navy hover:bg-zinc-200'
                }`}
              >
                Todos
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryFilter(c)}
                  className={`max-w-[140px] truncate rounded-full px-3 py-1 text-xs font-semibold transition ${
                    categoryFilter === c
                      ? 'bg-[var(--dash-primary)] text-white'
                      : 'bg-zinc-100 text-vyria-navy hover:bg-zinc-200'
                  }`}
                  title={c}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 md:p-3">
          {products.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-vyria-navy-muted">
              Não há produtos ativos. Adiciona produtos em{' '}
              <Link
                href="/dashboard/menu"
                className="font-semibold text-[var(--dash-primary)] underline"
              >
                Produtos
              </Link>
              .
            </p>
          ) : filteredProducts.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-vyria-navy-muted">
              Nenhum produto corresponde à pesquisa ou categoria.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filteredProducts.map((p) => {
                const price = effectiveProductPrice(p, 'dine_in')
                const base = baseProductPriceForChannel(p, 'dine_in')
                const promo = hasActivePromotion(p, 'dine_in')
                const img = p.image_url?.trim()
                const thumbFallback = (
                  <div className="flex h-full items-center justify-center text-3xl text-zinc-300">
                    ···
                  </div>
                )
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => addProduct(p)}
                      className="flex w-full min-h-[100px] flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-white text-left shadow-sm transition hover:border-[var(--dash-primary)] hover:shadow-md active:scale-[0.98]"
                      aria-label={`Adicionar ${p.name}, ${money.format(price)}`}
                    >
                      <div className="relative aspect-square w-full bg-zinc-100">
                        {promo ? (
                          <span className="absolute top-1.5 left-1.5 z-10 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white shadow">
                            Promo
                          </span>
                        ) : null}
                        {img ? (
                          <MenuImage
                            src={img}
                            storeId={storeId}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 50vw, 20vw"
                            loading="lazy"
                            fallback={thumbFallback}
                          />
                        ) : (
                          thumbFallback
                        )}
                      </div>
                      <div className="flex min-h-[3.25rem] flex-col justify-center gap-0.5 p-2">
                        <span className="line-clamp-2 text-sm font-semibold leading-tight text-vyria-navy">
                          {p.name}
                        </span>
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className="text-sm font-bold tabular-nums text-vyria-navy">
                            {money.format(price)}
                          </span>
                          {promo && !Number.isNaN(base) ? (
                            <span className="text-xs tabular-nums text-zinc-400 line-through">
                              {money.format(base)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <aside className="flex w-full shrink-0 flex-col bg-[var(--dash-surface)] lg:w-[min(100%,420px)] lg:max-w-[40vw]">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--card-border)] px-3 py-3 md:px-4">
          <div>
            <h2 className="font-brand text-lg font-bold text-vyria-navy">
              Carrinho
            </h2>
            {cartItemCount > 0 ? (
              <p className="text-xs text-vyria-navy-muted">
                {cartItemCount}{' '}
                {cartItemCount === 1 ? 'item' : 'itens'} ·{' '}
                {cart.length}{' '}
                {cart.length === 1 ? 'linha' : 'linhas'}
              </p>
            ) : null}
          </div>
          {cart.length > 0 ? (
            <button
              type="button"
              onClick={clearCart}
              className="text-xs font-semibold text-red-600 hover:underline"
            >
              Limpar
            </button>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 md:px-3">
          {cart.length === 0 ? (
            <p className="py-8 text-center text-sm text-vyria-navy-muted">
              Carrinho vazio. Escolhe produtos à esquerda.
            </p>
          ) : (
            <ul className="space-y-2">
              {cart.map((line) => {
                const lineTotal = line.unitPrice * line.quantity
                return (
                  <li
                    key={line.productId}
                    className="flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-white p-2 shadow-sm"
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                      {line.imageUrl?.trim() ? (
                        <MenuImage
                          src={line.imageUrl.trim()}
                          storeId={storeId}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="56px"
                          fallback={
                            <div className="flex h-full items-center justify-center text-zinc-300">
                              ·
                            </div>
                          }
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-zinc-300">
                          ·
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-vyria-navy">
                        {line.name}
                      </p>
                      <p className="text-xs tabular-nums text-vyria-navy-muted">
                        {money.format(line.unitPrice)} × {line.quantity} ={' '}
                        <span className="font-semibold text-vyria-navy">
                          {money.format(lineTotal)}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="flex h-11 min-w-[44px] items-center justify-center rounded-xl border border-[var(--card-border)] bg-white text-lg font-bold text-vyria-navy active:bg-zinc-100"
                        aria-label="Menos um"
                        onClick={() =>
                          setQty(line.productId, line.quantity - 1)
                        }
                      >
                        −
                      </button>
                      <input
                        ref={(el) => {
                          if (el)
                            qtyInputRefs.current.set(line.productId, el)
                          else
                            qtyInputRefs.current.delete(line.productId)
                        }}
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        aria-label={`Quantidade — ${line.name}`}
                        className="h-11 w-14 rounded-xl border border-[var(--card-border)] bg-white px-1 text-center text-sm font-bold tabular-nums text-vyria-navy outline-none ring-[var(--dash-primary)] focus:ring-2"
                        value={line.quantity}
                        onChange={(e) => {
                          const t = e.target.value
                          if (t === '') return
                          const v = parseInt(t, 10)
                          if (Number.isNaN(v)) return
                          setQty(line.productId, Math.max(1, v))
                        }}
                        onBlur={(e) => {
                          const t = e.target.value
                          if (t === '' || parseInt(t, 10) < 1) {
                            setQty(line.productId, 1)
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="flex h-11 min-w-[44px] items-center justify-center rounded-xl border border-[var(--card-border)] bg-white text-lg font-bold text-vyria-navy active:bg-zinc-100"
                        aria-label="Mais um"
                        onClick={() =>
                          setQty(line.productId, line.quantity + 1)
                        }
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="ml-1 flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 active:bg-red-100"
                        aria-label="Remover linha"
                        onClick={() => removeLine(line.productId)}
                      >
                        <IconTrash className="h-5 w-5" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <form
          ref={formRef}
          onSubmit={onSubmit}
          className="shrink-0 space-y-3 border-t border-[var(--card-border)] bg-white/90 p-3 backdrop-blur md:p-4"
        >
          {error ? (
            <p
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div>
            <label
              htmlFor="pdv-customer"
              className="mb-1 block text-xs font-medium text-vyria-navy-muted"
            >
              Cliente (opcional)
            </label>
            <input
              id="pdv-customer"
              type="text"
              autoComplete="name"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value)
                setSuccessKind(null)
              }}
              className="w-full rounded-xl border border-[var(--card-border)] px-3 py-3 text-base outline-none ring-[var(--dash-primary)] focus:ring-2"
              placeholder="Nome para o cupom"
            />
          </div>

          <div>
            <label
              htmlFor="pdv-internal-notes"
              className="mb-1 block text-xs font-medium text-vyria-navy-muted"
            >
              Notas internas (opcional)
            </label>
            <textarea
              id="pdv-internal-notes"
              rows={2}
              value={internalNotes}
              onChange={(e) => {
                setInternalNotes(e.target.value)
                setSuccessKind(null)
              }}
              className="w-full resize-y rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm outline-none ring-[var(--dash-primary)] focus:ring-2"
              placeholder="Só visível na equipa (ex.: troco, observações)"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-vyria-navy-muted">
              Destino
            </span>
            {cashierPanelEnabled ? (
              <div className="flex rounded-xl border border-[var(--card-border)] bg-zinc-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setCloseMode('cashier')
                    setError(null)
                    setSuccessKind(null)
                  }}
                  className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
                    closeMode === 'cashier'
                      ? 'bg-white text-vyria-navy shadow-sm'
                      : 'text-vyria-navy-muted hover:text-vyria-navy'
                  }`}
                >
                  Enviar para o Caixa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCloseMode('immediate')
                    setError(null)
                    setSuccessKind(null)
                  }}
                  className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
                    closeMode === 'immediate'
                      ? 'bg-white text-vyria-navy shadow-sm'
                      : 'text-vyria-navy-muted hover:text-vyria-navy'
                  }`}
                >
                  Receber agora
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--card-border)] bg-zinc-100 px-3 py-2.5 text-sm font-semibold text-vyria-navy">
                Receber agora
              </div>
            )}
            {closeMode === 'immediate' ? (
              <p className="mt-1.5 text-xs text-vyria-navy-muted">
                {cashierPanelEnabled ? (
                  <>
                    Exige{' '}
                    <Link
                      href="/dashboard/caixa"
                      className="font-semibold text-[var(--dash-primary)] underline"
                    >
                      turno de caixa aberto
                    </Link>{' '}
                    e permissão de Caixa. O pedido fica fechado e pago.
                  </>
                ) : (
                  <>
                    O pedido fica <strong>concluído e pago</strong> no balcão (sem módulo Caixa neste
                    plano).
                  </>
                )}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-vyria-navy-muted">
                O pedido fica pendente até alguém fechar no módulo Caixa.
              </p>
            )}
          </div>

          {closeMode === 'immediate' ? (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-vyria-navy-muted">
                Pagamento
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'cash' as const, label: 'Dinheiro' },
                    { id: 'pix' as const, label: 'PIX' },
                    { id: 'card' as const, label: 'Cartão' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setImmediatePayment(opt.id)
                      setSuccessKind(null)
                      setError(null)
                    }}
                    className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
                      immediatePayment === opt.id
                        ? 'border-[var(--dash-primary)] bg-[var(--dash-primary)]/10 text-vyria-navy ring-2 ring-[var(--dash-primary)]/30'
                        : 'border-[var(--card-border)] bg-white text-vyria-navy hover:bg-zinc-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <label
              htmlFor="pdv-discount"
              className="mb-1 block text-xs font-medium text-vyria-navy-muted"
            >
              Desconto manual (R$)
            </label>
            <input
              id="pdv-discount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={discountInput}
              onChange={(e) => {
                setDiscountInput(e.target.value)
                setSuccessKind(null)
              }}
              className="w-full max-w-[12rem] rounded-xl border border-[var(--card-border)] px-3 py-3 text-base tabular-nums outline-none ring-[var(--dash-primary)] focus:ring-2"
              placeholder="0,00"
            />
            {discountParsed > subtotal ? (
              <p className="mt-1 text-xs text-amber-700">
                Desconto limitado ao subtotal ({money.format(subtotal)}).
              </p>
            ) : null}
          </div>

          <div className="flex items-end justify-between gap-3 border-t border-[var(--card-border)] pt-3">
            <div className="space-y-0.5 text-sm">
              <div className="flex justify-between gap-6 text-vyria-navy-muted">
                <span>Subtotal</span>
                <span className="tabular-nums">{money.format(subtotal)}</span>
              </div>
              {discountApplied > 0 ? (
                <div className="flex justify-between gap-6 text-red-700">
                  <span>Desconto</span>
                  <span className="tabular-nums">
                    −{money.format(discountApplied)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between gap-6 border-t border-[var(--card-border)] pt-1">
                <span className="text-xs font-medium text-vyria-navy-muted">
                  Total a pagar
                </span>
                <p className="text-2xl font-bold tabular-nums text-vyria-navy">
                  {money.format(totalPayable)}
                </p>
              </div>
            </div>
            <button
              type="submit"
              disabled={!cart.length || submitting}
              className="min-h-[52px] min-w-[160px] rounded-2xl bg-[var(--dash-primary)] px-6 text-base font-bold text-white shadow-md shadow-[var(--dash-primary)]/30 transition enabled:hover:opacity-95 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting
                ? 'A lançar…'
                : closeMode === 'immediate'
                  ? 'Receber e fechar'
                  : 'Lançar pedido'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}
