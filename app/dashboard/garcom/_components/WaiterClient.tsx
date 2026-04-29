'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MenuProductRow } from '@/lib/menu-product'
import type { StoreOrderRow } from '@/lib/store-order'
import { effectiveProductPrice } from '@/lib/product-pricing'
import { updateOrderStatus } from '@/services/orders'

type CartLine = {
  productId: string
  name: string
  quantity: number
  unitPrice: number
}

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function parseTableFromNotes(notes: string | null | undefined): string | null {
  const t = notes?.trim()
  if (!t) return null
  const m = t.match(/\[Mesa\s+([^\]]+)\]/i)
  return m?.[1]?.trim() || null
}

function parseSectorFromNotes(notes: string | null | undefined): string {
  const t = notes?.trim()
  if (!t) return 'Salão'
  const m = t.match(/\[Setor\s+([^\]]+)\]/i)
  return m?.[1]?.trim() || 'Salão'
}

function escapeHtml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function statusLabel(status: string | null): string {
  switch (status) {
    case 'pending':
      return 'Pendente'
    case 'preparing':
      return 'Preparando'
    case 'ready':
      return 'Pronto'
    case 'confirmed':
      return 'Entregue à mesa'
    default:
      return status?.trim() || '—'
  }
}

export function WaiterClient({
  storeId,
  initialProducts,
  initialOpenOrders,
  initialSectors,
}: {
  storeId: string
  initialProducts: MenuProductRow[]
  initialOpenOrders: StoreOrderRow[]
  initialSectors: string[]
}) {
  const sectors = useMemo(() => {
    const unique = Array.from(new Set(initialSectors.map((x) => x.trim()).filter(Boolean)))
    return unique.length > 0 ? unique : ['Salão', 'Varanda']
  }, [initialSectors])
  const [query, setQuery] = useState('')
  const [table, setTable] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [notes, setNotes] = useState('')
  const [sector, setSector] = useState<string>(() => sectors[0] || 'Salão')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pix' | 'card'>('cash')
  const [cart, setCart] = useState<CartLine[]>([])
  const [openOrders, setOpenOrders] = useState<StoreOrderRow[]>(initialOpenOrders)
  const [saving, setSaving] = useState(false)
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [canFullscreen, setCanFullscreen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const fullscreenRootRef = useRef<HTMLDivElement>(null)

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return initialProducts
    return initialProducts.filter((p) => {
      const name = p.name.toLowerCase()
      const category = (p.category || '').toLowerCase()
      return name.includes(q) || category.includes(q)
    })
  }, [initialProducts, query])

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [cart]
  )

  const tableSummary = useMemo(() => {
    const m = new Map<string, { count: number; sector: string }>()
    for (const order of openOrders) {
      const tableLabel = parseTableFromNotes(order.notes) || 'Sem mesa'
      const current = m.get(tableLabel)
      const orderSector = parseSectorFromNotes(order.notes)
      if (!current) {
        m.set(tableLabel, { count: 1, sector: orderSector })
      } else {
        m.set(tableLabel, { count: current.count + 1, sector: current.sector })
      }
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt'))
  }, [openOrders])

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

  function addProduct(product: MenuProductRow) {
    const price = effectiveProductPrice(product)
    setCart((prev) => {
      const i = prev.findIndex((x) => x.productId === product.id)
      if (i >= 0) {
        const next = [...prev]
        next[i] = { ...next[i], quantity: next[i].quantity + 1 }
        return next
      }
      return [
        ...prev,
        { productId: product.id, name: product.name, quantity: 1, unitPrice: price },
      ]
    })
    setError(null)
    setSuccess(null)
  }

  function setLineQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((x) => x.productId !== productId))
      return
    }
    setCart((prev) =>
      prev.map((x) => (x.productId === productId ? { ...x, quantity: qty } : x))
    )
  }

  function printComanda() {
    if (!table.trim() || cart.length === 0) {
      setError('Adicione itens e informe a mesa para imprimir a comanda.')
      return
    }
    const win = window.open('', '_blank', 'width=420,height=700')
    if (!win) {
      setError('Não foi possível abrir a janela de impressão.')
      return
    }
    const rows = cart
      .map(
        (line) =>
          `<tr><td>${line.quantity}x</td><td>${escapeHtml(line.name)}</td><td style="text-align:right">${money.format(line.unitPrice * line.quantity)}</td></tr>`
      )
      .join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Comanda</title></head><body style="font-family:Arial,sans-serif;padding:12px"><h2>Comanda da Mesa ${escapeHtml(
      table.trim()
    )}</h2><p>Setor: ${escapeHtml(sector)}</p><table style="width:100%;font-size:14px">${rows}</table><hr/><p style="text-align:right;font-weight:bold">Total: ${money.format(
      subtotal
    )}</p></body></html>`
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  async function submitOrder() {
    if (!table.trim()) {
      setError('Informe a mesa para registrar o pedido.')
      return
    }
    if (cart.length === 0) {
      setError('Adicione ao menos um item ao pedido.')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/waiter/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: table.trim(),
          sector,
          customer_name: customerName.trim() || null,
          payment_method: paymentMethod,
          notes: notes.trim() || null,
          items: cart.map((line) => ({
            product_id: line.productId,
            quantity: line.quantity,
            unit_price: line.unitPrice,
            name: line.name,
          })),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        orderId?: string
        order?: StoreOrderRow
      }
      if (!res.ok) {
        setError(json.error || 'Não foi possível criar o pedido da mesa.')
        return
      }
      setSuccess(`Pedido da mesa ${table.trim()} criado com sucesso.`)
      if (json.order) {
        setOpenOrders((prev) => [json.order as StoreOrderRow, ...prev])
      }
      setCart([])
      setCustomerName('')
      setNotes('')
    } finally {
      setSaving(false)
    }
  }

  async function advanceOrder(order: StoreOrderRow) {
    const current = order.status || 'pending'
    const next =
      current === 'pending'
        ? 'preparing'
        : current === 'preparing'
          ? 'ready'
          : current === 'ready'
            ? 'confirmed'
            : null
    if (!next) return
    setBusyOrderId(order.id)
    const { error: upError } = await updateOrderStatus(order.id, next)
    setBusyOrderId(null)
    if (upError) {
      setError(upError.message)
      return
    }
    setOpenOrders((prev) => prev.map((x) => (x.id === order.id ? { ...x, status: next } : x)))
  }

  async function closeOrder(order: StoreOrderRow) {
    setBusyOrderId(order.id)
    const { error: upError } = await updateOrderStatus(order.id, 'delivered')
    setBusyOrderId(null)
    if (upError) {
      setError(upError.message)
      return
    }
    // mesa liberada automaticamente quando a conta é fechada
    setOpenOrders((prev) => prev.filter((x) => x.id !== order.id))
    setSuccess(`Conta da mesa ${parseTableFromNotes(order.notes) || '—'} fechada.`)
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
      className={`mx-auto w-full ${isFullscreen ? 'max-w-none bg-[var(--dash-surface)] p-3' : 'max-w-7xl'}`}
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
      <nav className="text-xs text-vyria-navy-muted">
        <Link href="/dashboard" className="hover:text-vyria-navy">
          Início
        </Link>
        <span className="mx-1">/</span>
        <span className="font-medium text-vyria-navy">Garçom</span>
      </nav>

      <header className="mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-brand text-2xl font-bold text-vyria-navy md:text-3xl">
              Garçom — Pedidos por mesa
            </h1>
            <p className="mt-1 text-sm text-vyria-navy-muted">
              Registre pedidos nas mesas, envie para produção e acompanhe o andamento em tempo real.
            </p>
          </div>
          {canFullscreen && !isFullscreen ? (
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="rounded-xl border border-[var(--card-border)] bg-white px-3 py-2 text-xs font-semibold text-vyria-navy transition hover:bg-zinc-50"
            >
              Ecrã completo
            </button>
          ) : null}
        </div>
      </header>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar produtos..."
              className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm outline-none ring-[var(--dash-primary)] focus:ring-2 sm:max-w-xs"
            />
            <span className="text-xs text-vyria-navy-muted">
              {filteredProducts.length} itens
            </span>
          </div>

          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((p) => {
              const price = effectiveProductPrice(p)
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addProduct(p)}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-3 text-left shadow-sm transition hover:border-[var(--dash-primary)]/40 hover:bg-[var(--dash-primary)]/5"
                  >
                    <p className="line-clamp-2 text-sm font-semibold text-vyria-navy">{p.name}</p>
                    <p className="mt-1 text-xs text-vyria-navy-muted">{p.category || 'Sem categoria'}</p>
                    <p className="mt-1 text-sm font-bold text-[var(--dash-primary)]">
                      {money.format(price)}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-vyria-navy">Novo pedido de mesa</h2>
            <div className="mt-3 grid gap-2">
              <input
                value={table}
                onChange={(e) => setTable(e.target.value)}
                placeholder="Mesa (ex.: 03 ou Varanda 2)"
                className="rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                {sectors.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSector(name)}
                    className={`rounded-xl border px-2 py-2 text-xs font-semibold ${
                      sector === name
                        ? 'border-[var(--dash-primary)] bg-[var(--dash-primary)]/10 text-vyria-navy'
                        : 'border-[var(--card-border)] bg-white text-vyria-navy-muted'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Cliente (opcional)"
                className="rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Observações internas"
                className="resize-y rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'cash', label: 'Dinheiro' },
                    { id: 'pix', label: 'PIX' },
                    { id: 'card', label: 'Cartão' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPaymentMethod(opt.id)}
                    className={`rounded-xl border px-2 py-2 text-xs font-semibold ${
                      paymentMethod === opt.id
                        ? 'border-[var(--dash-primary)] bg-[var(--dash-primary)]/10 text-vyria-navy'
                        : 'border-[var(--card-border)] bg-white text-vyria-navy-muted'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-[var(--card-border)] bg-zinc-50 p-3">
              <p className="text-xs text-vyria-navy-muted">Itens no pedido</p>
              {cart.length === 0 ? (
                <p className="mt-1 text-sm text-vyria-navy-muted">Nenhum item adicionado.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {cart.map((line) => (
                    <li key={line.productId} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-vyria-navy">{line.name}</p>
                        <p className="text-xs text-vyria-navy-muted">
                          {money.format(line.unitPrice)} cada
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setLineQty(line.productId, line.quantity - 1)}
                          className="h-8 w-8 rounded-lg border border-[var(--card-border)] text-sm"
                        >
                          -
                        </button>
                        <span className="w-7 text-center text-sm font-semibold">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => setLineQty(line.productId, line.quantity + 1)}
                          className="h-8 w-8 rounded-lg border border-[var(--card-border)] text-sm"
                        >
                          +
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-right text-lg font-bold text-vyria-navy">
                {money.format(subtotal)}
              </p>
            </div>

            {error ? (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
            ) : null}
            {success ? (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</p>
            ) : null}

            <button
              type="button"
              disabled={saving || cart.length === 0}
              onClick={() => void submitOrder()}
              className="mt-3 w-full rounded-xl bg-[var(--dash-primary)] px-4 py-3 text-sm font-bold text-white shadow-md shadow-[var(--dash-primary)]/30 disabled:opacity-50"
            >
              {saving ? 'Registrando...' : 'Registrar pedido da mesa'}
            </button>
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={printComanda}
              className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm font-semibold text-vyria-navy disabled:opacity-50"
            >
              Imprimir comanda
            </button>
          </div>

          <div className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-vyria-navy">Mesas em atendimento</h2>
            {tableSummary.length === 0 ? (
              <p className="mt-2 text-sm text-vyria-navy-muted">Nenhuma mesa ativa agora.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {tableSummary.map(([tableLabel, data]) => (
                  <li key={tableLabel} className="flex items-center justify-between rounded-lg border border-[var(--card-border)] px-3 py-2">
                    <span className="text-sm font-semibold text-vyria-navy">
                      Mesa {tableLabel}{' '}
                      <span className="font-medium text-vyria-navy-muted">({data.sector})</span>
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                      {data.count} pedido{data.count > 1 ? 's' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-vyria-navy">Pedidos abertos das mesas</h2>
        {openOrders.length === 0 ? (
          <p className="mt-2 text-sm text-vyria-navy-muted">Sem pedidos em aberto.</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {openOrders.map((order) => {
              const nextLabel =
                order.status === 'pending'
                  ? 'Iniciar preparo'
                  : order.status === 'preparing'
                    ? 'Marcar pronto'
                    : order.status === 'ready'
                      ? 'Finalizar mesa'
                      : null
              return (
                <li key={order.id} className="rounded-xl border border-[var(--card-border)] p-3">
                  <p className="text-xs text-vyria-navy-muted">
                    Mesa {parseTableFromNotes(order.notes) || '—'} · {parseSectorFromNotes(order.notes)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-vyria-navy">
                    {order.items_summary || 'Itens não informados'}
                  </p>
                  <p className="mt-1 text-xs text-vyria-navy-muted">
                    {statusLabel(order.status)} · {money.format(Number(order.total) || 0)}
                  </p>
                  {nextLabel ? (
                    <button
                      type="button"
                      disabled={busyOrderId === order.id}
                      onClick={() => void advanceOrder(order)}
                      className="mt-3 w-full rounded-lg border border-[var(--card-border)] bg-zinc-50 px-3 py-2 text-xs font-semibold text-vyria-navy hover:bg-zinc-100 disabled:opacity-50"
                    >
                      {busyOrderId === order.id ? 'Atualizando...' : nextLabel}
                    </button>
                  ) : null}
                  {order.status === 'confirmed' ? (
                    <button
                      type="button"
                      disabled={busyOrderId === order.id}
                      onClick={() => void closeOrder(order)}
                      className="mt-2 w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {busyOrderId === order.id ? 'Fechando...' : 'Fechar conta e liberar mesa'}
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

