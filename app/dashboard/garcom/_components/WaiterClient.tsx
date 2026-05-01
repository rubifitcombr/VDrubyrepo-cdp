'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MenuProductRow } from '@/lib/menu-product'
import { effectiveProductPrice } from '@/lib/product-pricing'
import type { StoreOrderRow } from '@/lib/store-order'
import {
  extractUserNotes,
  parseDiscountFromNotes,
  parseSectorFromNotes,
  parseTableFromNotes,
} from '@/lib/waiter-order-notes'
import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import { updateOrderStatus } from '@/services/orders'

type CartLine = {
  productId: string
  name: string
  quantity: number
  unitPrice: number
}

export type StoreTableDTO = {
  id: string
  name: string
  ambiente: string
  sort_order: number
  active: boolean
}

type OrderItemDTO = {
  product_id: string
  quantity: number
  unit_price: number
  price?: number | null
  name: string
}

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

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
      return 'Em preparo'
    case 'ready':
      return 'Pronto'
    case 'confirmed':
      return 'Entregue à mesa'
    default:
      return status?.trim() || '—'
  }
}

function orderMatchesTable(o: StoreOrderRow, tableName: string, amb: string): boolean {
  const tn = parseTableFromNotes(o.notes) || ''
  const sc = parseSectorFromNotes(o.notes)
  return (
    tn.trim().toLowerCase() === tableName.trim().toLowerCase() &&
    sc.trim().toLowerCase() === amb.trim().toLowerCase()
  )
}

function ordersOnTable(openOrders: StoreOrderRow[], tableName: string, amb: string): StoreOrderRow[] {
  return openOrders
    .filter((o) => orderMatchesTable(o, tableName, amb))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

function tableState(
  openOrders: StoreOrderRow[],
  tableName: string,
  amb: string
): 'free' | 'pending_kitchen' | 'occupied' {
  const list = ordersOnTable(openOrders, tableName, amb)
  if (list.length === 0) return 'free'
  if (list.some((o) => (o.status || '').toLowerCase() === 'pending')) return 'pending_kitchen'
  return 'occupied'
}

function aggregateTable(openOrders: StoreOrderRow[], tableName: string, amb: string) {
  const list = ordersOnTable(openOrders, tableName, amb)
  const total = list.reduce((s, o) => s + (Number(o.total) || 0), 0)
  const itemsApprox = list.reduce((s, o) => {
    const sum = (o.items_summary || '').split(',').length
    return s + Math.max(1, sum)
  }, 0)
  return { list, total, itemsApprox, primary: list[0] ?? null }
}

function sectorBadgeClass(amb: string): string {
  const h = amb.trim().toLowerCase()
  if (h.includes('varanda')) return 'bg-emerald-100 text-emerald-900 ring-emerald-200'
  if (h.includes('salão') || h.includes('salao')) return 'bg-sky-100 text-sky-900 ring-sky-200'
  return 'bg-violet-100 text-violet-900 ring-violet-200'
}

export function WaiterClient({
  initialProducts,
  initialOpenOrders,
  initialSectors,
  initialTables,
  stockQuantityByProductId,
  waiterExitPin,
}: {
  initialProducts: MenuProductRow[]
  initialOpenOrders: StoreOrderRow[]
  initialSectors: string[]
  initialTables: StoreTableDTO[]
  stockQuantityByProductId: Record<string, number>
  waiterExitPin: string
}) {
  const sectors = useMemo(() => {
    const fromTables = initialTables.map((t) => t.ambiente.trim()).filter(Boolean)
    const merged = [...initialSectors, ...fromTables]
    const unique = Array.from(new Set(merged.map((x) => x.trim()).filter(Boolean)))
    return unique.length > 0 ? unique : ['Salão', 'Varanda']
  }, [initialSectors, initialTables])

  const [tables, setTables] = useState(initialTables)
  const [openOrders, setOpenOrders] = useState(initialOpenOrders)
  const [query, setQuery] = useState('')
  const [categoryTab, setCategoryTab] = useState<string>('Todos')
  const [centerTab, setCenterTab] = useState<'map' | 'order'>('map')
  const [table, setTable] = useState('')
  const [sector, setSector] = useState<string>(() => sectors[0] || 'Salão')
  const [customerName, setCustomerName] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pix' | 'card'>('cash')
  const [cart, setCart] = useState<CartLine[]>([])
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null)
  const [discountBrl, setDiscountBrl] = useState(0)
  const [discountOpen, setDiscountOpen] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [canFullscreen, setCanFullscreen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mobileScreenOpen, setMobileScreenOpen] = useState(false)
  const fullscreenRootRef = useRef<HTMLDivElement>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [configAmbTab, setConfigAmbTab] = useState<string>(sectors[0] || 'Salão')
  const [newTableName, setNewTableName] = useState('')
  const [newAmbienteName, setNewAmbienteName] = useState('')
  const [savingTables, setSavingTables] = useState(false)
  const [tablesSaveError, setTablesSaveError] = useState<string | null>(null)
  const [avulsaOpen, setAvulsaOpen] = useState(false)
  const [avulsaName, setAvulsaName] = useState('')
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const [loadingOrder, setLoadingOrder] = useState(false)
  const [menuSheetOpen, setMenuSheetOpen] = useState(false)
  const [orderDrawerOpen, setOrderDrawerOpen] = useState(false)
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null)
  const [tableActionSheetOpen, setTableActionSheetOpen] = useState(false)
  const [pinExitOpen, setPinExitOpen] = useState(false)
  const [pinAttempt, setPinAttempt] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const router = useRouter()
  const avulsaToggleRef = useRef<HTMLButtonElement>(null)
  const avulsaPopoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTables(initialTables)
  }, [initialTables])
  useEffect(() => {
    setOpenOrders(initialOpenOrders)
  }, [initialOpenOrders])

  useEffect(() => {
    const root = typeof document !== 'undefined' ? (document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void
    }) : null
    const hasApi = !!(root && (root.requestFullscreen || root.webkitRequestFullscreen))
    setCanFullscreen(hasApi)
    if (!hasApi) return
    const sync = () =>
      setIsFullscreen(document.fullscreenElement === fullscreenRootRef.current)
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  useEffect(() => {
    if (!avulsaOpen) return

    function handleOutsideClick(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null
      if (!target) return
      if (avulsaPopoverRef.current?.contains(target)) return
      if (avulsaToggleRef.current?.contains(target)) return
      setAvulsaOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('touchstart', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('touchstart', handleOutsideClick)
    }
  }, [avulsaOpen])

  useEffect(() => {
    if (!mobileScreenOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileScreenOpen])

  const categories = useMemo(() => {
    const c = new Set<string>()
    for (const p of initialProducts) {
      const cat = (p.category || '').trim() || 'Sem categoria'
      c.add(cat)
    }
    return Array.from(c).sort((a, b) => a.localeCompare(b, 'pt'))
  }, [initialProducts])

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase()
    return initialProducts.filter((p) => {
      if (categoryTab !== 'Todos') {
        const cat = (p.category || '').trim() || 'Sem categoria'
        if (cat !== categoryTab) return false
      }
      if (!q) return true
      const name = p.name.toLowerCase()
      const category = (p.category || '').toLowerCase()
      return name.includes(q) || category.includes(q)
    })
  }, [initialProducts, query, categoryTab])

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [cart]
  )
  const total = Math.max(0, Math.round((subtotal - discountBrl) * 100) / 100)

  const isOutOfStock = useCallback(
    (productId: string) =>
      Object.prototype.hasOwnProperty.call(stockQuantityByProductId, productId) &&
      (stockQuantityByProductId[productId] ?? 0) <= 0,
    [stockQuantityByProductId]
  )

  const activeOrder = useMemo(
    () => openOrders.find((o) => o.id === activeOrderId) ?? null,
    [openOrders, activeOrderId]
  )

  const hasSavedOrder = !!activeOrderId && !!activeOrder

  async function loadOrderEditor(order: StoreOrderRow, openDrawer = true) {
    setLoadingOrder(true)
    setError(null)
    try {
      const res = await dashboardFetch(`/api/waiter/orders/${order.id}`)
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        order?: StoreOrderRow
        items?: OrderItemDTO[]
      }
      if (!res.ok) {
        setError(json.error || 'Não foi possível carregar o pedido.')
        return
      }
      const o = json.order ?? order
      const lines = (json.items ?? []).map((it) => ({
        productId: String(it.product_id),
        name: String(it.name || 'Item'),
        quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
        unitPrice: Number(it.unit_price ?? it.price) || 0,
      }))
      setActiveOrderId(o.id)
      setTable(parseTableFromNotes(o.notes) || '')
      setSector(parseSectorFromNotes(o.notes))
      setCustomerName(o.customer_name?.trim() || '')
      setNotes(extractUserNotes(o.notes))
      const pm = String(o.payment_method || 'cash').toLowerCase()
      setPaymentMethod(pm === 'pix' ? 'pix' : pm === 'card' ? 'card' : 'cash')
      setCart(lines)
      setDiscountBrl(parseDiscountFromNotes(o.notes))
      setDiscountOpen(false)
      setCenterTab('map')
      if (openDrawer) setOrderDrawerOpen(true)
      setSelectedTableKey(`${parseSectorFromNotes(o.notes)}::${parseTableFromNotes(o.notes) || ''}`)
    } finally {
      setLoadingOrder(false)
    }
  }

  function selectFreeTable(name: string, amb: string, openDrawer = true) {
    setSelectedTableKey(`${amb}::${name}`)
    setActiveOrderId(null)
    setTable(name)
    setSector(amb)
    setCart([])
    setCustomerName('')
    setNotes('')
    setDiscountBrl(0)
    setDiscountOpen(false)
    setPaymentMethod('cash')
    setCenterTab('map')
    if (openDrawer) setOrderDrawerOpen(true)
  }

  function isMobileViewport() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  }

  async function handleTablePress(tb: StoreTableDTO) {
    const st = tableState(openOrders, tb.name, tb.ambiente)
    const agg = aggregateTable(openOrders, tb.name, tb.ambiente)
    const mobile = isMobileViewport()

    if (st === 'free') {
      selectFreeTable(tb.name, tb.ambiente, !mobile)
    } else if (agg.primary) {
      await loadOrderEditor(agg.primary, !mobile)
    }

    if (mobile) setTableActionSheetOpen(true)
  }

  function addProduct(product: MenuProductRow) {
    if (isOutOfStock(product.id)) return
    const price = effectiveProductPrice(product)
    setCart((prev) => {
      const i = prev.findIndex((x) => x.productId === product.id)
      if (i >= 0) {
        const next = [...prev]
        next[i] = { ...next[i], quantity: next[i].quantity + 1 }
        return next
      }
      return [...prev, { productId: product.id, name: product.name, quantity: 1, unitPrice: price }]
    })
    setError(null)
    setSuccess(null)
    setCenterTab('order')
    setOrderDrawerOpen(true)
  }

  function setLineQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((x) => x.productId !== productId))
      return
    }
    setCart((prev) => prev.map((x) => (x.productId === productId ? { ...x, quantity: qty } : x)))
  }

  function printComanda() {
    if (!table.trim()) {
      setError('Informa a mesa para imprimir.')
      return
    }
    if (cart.length === 0) {
      setError('Adiciona itens para imprimir.')
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
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Comanda</title></head><body style="font-family:Arial,sans-serif;padding:12px"><h2>Comanda ${escapeHtml(
      table.trim()
    )}</h2><p>Ambiente: ${escapeHtml(sector)}</p><table style="width:100%;font-size:14px">${rows}</table><hr/><p style="text-align:right;font-weight:bold">Total: ${money.format(
      total
    )}</p></body></html>`
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  async function submitNewOrder() {
    if (!table.trim()) {
      setError('Informe a mesa.')
      return
    }
    if (cart.length === 0) {
      setError('Adiciona ao menos um item.')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await dashboardFetch('/api/waiter/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: table.trim(),
          sector,
          customer_name: customerName.trim() || null,
          payment_method: paymentMethod,
          notes: notes.trim() || null,
          discount_brl: discountBrl,
          items: cart.map((line) => ({
            product_id: line.productId,
            quantity: line.quantity,
            unit_price: line.unitPrice,
            name: line.name,
          })),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; order?: StoreOrderRow }
      if (!res.ok) {
        setError(json.error || 'Erro ao registar.')
        return
      }
      setSuccess('Pedido registado.')
      if (json.order) setOpenOrders((prev) => [json.order as StoreOrderRow, ...prev])
      setCart([])
      setDiscountBrl(0)
      setCustomerName('')
      setNotes('')
      setActiveOrderId(null)
      setCenterTab('map')
    } finally {
      setSaving(false)
    }
  }

  async function saveExistingOrder() {
    if (!activeOrderId || !table.trim() || cart.length === 0) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await dashboardFetch(`/api/waiter/orders/${activeOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: table.trim(),
          sector,
          customer_name: customerName.trim() || null,
          payment_method: paymentMethod,
          notes: notes.trim() || null,
          discount_brl: discountBrl,
          items: cart.map((line) => ({
            product_id: line.productId,
            quantity: line.quantity,
            unit_price: line.unitPrice,
            name: line.name,
          })),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; order?: StoreOrderRow }
      if (!res.ok) {
        setError(json.error || 'Erro ao guardar.')
        return
      }
      setSuccess('Alterações guardadas.')
      if (json.order) {
        setOpenOrders((prev) => prev.map((x) => (x.id === json.order!.id ? (json.order as StoreOrderRow) : x)))
      }
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

  async function confirmToTable(order: StoreOrderRow) {
    setBusyOrderId(order.id)
    const { error: upError } = await updateOrderStatus(order.id, 'confirmed')
    setBusyOrderId(null)
    if (upError) {
      setError(upError.message)
      return
    }
    setOpenOrders((prev) => prev.map((x) => (x.id === order.id ? { ...x, status: 'confirmed' } : x)))
  }

  async function closeOrderDelivered(order: StoreOrderRow) {
    setBusyOrderId(order.id)
    const { error: upError } = await updateOrderStatus(order.id, 'delivered')
    setBusyOrderId(null)
    if (upError) {
      setError(upError.message)
      return
    }
    setOpenOrders((prev) => prev.filter((x) => x.id !== order.id))
    if (activeOrderId === order.id) {
      setActiveOrderId(null)
      setCart([])
      setConfirmCloseOpen(false)
    }
    setSuccess('Mesa recebida e pedido fechado.')
  }

  async function toggleFullscreen() {
    if (!fullscreenRootRef.current) return
    const onMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
    const inScreenMode = isFullscreen || mobileScreenOpen
    if (inScreenMode) {
      if (!waiterExitPin) {
        setError('Configure o PIN do Garçom nas Configurações para sair do ecrã.')
        return
      }
      setPinAttempt('')
      setPinError(null)
      setPinExitOpen(true)
      return
    }
    if (!waiterExitPin) {
      setError('Defina o PIN do Garçom nas Configurações antes de abrir o ecrã.')
      return
    }
    if (onMobile) {
      setMobileScreenOpen(true)
      return
    }
    if (!canFullscreen) {
      setError('Ecrã completo indisponível neste dispositivo.')
      return
    }
    const el = fullscreenRootRef.current as HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void> | void
    }
    try {
      await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())
    } catch {
      setError('Ecrã completo indisponível.')
    }
  }

  async function confirmExitWithPin() {
    if (!waiterExitPin) {
      setPinError('PIN do Garçom não configurado.')
      return
    }
    if (pinAttempt !== waiterExitPin) {
      setPinError('PIN inválido.')
      return
    }
    const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void }
    try {
      if (mobileScreenOpen) {
        setMobileScreenOpen(false)
      } else {
        await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
      }
      setPinExitOpen(false)
      setPinAttempt('')
      setPinError(null)
    } catch {
      setPinError('Não foi possível sair do ecrã completo.')
    }
  }

  async function saveTableConfig() {
    setSavingTables(true)
    setTablesSaveError(null)
    try {
      const res = await dashboardFetch('/api/waiter/tables', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables: tables.map((t, i) => ({
            name: t.name,
            ambiente: t.ambiente,
            sort_order: t.sort_order ?? i,
            active: t.active !== false,
          })),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; tables?: StoreTableDTO[] }
      if (!res.ok) {
        setTablesSaveError(json.error || 'Erro ao guardar mesas.')
        return
      }
      setTables(json.tables ?? [])
      setConfigOpen(false)
      setTablesSaveError(null)
      setError(null)
      setSuccess('Mesas atualizadas.')
      router.refresh()
    } finally {
      setSavingTables(false)
    }
  }

  function addConfiguredTable() {
    const n = newTableName.trim()
    if (!n) return
    setTables((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        name: n.slice(0, 42),
        ambiente: configAmbTab,
        sort_order: prev.filter((t) => t.ambiente === configAmbTab).length,
        active: true,
      },
    ])
    setNewTableName('')
  }

  function removeConfiguredTable(id: string) {
    setTables((prev) => prev.filter((t) => t.id !== id))
  }

  function addNewAmbiente() {
    const n = newAmbienteName.trim()
    if (!n) return
    setConfigAmbTab(n)
    setNewAmbienteName('')
  }

  const ambientesInConfig = useMemo(() => {
    const s = new Set<string>()
    sectors.forEach((x) => s.add(x))
    tables.forEach((t) => s.add(t.ambiente))
    s.add(configAmbTab)
    return Array.from(s)
  }, [sectors, tables, configAmbTab])

  const tablesByAmbiente = useMemo(() => {
    const m = new Map<string, StoreTableDTO[]>()
    for (const t of tables) {
      const k = t.ambiente || 'Salão'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(t)
    }
    for (const v of m.values()) {
      v.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'pt'))
    }
    return m
  }, [tables])

  const workspaceClass =
    'flex min-h-0 flex-1 flex-col md:h-[min(1080px,calc(100dvh-7.5rem))] md:max-h-[calc(100dvh-7.5rem)]'
  const inScreenMode = isFullscreen || mobileScreenOpen

  return (
    <div
      ref={fullscreenRootRef}
      className={`flex min-h-0 flex-col bg-[var(--color-background-secondary)] ${
        inScreenMode ? 'fixed inset-0 z-[60] max-w-none p-0' : '-mx-4 px-4 pb-4 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6'
      }`}
    >
      {inScreenMode ? (
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="fixed right-3 top-3 z-[80] inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/35 bg-black/65 text-sm font-bold text-white shadow-lg backdrop-blur-sm hover:bg-black/75"
          aria-label="Fechar ecrã completo"
        >
          ×
        </button>
      ) : null}

      <nav className="shrink-0 py-2 text-xs text-[#6b7280]">
        <Link href="/dashboard" className="hover:text-[#1a1614]">
          Início
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-[#1a1614]">Garçom</span>
      </nav>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#1a1614]">Operação salão</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#6b7280] ring-1 ring-[var(--card-border)]">
            {openOrders.length} pedidos abertos
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!inScreenMode ? (
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] shadow-sm transition hover:bg-[#f9fafb]"
            >
              Abrir ecrã
            </button>
          ) : null}
        </div>
      </div>

      {/* Mobile toggles */}
      <div className="mb-2 flex gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setMenuSheetOpen(true)}
          className="flex-1 rounded-xl border border-[var(--card-border)] bg-white py-2 text-sm font-semibold text-[#1a1614] shadow-sm"
        >
          Cardápio
        </button>
        <button
          type="button"
          onClick={() => setOrderDrawerOpen(true)}
          className="flex-1 rounded-xl bg-[var(--dash-primary)] py-2 text-sm font-semibold text-white shadow-sm"
        >
          Pedido
        </button>
      </div>

      <div className={`${workspaceClass} gap-3 md:flex-row md:gap-0 md:overflow-hidden`}>
        {/* Coluna esquerda — desktop */}
        <aside className="hidden min-h-0 w-full shrink-0 flex-col border-r border-[var(--card-border)]/80 bg-[#f4f5f7] md:flex md:w-[400px] md:min-w-[400px]">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--card-border)]/60 px-3 py-2.5">
            <p className="text-[13px] font-semibold text-[#1a1614]">
              Cardápio{' '}
              <span className="font-normal text-[#6b7280]">({initialProducts.length} itens)</span>
            </p>
          </div>
          <div className="shrink-0 border-b border-[var(--card-border)]/60 px-3 py-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
                  />
                </svg>
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full rounded-lg border border-[var(--card-border)] bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[var(--dash-primary)]/40 focus:ring-2 focus:ring-[var(--dash-primary)]/15"
              />
            </div>
          </div>
          <div className="shrink-0 border-b border-[var(--card-border)]/60 px-2 py-2">
            <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setCategoryTab('Todos')}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition duration-150 ${
                  categoryTab === 'Todos'
                    ? 'bg-[var(--dash-primary)] text-white'
                    : 'bg-white text-[#6b7280] ring-1 ring-[var(--card-border)]'
                }`}
              >
                Todos
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryTab(c)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition duration-150 ${
                    categoryTab === c
                      ? 'bg-[var(--dash-primary)] text-white'
                      : 'bg-white text-[#6b7280] ring-1 ring-[var(--card-border)]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <ul className="grid grid-cols-2 gap-2">
              {filteredProducts.map((p) => {
                const price = effectiveProductPrice(p)
                const oos = isOutOfStock(p.id)
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={oos}
                      onClick={() => addProduct(p)}
                      className={`flex w-full flex-col rounded-lg border bg-white p-2 text-left transition duration-150 ${
                        oos
                          ? 'cursor-not-allowed border-[var(--card-border)] opacity-40'
                          : 'border-[var(--card-border)] hover:border-[var(--dash-primary)] hover:shadow-sm active:scale-[0.98]'
                      }`}
                    >
                      <span className="line-clamp-2 text-[13px] font-medium leading-snug text-[#1a1614]">
                        {p.name}
                      </span>
                      <span className="mt-0.5 text-[11px] text-[#6b7280]">
                        {(p.category || '').trim() || 'Sem categoria'}
                      </span>
                      <span className="mt-1 text-[13px] font-semibold text-[var(--dash-primary)]">
                        {money.format(price)}
                      </span>
                      {oos ? (
                        <span className="mt-1 inline-flex w-fit rounded bg-zinc-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-zinc-600">
                          Sem estoque
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>

        {/* Centro */}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--card-border)] bg-white shadow-sm md:rounded-none md:border-0 md:shadow-none">
          <div className="flex shrink-0 border-b border-[var(--card-border)]">
            <button
              type="button"
              onClick={() => setCenterTab('map')}
              className={`w-full px-3 py-2.5 text-sm font-semibold transition duration-150 ${
                centerTab === 'map'
                  ? 'border-b-2 border-[var(--dash-primary)] text-[var(--dash-primary)]'
                  : 'text-[#6b7280] hover:text-[#1a1614]'
              }`}
            >
              Mapa de Mesas
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-[#1a1614]">Mesas</h2>
                <button
                  type="button"
                  onClick={() => {
                    setTablesSaveError(null)
                    setSuccess(null)
                    setConfigOpen(true)
                    setConfigAmbTab(sectors[0] || 'Salão')
                  }}
                  className="rounded-lg border border-[var(--card-border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#374151] shadow-sm hover:bg-[#f9fafb]"
                >
                  + Configurar mesas
                </button>
              </div>
              <p className="mt-1 text-[11px] text-[#6b7280]">
                <span className="mr-2">🟢 Livre</span>
                <span className="mr-2">🟠 Ocupada</span>
                <span>🔵 Em preparo (pendente cozinha)</span>
              </p>

              {tables.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-[var(--card-border)] bg-[#fafafa] p-4 text-sm text-[#6b7280]">
                  Ainda não há mesas configuradas. Usa «Configurar mesas» ou «Nova mesa avulsa».
                </p>
              ) : (
                <div className="mt-4 space-y-6">
                  {Array.from(tablesByAmbiente.entries()).map(([amb, list]) => (
                    <div key={amb}>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
                        {amb}
                      </p>
                      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {list.map((tb) => {
                          const st = tableState(openOrders, tb.name, tb.ambiente)
                          const agg = aggregateTable(openOrders, tb.name, tb.ambiente)
                          const sel =
                            selectedTableKey === `${tb.ambiente}::${tb.name}` &&
                            table.trim().toLowerCase() === tb.name.trim().toLowerCase() &&
                            sector === tb.ambiente
                          const base =
                            st === 'free'
                              ? 'border-[var(--card-border)] bg-white'
                              : st === 'pending_kitchen'
                                ? 'border-sky-400 bg-sky-50'
                                : 'border-amber-400 bg-amber-50/90'
                          return (
                            <li key={tb.id}>
                              <button
                                type="button"
                                onClick={() => void handleTablePress(tb)}
                                className={`flex w-full flex-col items-center rounded-lg border p-3 text-center transition duration-150 ${base} ${
                                  sel ? 'ring-2 ring-[var(--dash-primary)] ring-offset-2' : ''
                                } hover:shadow-md`}
                              >
                                <span className="text-2xl font-bold tabular-nums text-[#1a1614]">
                                  {tb.name}
                                </span>
                                {st === 'free' ? (
                                  <span className="mt-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                    Livre
                                  </span>
                                ) : st === 'pending_kitchen' ? (
                                  <>
                                    <span className="mt-2 rounded-full bg-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-900">
                                      Em preparo
                                    </span>
                                    <span className="mt-1 text-xs font-semibold text-sky-900">
                                      {money.format(agg.total)}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="mt-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                                      Ocupada
                                    </span>
                                    <span className="mt-1 text-xs font-semibold text-amber-900">
                                      {money.format(agg.total)}
                                    </span>
                                    <span className="text-[10px] text-amber-800/90">
                                      {agg.itemsApprox} itens
                                    </span>
                                  </>
                                )}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                ref={avulsaToggleRef}
                onClick={() => setAvulsaOpen((v) => !v)}
                className="absolute bottom-4 right-4 rounded-full bg-[var(--dash-primary)] px-4 py-2.5 text-xs font-bold text-white shadow-lg transition hover:brightness-105"
              >
                + Nova mesa avulsa
              </button>
              {avulsaOpen ? (
                <div
                  ref={avulsaPopoverRef}
                  className="absolute bottom-16 right-4 z-10 w-56 rounded-xl border border-[var(--card-border)] bg-white p-3 shadow-xl"
                >
                  <input
                    value={avulsaName}
                    onChange={(e) => setAvulsaName(e.target.value)}
                    placeholder="Nome / número"
                    className="w-full rounded-lg border border-[var(--card-border)] px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    className="mt-2 w-full rounded-lg bg-[#1a1614] py-1.5 text-xs font-semibold text-white"
                    onClick={() => {
                      const n = avulsaName.trim()
                      if (!n) return
                      selectFreeTable(n, sector)
                      setAvulsaOpen(false)
                      setAvulsaName('')
                    }}
                  >
                    Usar mesa
                  </button>
                </div>
              ) : null}
          </div>
        </main>

        {/* Direita — desktop */}
        <aside className="relative hidden min-h-0 w-[320px] min-w-[320px] flex-col border-l border-[var(--card-border)]/80 bg-white md:flex">
          <OrderPanelContent
            table={table}
            setTable={setTable}
            sector={sector}
            customerName={customerName}
            setCustomerName={setCustomerName}
            notes={notes}
            setNotes={setNotes}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            cart={cart}
            setLineQty={setLineQty}
            subtotal={subtotal}
            discountBrl={discountBrl}
            discountOpen={discountOpen}
            setDiscountOpen={setDiscountOpen}
            discountInput={discountInput}
            setDiscountInput={setDiscountInput}
            setDiscountBrl={setDiscountBrl}
            total={total}
            error={error}
            success={success}
            saving={saving}
            loadingOrder={loadingOrder}
            hasSavedOrder={hasSavedOrder}
            activeOrder={activeOrder}
            onSubmitNew={submitNewOrder}
            onSaveExisting={saveExistingOrder}
            onPrint={printComanda}
            onConfirmClose={() => setConfirmCloseOpen(true)}
            sticky
          />
        </aside>
      </div>

      {/* Bottom: pedidos abertos */}
      <section className="mt-4 shrink-0 rounded-xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-[#1a1614]">Pedidos abertos</h2>
          <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-xs font-bold text-[#374151]">
            {openOrders.length}
          </span>
        </div>
        {openOrders.length === 0 ? (
          <p className="mt-3 text-sm text-[#6b7280]">Sem pedidos em aberto.</p>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {openOrders.map((order) => {
              const st = (order.status || '').toLowerCase()
              const badgeClass =
                st === 'pending'
                  ? 'bg-amber-100 text-amber-900 ring-amber-200'
                  : st === 'preparing'
                    ? 'bg-sky-100 text-sky-900 ring-sky-200'
                    : st === 'ready'
                      ? 'bg-emerald-100 text-emerald-900 ring-emerald-200'
                      : 'bg-zinc-100 text-zinc-700 ring-zinc-200'
              const nextPrep =
                st === 'pending' ? 'Iniciar preparo' : st === 'preparing' ? 'Marcar como pronto' : null
              return (
                <li key={order.id} className="rounded-xl border border-[var(--card-border)] p-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <p className="text-xs font-semibold text-[#1a1614]">
                      Mesa {parseTableFromNotes(order.notes) || '—'} · {parseSectorFromNotes(order.notes)}
                    </p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${badgeClass}`}>
                      {statusLabel(order.status)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-[#4b5563]">{order.items_summary || '—'}</p>
                  <p className="mt-2 text-sm font-bold text-[var(--dash-primary)]">
                    {money.format(Number(order.total) || 0)}
                  </p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {nextPrep ? (
                      <button
                        type="button"
                        disabled={busyOrderId === order.id}
                        onClick={() => void advanceOrder(order)}
                        className="rounded-lg border border-[var(--card-border)] bg-zinc-50 py-1.5 text-xs font-semibold text-[#1a1614] hover:bg-zinc-100 disabled:opacity-50"
                      >
                        {busyOrderId === order.id ? '…' : nextPrep}
                      </button>
                    ) : null}
                    {st === 'ready' ? (
                      <button
                        type="button"
                        disabled={busyOrderId === order.id}
                        onClick={() => void confirmToTable(order)}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 py-1.5 text-xs font-semibold text-emerald-900 disabled:opacity-50"
                      >
                        {busyOrderId === order.id ? '…' : 'Entregue à mesa'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void loadOrderEditor(order)}
                      className="text-left text-xs font-semibold text-[var(--dash-primary)] hover:underline"
                    >
                      Ver / Editar
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Modal configurar mesas */}
      {configOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={() => {
              setConfigOpen(false)
              setTablesSaveError(null)
            }}
          />
          <div className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-[#1a1614]">Configurar mesas</h3>
            {tablesSaveError ? (
              <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-800">{tablesSaveError}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2 border-b border-[var(--card-border)] pb-2">
              {ambientesInConfig.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setConfigAmbTab(a)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    configAmbTab === a
                      ? 'bg-[var(--dash-primary)] text-white'
                      : 'bg-zinc-100 text-[#374151]'
                  }`}
                >
                  {a}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <input
                  value={newAmbienteName}
                  onChange={(e) => setNewAmbienteName(e.target.value)}
                  placeholder="Novo ambiente"
                  className="w-28 rounded-full border border-[var(--card-border)] px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={addNewAmbiente}
                  className="rounded-full bg-zinc-800 px-2 py-1 text-[11px] font-semibold text-white"
                >
                  +
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {(tablesByAmbiente.get(configAmbTab) ?? []).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--card-border)] px-2 py-1.5"
                >
                  <span className="text-sm font-medium">{t.name}</span>
                  <button
                    type="button"
                    onClick={() => removeConfiguredTable(t.id)}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="Nome / número"
                className="min-w-0 flex-1 rounded-lg border border-[var(--card-border)] px-2 py-2 text-sm"
              />
              <button
                type="button"
                onClick={addConfiguredTable}
                className="shrink-0 rounded-lg bg-[var(--dash-primary)] px-3 py-2 text-xs font-bold text-white"
              >
                +
              </button>
            </div>
            <button
              type="button"
              disabled={savingTables}
              onClick={() => void saveTableConfig()}
              className="mt-4 w-full rounded-xl bg-[#1a1614] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingTables ? 'A guardar…' : 'Guardar configuração'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Confirmar recebimento */}
      {confirmCloseOpen && activeOrder ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4" role="dialog">
          <button type="button" className="absolute inset-0 bg-black/50" onClick={() => setConfirmCloseOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-xl">
            <p className="text-sm font-bold text-[#1a1614]">Confirmar recebimento</p>
            <p className="mt-2 text-sm text-[#4b5563]">
              {money.format(Number(activeOrder.total) || 0)} via{' '}
              {paymentMethod === 'pix' ? 'PIX' : paymentMethod === 'card' ? 'Cartão' : 'Dinheiro'}
            </p>
            {Math.abs(total - (Number(activeOrder.total) || 0)) > 0.01 ? (
              <p className="mt-1 text-xs text-amber-800">
                Há alterações por guardar no painel — confirma «Salvar alterações» antes para alinhar o total.
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmCloseOpen(false)}
                className="flex-1 rounded-xl border border-[var(--card-border)] py-2 text-sm font-semibold"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={busyOrderId === activeOrder.id}
                onClick={() => void closeOrderDelivered(activeOrder)}
                className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Mobile: bottom sheet cardápio */}
      {menuSheetOpen ? (
        <div className="fixed inset-0 z-[85] md:hidden" role="dialog">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setMenuSheetOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[70vh] overflow-hidden rounded-t-2xl bg-[#f4f5f7] shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-[var(--card-border)] bg-white px-3 py-2">
              <span className="text-sm font-bold">Cardápio</span>
              <button type="button" onClick={() => setMenuSheetOpen(false)} className="text-lg font-bold">
                ×
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {/* duplicate slim product list */}
              <ul className="grid grid-cols-2 gap-2">
                {filteredProducts.map((p) => {
                  const price = effectiveProductPrice(p)
                  const oos = isOutOfStock(p.id)
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={oos}
                        onClick={() => {
                          addProduct(p)
                          setMenuSheetOpen(false)
                        }}
                        className={`w-full rounded-lg border bg-white p-2 text-left text-[13px] ${
                          oos ? 'opacity-40' : 'border-[var(--card-border)]'
                        }`}
                      >
                        <span className="line-clamp-2 font-medium">{p.name}</span>
                        <span className="text-[var(--dash-primary)]">{money.format(price)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {/* Mobile: drawer pedido */}
      {orderDrawerOpen ? (
        <div className="fixed inset-0 z-[88] md:hidden" role="dialog">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setOrderDrawerOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-[min(100%,360px)] flex-col border-l border-[var(--card-border)] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-bold">Pedido</span>
              <button type="button" onClick={() => setOrderDrawerOpen(false)} className="text-lg font-bold">
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <OrderPanelContent
                table={table}
                setTable={setTable}
                sector={sector}
                customerName={customerName}
                setCustomerName={setCustomerName}
                notes={notes}
                setNotes={setNotes}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                cart={cart}
                setLineQty={setLineQty}
                subtotal={subtotal}
                discountBrl={discountBrl}
                discountOpen={discountOpen}
                setDiscountOpen={setDiscountOpen}
                discountInput={discountInput}
                setDiscountInput={setDiscountInput}
                setDiscountBrl={setDiscountBrl}
                total={total}
                error={error}
                success={success}
                saving={saving}
                loadingOrder={loadingOrder}
                hasSavedOrder={hasSavedOrder}
                activeOrder={activeOrder}
                onSubmitNew={submitNewOrder}
                onSaveExisting={saveExistingOrder}
                onPrint={printComanda}
                onConfirmClose={() => setConfirmCloseOpen(true)}
                sticky={false}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Mobile: ações da mesa */}
      {tableActionSheetOpen ? (
        <div className="fixed inset-0 z-[87] md:hidden" role="dialog">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setTableActionSheetOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white p-4 shadow-2xl">
            <p className="text-sm font-bold text-[#1a1614]">Mesa {table.trim() || 'selecionada'}</p>
            <p className="mt-1 text-xs text-[#6b7280]">Escolha onde continuar.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTableActionSheetOpen(false)
                  setMenuSheetOpen(true)
                }}
                className="rounded-xl border border-[var(--card-border)] bg-white py-2.5 text-sm font-semibold text-[#1a1614]"
              >
                Cardápio
              </button>
              <button
                type="button"
                onClick={() => {
                  setTableActionSheetOpen(false)
                  setOrderDrawerOpen(true)
                }}
                className="rounded-xl bg-[var(--dash-primary)] py-2.5 text-sm font-semibold text-white"
              >
                Pedido
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* PIN para sair do ecrã */}
      {pinExitOpen ? (
        <div className="fixed inset-0 z-[96] flex items-center justify-center p-4" role="dialog">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setPinExitOpen(false)
              setPinAttempt('')
              setPinError(null)
            }}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-xl">
            <p className="text-sm font-bold text-[#1a1614]">PIN para sair do ecrã</p>
            <p className="mt-1 text-xs text-[#6b7280]">
              O modo ecrã do Garçom exige PIN de segurança para fechar.
            </p>
            <input
              type="password"
              value={pinAttempt}
              onChange={(e) => {
                setPinAttempt(e.target.value.replace(/\D/g, '').slice(0, 4))
                if (pinError) setPinError(null)
              }}
              placeholder="Digite 4 dígitos"
              inputMode="numeric"
              maxLength={4}
              className="mt-3 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 text-center text-lg tracking-[0.25em]"
            />
            {pinError ? (
              <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700">{pinError}</p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-[var(--card-border)] py-2 text-sm font-semibold"
                onClick={() => {
                  setPinExitOpen(false)
                  setPinAttempt('')
                  setPinError(null)
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-[var(--dash-primary)] py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={pinAttempt.length !== 4}
                onClick={() => void confirmExitWithPin()}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function OrderPanelContent({
  table,
  setTable,
  sector,
  customerName,
  setCustomerName,
  notes,
  setNotes,
  paymentMethod,
  setPaymentMethod,
  cart,
  setLineQty,
  subtotal,
  discountBrl,
  discountOpen,
  setDiscountOpen,
  discountInput,
  setDiscountInput,
  setDiscountBrl,
  total,
  error,
  success,
  saving,
  loadingOrder,
  hasSavedOrder,
  activeOrder,
  onSubmitNew,
  onSaveExisting,
  onPrint,
  onConfirmClose,
  sticky,
}: {
  table: string
  setTable: (v: string) => void
  sector: string
  customerName: string
  setCustomerName: (v: string) => void
  notes: string
  setNotes: (v: string) => void
  paymentMethod: 'cash' | 'pix' | 'card'
  setPaymentMethod: (v: 'cash' | 'pix' | 'card') => void
  cart: CartLine[]
  setLineQty: (id: string, q: number) => void
  subtotal: number
  discountBrl: number
  discountOpen: boolean
  setDiscountOpen: (v: boolean) => void
  discountInput: string
  setDiscountInput: (v: string) => void
  setDiscountBrl: (n: number) => void
  total: number
  error: string | null
  success: string | null
  saving: boolean
  loadingOrder: boolean
  hasSavedOrder: boolean
  activeOrder: StoreOrderRow | null
  onSubmitNew: () => void
  onSaveExisting: () => void
  onPrint: () => void
  onConfirmClose: () => void
  sticky: boolean
}) {
  const showEmpty = !table.trim() && cart.length === 0 && !hasSavedOrder
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loadingOrder ? (
          <p className="text-sm text-[#6b7280]">A carregar…</p>
        ) : showEmpty ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-[#6b7280]">
            <span className="text-3xl opacity-40">🍽️</span>
            <p>
              Selecione uma mesa no mapa
              <br />
              ou clique num produto para começar
            </p>
          </div>
        ) : (
          <>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${sectorBadgeClass(sector)}`}
            >
              {sector}
            </span>
            <label className="mt-3 block text-[11px] font-medium text-[#6b7280]">
              Mesa
              <input
                value={table}
                onChange={(e) => setTable(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-2 py-1.5 text-sm font-semibold"
              />
            </label>
            <label className="mt-2 block text-[11px] font-medium text-[#6b7280]">
              Cliente (opcional)
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome do cliente"
                className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="mt-2 block text-[11px] font-medium text-[#6b7280]">
              Observações internas
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações internas..."
                rows={2}
                className="mt-1 w-full resize-y rounded-lg border border-[var(--card-border)] px-2 py-1.5 text-sm"
              />
            </label>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
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
                  onClick={() => setPaymentMethod(opt.id)}
                  className={`rounded-lg border px-1 py-2 text-[11px] font-semibold transition duration-150 ${
                    paymentMethod === opt.id
                      ? 'border-[var(--dash-primary)] bg-[var(--dash-primary)] text-white'
                      : 'border-[var(--card-border)] bg-white text-[#374151]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="mt-4 border-t border-[var(--card-border)] pt-3">
              {cart.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#9ca3af]">Nenhum item adicionado.</p>
              ) : (
                <ul className="space-y-3">
                  {cart.map((line) => (
                    <li key={line.productId} className="flex gap-2 border-b border-[var(--card-border)]/60 pb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#1a1614]">{line.name}</p>
                        <p className="text-[11px] text-[#9ca3af]">{money.format(line.unitPrice)} un.</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setLineQty(line.productId, line.quantity - 1)}
                          className="h-7 w-7 rounded border border-[var(--card-border)] text-sm"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => setLineQty(line.productId, line.quantity + 1)}
                          className="h-7 w-7 rounded border border-[var(--card-border)] text-sm"
                        >
                          +
                        </button>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-sm font-bold text-[#1a1614]">
                          {money.format(line.quantity * line.unitPrice)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setLineQty(line.productId, 0)}
                          className="text-[11px] text-[#9ca3af] hover:text-red-600"
                          aria-label="Remover"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between text-[#6b7280]">
                  <span>Subtotal</span>
                  <span>{money.format(subtotal)}</span>
                </div>
                {discountBrl > 0 ? (
                  <div className="flex justify-between text-sm font-medium text-red-600">
                    <span>Desconto</span>
                    <span>− {money.format(discountBrl)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-[var(--card-border)] pt-2 text-base font-bold text-[#1a1614]">
                  <span>Total</span>
                  <span>{money.format(total)}</span>
                </div>
              </div>
            </div>

            {!discountOpen ? (
              <button
                type="button"
                onClick={() => {
                  setDiscountOpen(true)
                  setDiscountInput(discountBrl > 0 ? String(discountBrl).replace('.', ',') : '')
                }}
                className="mt-2 text-[11px] font-semibold text-[var(--dash-primary)] hover:underline"
              >
                + Aplicar desconto
              </button>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[#fafafa] p-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  placeholder="R$"
                  className="w-24 rounded border border-[var(--card-border)] px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    const n = Number(discountInput.replace(',', '.'))
                    setDiscountBrl(Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0)
                    setDiscountOpen(false)
                  }}
                  className="rounded bg-[var(--dash-primary)] px-2 py-1 text-xs font-bold text-white"
                >
                  Aplicar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDiscountBrl(0)
                    setDiscountOpen(false)
                  }}
                  className="text-xs text-[#6b7280] hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            )}
          </>
        )}
        {error && !showEmpty ? (
          <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-800">{error}</p>
        ) : null}
        {success ? <p className="mt-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">{success}</p> : null}
      </div>

      <div
        className={`shrink-0 border-t border-[var(--card-border)] bg-white px-3 py-3 shadow-[0_-6px_16px_rgba(0,0,0,0.06)] ${
          sticky ? 'sticky bottom-0' : ''
        }`}
      >
        {!showEmpty && !loadingOrder ? (
          <>
            {hasSavedOrder ? (
              <>
                <button
                  type="button"
                  disabled={saving || cart.length === 0}
                  onClick={onSaveExisting}
                  className="w-full rounded-xl bg-[var(--dash-primary)] py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-50"
                >
                  {saving ? 'A guardar…' : 'Salvar alterações'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={onConfirmClose}
                  className="mt-2 w-full rounded-xl border border-emerald-600 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  Receber e fechar mesa
                </button>
                <button
                  type="button"
                  onClick={onPrint}
                  className="mt-2 w-full text-center text-xs font-semibold text-[#6b7280] underline"
                >
                  Imprimir comanda
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={saving || !table.trim() || cart.length === 0}
                  onClick={onSubmitNew}
                  className="w-full rounded-xl bg-[var(--dash-primary)] py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-50"
                >
                  {saving ? 'A registar…' : 'Registrar pedido da mesa'}
                </button>
                <button
                  type="button"
                  onClick={onPrint}
                  className="mt-2 w-full text-center text-xs font-semibold text-[#6b7280] underline"
                >
                  Imprimir comanda
                </button>
              </>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
