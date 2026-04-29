'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ORDER_SELECT,
  mapStoreOrderRow,
  type StoreOrderRow,
} from '@/lib/store-order'
import { updateOrderStatus } from '@/services/orders'

function playNewOrderBeep() {
  try {
    const w = window as Window & { __vyriaLastOrderBeepAt?: number }
    const now = Date.now()
    if (typeof w.__vyriaLastOrderBeepAt === 'number' && now - w.__vyriaLastOrderBeepAt < 900) {
      return
    }
    w.__vyriaLastOrderBeepAt = now
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    void ctx.resume?.()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    const t = ctx.currentTime

    const osc1 = ctx.createOscillator()
    osc1.type = 'square'
    osc1.frequency.value = 980
    osc1.connect(gain)

    const osc2 = ctx.createOscillator()
    osc2.type = 'triangle'
    osc2.frequency.value = 1470
    osc2.connect(gain)

    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22)

    osc1.start(t)
    osc2.start(t)
    osc1.stop(t + 0.22)
    osc2.stop(t + 0.2)
  } catch {
    /* ignore */
  }
}

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

type TabId =
  | 'all'
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'delivering'
  | 'delivered'

const TAB_DEF: {
  id: TabId
  label: string
  match: (s: string | null) => boolean
}[] = [
  { id: 'all', label: 'Todos', match: () => true },
  { id: 'pending', label: 'Pendentes', match: (s) => s === 'pending' },
  { id: 'preparing', label: 'Preparando', match: (s) => s === 'preparing' },
  { id: 'ready', label: 'Pronto', match: (s) => s === 'ready' },
  {
    id: 'delivering',
    label: 'A caminho',
    match: (s) => s === 'confirmed',
  },
  { id: 'delivered', label: 'Entregues', match: (s) => s === 'delivered' },
]

function statusLabel(status: string | null): string {
  switch (status) {
    case 'pending':
      return 'Pendente'
    case 'preparing':
      return 'Preparando'
    case 'ready':
      return 'Pronto p/ envio'
    case 'confirmed':
      return 'A caminho'
    case 'delivered':
      return 'Entregue'
    case 'cancelled':
      return 'Recusado'
    default:
      return status?.trim() || '—'
  }
}

function statusBadgeClass(status: string | null): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-50 text-amber-900 ring-2 ring-amber-400/80'
    case 'preparing':
      return 'bg-orange-100 text-orange-900 ring-1 ring-orange-200/90'
    case 'ready':
      return 'bg-violet-100 text-violet-900 ring-1 ring-violet-200/90'
    case 'confirmed':
      return 'bg-sky-100 text-sky-900 ring-1 ring-sky-200/90'
    case 'delivered':
      return 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/90'
    case 'cancelled':
      return 'bg-[#f3f4f6] text-[#6b7280] ring-1 ring-[var(--card-border)]'
    default:
      return 'bg-[#f3f4f6] text-[#374151] ring-1 ring-[var(--card-border)]'
  }
}

/**
 * Fundo e borda do cartão alinhados ao status (mobile e desktop).
 * No desktop largo (lg+) os cartões entram em grelha 3×n com proporção próxima do quadrado.
 */
function statusCardSurfaceClass(status: string | null): string {
  switch (status) {
    case 'pending':
      return 'border-amber-200/80 bg-amber-50/95 border-l-4 border-l-amber-500 sm:bg-amber-50 sm:shadow-md'
    case 'preparing':
      return 'border-orange-200/70 bg-orange-50/95 border-l-4 border-l-orange-500 sm:bg-orange-50/90 sm:shadow-md'
    case 'ready':
      return 'border-violet-200/70 bg-violet-50/95 border-l-4 border-l-violet-500 sm:bg-violet-50/90 sm:shadow-md'
    case 'confirmed':
      return 'border-sky-200/70 bg-sky-50/95 border-l-4 border-l-sky-500 sm:bg-sky-50/90 sm:shadow-md'
    case 'delivered':
      return 'border-emerald-200/70 bg-emerald-50/95 border-l-4 border-l-emerald-500 sm:bg-emerald-50/90 sm:shadow-md'
    case 'cancelled':
      return 'border-[var(--card-border)] bg-[#f3f4f6]/90 border-l-4 border-l-[#9ca3af] sm:shadow-sm'
    default:
      return 'border-[var(--card-border)] bg-white border-l-4 border-l-[var(--card-border)] sm:shadow-sm'
  }
}

function IconChevronExpand({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function paymentLabel(raw: string | null | undefined): string {
  const v = raw?.trim().toLowerCase()
  if (!v) return '—'
  if (v === 'pix') return 'PIX'
  if (v === 'card' || v === 'cartao' || v === 'cartão') return 'Cartão'
  if (v === 'cash' || v === 'dinheiro') return 'Dinheiro'
  return raw!.trim()
}

/** Para destacar no cartão do pedido (igual ao bloco de troco). */
function paymentKind(
  raw: string | null | undefined
): 'pix' | 'card' | 'cash' | null {
  const v = raw?.trim().toLowerCase()
  if (!v) return null
  if (v === 'pix') return 'pix'
  if (v === 'card' || v === 'cartao' || v === 'cartão') return 'card'
  if (v === 'cash' || v === 'dinheiro') return 'cash'
  return null
}

function relativeTimePt(iso: string): string {
  const d = new Date(iso)
  const ms = Date.now() - d.getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 45) return 'agora'
  const min = Math.floor(sec / 60)
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const days = Math.floor(h / 24)
  if (days < 7) return `há ${days} dia${days > 1 ? 's' : ''}`
  return dateTime.format(d)
}

function customerInitials(name: string | null | undefined): string {
  const t = name?.trim()
  if (!t) return 'CL'
  const p = t.split(/\s+/).filter(Boolean)
  if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase().slice(0, 2)
  return t.slice(0, 2).toUpperCase()
}

function digitsPhone(phone: string | null | undefined): string | null {
  const d = phone?.replace(/\D/g, '') ?? ''
  if (d.length < 10) return null
  return d
}

function waUrl(phone: string, customerName: string | null, orderRef: string) {
  const digits = digitsPhone(phone)
  if (!digits) return null
  const name = customerName?.trim() || ''
  const text = `Olá${name ? ` ${name.split(/\s+/)[0]}` : ''}! Falo em relação ao pedido ${orderRef}.`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

/** Aviso de que o pedido saiu para entrega. */
function waOutForDeliveryUrl(
  phone: string,
  customerName: string | null,
  orderRef: string
) {
  const digits = digitsPhone(phone)
  if (!digits) return null
  const first = customerName?.trim().split(/\s+/)[0]
  const greet = first ? `Olá ${first}! ` : 'Olá! '
  const text = `${greet}O teu pedido ${orderRef} já saiu para entrega e está a caminho. Obrigado pela preferência!`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

function IconWhatsApp({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.883 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function IconCoin({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 11.768 12 11 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function IconCardPay({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  )
}

function IconPixPay({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5h16.5v15H3.75v-15zM8.25 9h7.5M8.25 12h7.5M8.25 15h4.5" />
    </svg>
  )
}

export function OrdersClient({
  initialOrders,
  storeId,
}: {
  initialOrders: StoreOrderRow[]
  storeId: string
}) {
  const [orders, setOrders] = useState<StoreOrderRow[]>(initialOrders)
  const [tab, setTab] = useState<TabId>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [liveOk, setLiveOk] = useState(false)
  /** No mobile, só um cartão expandido por vez; em sm+ ignorado (sempre aberto). */
  const [expandedMobileId, setExpandedMobileId] = useState<string | null>(null)
  const seenIdsRef = useRef<Set<string>>(
    new Set(initialOrders.map((o) => o.id))
  )
  const [waNotice, setWaNotice] = useState<string | null>(null)
  const waNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (waNoticeTimerRef.current) {
        clearTimeout(waNoticeTimerRef.current)
        waNoticeTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()

    async function pullOrders(options?: { beepOnNew?: boolean }) {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
      if (error || !data) return
      const rows = (data as Record<string, unknown>[]).map(mapStoreOrderRow)
      const nextIds = new Set(rows.map((r) => r.id))
      if (options?.beepOnNew) {
        const hasNew = rows.some((r) => !seenIdsRef.current.has(r.id))
        if (hasNew) playNewOrderBeep()
      }
      seenIdsRef.current = nextIds
      setOrders(rows)
    }

    const channel = supabase
      .channel(`orders-live-${storeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${storeId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            void pullOrders({ beepOnNew: true })
            return
          }
          void pullOrders()
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setLiveOk(true)
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
          setLiveOk(false)
      })

    const poll = window.setInterval(() => {
      void pullOrders()
    }, 20000)

    return () => {
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [storeId])

  const displayNumberById = useMemo(() => {
    const sorted = [...orders].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    const m = new Map<string, string>()
    sorted.forEach((o, i) => {
      m.set(o.id, String(i + 1).padStart(3, '0'))
    })
    return m
  }, [orders])

  const counts = useMemo(() => {
    const total = orders.length
    const pending = orders.filter((o) => o.status === 'pending').length
    const preparing = orders.filter((o) => o.status === 'preparing').length
    const ready = orders.filter((o) => o.status === 'ready').length
    const delivering = orders.filter((o) => o.status === 'confirmed').length
    const delivered = orders.filter((o) => o.status === 'delivered').length
    return { total, pending, preparing, ready, delivering, delivered }
  }, [orders])

  const filtered = useMemo(() => {
    const def = TAB_DEF.find((t) => t.id === tab)
    const match = def?.match ?? (() => true)
    return orders.filter((o) => match(o.status))
  }, [orders, tab])

  function flashWaNotice(message: string) {
    if (waNoticeTimerRef.current) {
      clearTimeout(waNoticeTimerRef.current)
      waNoticeTimerRef.current = null
    }
    setWaNotice(message)
    waNoticeTimerRef.current = setTimeout(() => {
      setWaNotice(null)
      waNoticeTimerRef.current = null
    }, 5000)
  }

  async function patchStatus(orderId: string, status: string) {
    setBusyId(orderId)
    const { error, deliveryNotified } = await updateOrderStatus(orderId, status)
    setBusyId(null)
    if (error) {
      alert(error.message)
      return
    }
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status } : o))
    )
    if (status === 'confirmed') {
      setTab('delivering')
      setExpandedMobileId(orderId)
    }
    if (deliveryNotified) {
      flashWaNotice('Aviso de entrega enviado ao cliente por WhatsApp.')
    }
  }

  function confirmReject(orderId: string) {
    if (!confirm('Recusar este pedido?')) return
    void patchStatus(orderId, 'cancelled')
  }

  const tabCount = (id: TabId): number => {
    switch (id) {
      case 'all':
        return counts.total
      case 'pending':
        return counts.pending
      case 'preparing':
        return counts.preparing
      case 'ready':
        return counts.ready
      case 'delivering':
        return counts.delivering
      case 'delivered':
        return counts.delivered
      default:
        return 0
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <nav className="-ml-4 text-xs text-[#6b7280] sm:ml-0">
        <Link href="/dashboard" className="hover:text-[#1a1614]">
          Início
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-[#1a1614]">Pedidos</span>
      </nav>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-[#1a1614] md:text-3xl">
            Pedidos
          </h1>
          {liveOk ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Ao vivo
            </span>
          ) : (
            <span className="rounded-full bg-[#f3f4f6] px-2.5 py-0.5 text-xs font-medium text-[#6b7280]">
              Atualização a cada ~20s
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-[#6b7280]">
          Novos pedidos aparecem automaticamente; também sincronizamos em segundo plano.
        </p>
      </header>

      {waNotice ? (
        <div
          className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm"
          role="status"
        >
          <p className="min-w-0 flex-1 leading-snug">{waNotice}</p>
          <button
            type="button"
            onClick={() => {
              if (waNoticeTimerRef.current) {
                clearTimeout(waNoticeTimerRef.current)
                waNoticeTimerRef.current = null
              }
              setWaNotice(null)
            }}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Fechar
          </button>
        </div>
      ) : null}

      <div
        className="mt-6 flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Filtros de pedidos"
      >
        {TAB_DEF.map((t) => {
          const selected = tab === t.id
          const c = tabCount(t.id)
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
                selected
                  ? 'bg-[var(--dash-primary)] text-white shadow-md shadow-[var(--dash-primary)]/20'
                  : 'border border-[var(--card-border)] bg-white text-[#374151] shadow-sm hover:bg-[#f9fafb]'
              }`}
            >
              {t.label} ({c})
            </button>
          )
        })}
      </div>

      {counts.total === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--card-border)] bg-white px-8 py-16 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f3f4f6] text-[#9ca3af]">
            <svg
              className="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.25}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
              />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-[#1a1614]">
            Nenhum pedido ainda
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-[var(--card-border)] bg-white px-8 py-14 text-center text-sm text-[#6b7280] shadow-sm">
          Nenhum pedido neste filtro.
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-4 max-sm:gap-2">
          {filtered.map((o) => {
            const busy = busyId === o.id
            const st = o.status
            const ref = `#${displayNumberById.get(o.id) ?? '—'}`
            const itemsLine =
              o.items_summary?.trim() || 'Itens não indicados neste pedido.'
            const address =
              o.delivery_address?.trim() || 'Morada não indicada.'
            const phone = o.customer_phone
            const wa = phone ? waUrl(phone, o.customer_name, ref) : null
            const waOut =
              phone ? waOutForDeliveryUrl(phone, o.customer_name, ref) : null
            const notes = o.notes?.trim()
            const isTrocoNote = Boolean(notes && /troco/i.test(notes))
            const payKind = paymentKind(o.payment_method)
            const showPaymentHighlight = payKind === 'pix' || payKind === 'card'
            const source = (o.source ?? '').trim().toLowerCase()
            const isCounterOrder = source === 'pdv'
            const isWaiterOrder = source === 'waiter'
            const isPickupOrder = source === 'site_pickup'
            const isDeliveryOrder =
              !isCounterOrder && !isWaiterOrder && !isPickupOrder

            const mobileExpanded = expandedMobileId === o.id
            const customerName = o.customer_name?.trim() || 'Cliente'

            return (
              <li
                key={o.id}
                className={`overflow-hidden rounded-2xl border shadow-sm shadow-black/[0.04] ${statusCardSurfaceClass(st)} ${
                  st === 'cancelled' ? 'opacity-75' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedMobileId((id) => (id === o.id ? null : o.id))
                  }
                  className="flex w-full items-center gap-2 border-b border-black/[0.06] px-3 py-2.5 text-left sm:hidden"
                  aria-expanded={mobileExpanded}
                  aria-controls={`order-details-${o.id}`}
                >
                  <span className="shrink-0 text-sm font-bold text-[var(--dash-primary)]">
                    {ref}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#1a1614]">
                    {customerName}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(st)}`}
                  >
                    {statusLabel(st)}
                  </span>
                  <IconChevronExpand
                    className={`h-5 w-5 shrink-0 text-[#9ca3af] transition-transform duration-200 ${
                      mobileExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <div
                  id={`order-details-${o.id}`}
                  className={`gap-4 p-4 sm:gap-5 sm:p-5 ${
                    mobileExpanded ? 'flex flex-col' : 'hidden'
                  } sm:flex sm:flex-row sm:items-stretch`}
                >
                  <div className="flex shrink-0 justify-center sm:block">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f3f4f6] text-base font-bold text-[#374151]">
                      {customerInitials(o.customer_name)}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-base font-bold text-[#1a1614]">
                      <span className="text-[var(--dash-primary)]">{ref}</span>{' '}
                      {customerName}
                    </p>
                    <p className="text-sm leading-snug text-[#374151]">
                      {itemsLine}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isCounterOrder ? (
                        <p className="inline-flex w-fit items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900 ring-1 ring-sky-200">
                          Pedido balcão
                        </p>
                      ) : null}
                      {isWaiterOrder ? (
                        <p className="inline-flex w-fit items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-900 ring-1 ring-violet-200">
                          Pedido garçom
                        </p>
                      ) : null}
                      {isDeliveryOrder ? (
                        <p className="inline-flex w-fit items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">
                          Para entrega
                        </p>
                      ) : null}
                      {isPickupOrder ? (
                        <p className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200">
                          Retirada
                        </p>
                      ) : null}
                    </div>
                    <p className="text-sm text-[#6b7280]">{address}</p>
                    <p className="text-xs font-medium text-[#9ca3af]">
                      {relativeTimePt(o.created_at)}
                    </p>
                    {showPaymentHighlight ? (
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--dash-primary)]">
                        {payKind === 'card' ? (
                          <IconCardPay className="h-4 w-4 shrink-0" />
                        ) : (
                          <IconPixPay className="h-4 w-4 shrink-0" />
                        )}
                        Pagamento: {paymentLabel(o.payment_method)}
                      </p>
                    ) : null}
                    {isTrocoNote ? (
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--dash-primary)]">
                        <IconCoin className="h-4 w-4 shrink-0" />
                        {notes}
                      </p>
                    ) : notes ? (
                      <p className="text-sm text-[#6b7280]">{notes}</p>
                    ) : null}

                    {st === 'pending' ? (
                      <div className="flex flex-wrap items-center gap-2 pt-3 sm:hidden">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void patchStatus(o.id, 'preparing')}
                          className="rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                        >
                          Aceitar
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => confirmReject(o.id)}
                          className="rounded-xl border-2 border-[var(--dash-primary)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--dash-primary)] disabled:opacity-50"
                        >
                          Recusar
                        </button>
                        {wa ? (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366] text-white shadow-sm"
                            aria-label="WhatsApp"
                          >
                            <IconWhatsApp className="h-5 w-5" />
                          </a>
                        ) : null}
                      </div>
                    ) : null}

                    {st === 'preparing' ? (
                      <div className="flex flex-wrap gap-2 pt-2 sm:hidden">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void patchStatus(o.id, 'ready')}
                          className="rounded-lg bg-[var(--dash-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Pedido pronto
                        </button>
                      </div>
                    ) : null}

                    {st === 'ready' ? (
                      <div className="flex flex-col gap-2 pt-2 sm:hidden">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void patchStatus(o.id, 'confirmed')}
                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Sair para entrega
                        </button>
                        {waOut ? (
                          <a
                            href={waOut}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-[#25D366] bg-white px-3 py-1.5 text-xs font-semibold text-[#128C7E]"
                          >
                            <IconWhatsApp className="h-4 w-4" />
                            Avisar envio
                          </a>
                        ) : null}
                      </div>
                    ) : null}

                    {st === 'confirmed' ? (
                      <div className="flex flex-wrap gap-2 pt-2 sm:hidden">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void patchStatus(o.id, 'delivered')}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Marcar entregue
                        </button>
                        {waOut ? (
                          <a
                            href={waOut}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--card-border)] bg-[#f9fafb] px-3 py-1.5 text-xs font-semibold text-[#374151]"
                          >
                            <IconWhatsApp className="h-4 w-4" />
                            Avisar envio
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-stretch gap-3 border-t border-[var(--card-border)] pt-4 sm:w-52 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                    <div className="text-center sm:text-right">
                      <p className="text-xl font-bold tabular-nums text-[#1a1614]">
                        {money.format(Number(o.total) || 0)}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-[#6b7280]">
                        {paymentLabel(o.payment_method)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:flex-col sm:items-stretch">
                      <span
                        className={`hidden sm:inline-flex justify-center rounded-full px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(st)}`}
                      >
                        {statusLabel(st)}
                      </span>
                      {st === 'pending' ? (
                        <div className="hidden w-full flex-col gap-2 sm:flex">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patchStatus(o.id, 'preparing')}
                            className="w-full rounded-xl bg-[var(--dash-primary)] px-3 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                          >
                            Aceitar
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => confirmReject(o.id)}
                            className="w-full rounded-xl border-2 border-[var(--dash-primary)] bg-white py-2.5 text-sm font-semibold text-[var(--dash-primary)] disabled:opacity-50"
                          >
                            Recusar
                          </button>
                        </div>
                      ) : null}
                      {st === 'preparing' ? (
                        <div className="hidden w-full flex-col gap-2 sm:flex">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patchStatus(o.id, 'ready')}
                            className="w-full rounded-lg bg-[var(--dash-primary)] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            Pedido pronto
                          </button>
                        </div>
                      ) : null}
                      {st === 'ready' ? (
                        <div className="hidden w-full flex-col gap-2 sm:flex">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patchStatus(o.id, 'confirmed')}
                            className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            Sair para entrega
                          </button>
                          {waOut ? (
                            <a
                              href={waOut}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[#25D366] bg-white py-2.5 text-sm font-semibold text-[#128C7E]"
                            >
                              <IconWhatsApp className="h-5 w-5" />
                              Avisar envio
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                      {st === 'confirmed' ? (
                        <div className="hidden w-full flex-col gap-2 sm:flex">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patchStatus(o.id, 'delivered')}
                            className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            Marcar entregue
                          </button>
                          {waOut ? (
                            <a
                              href={waOut}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--card-border)] bg-[#f9fafb] py-2 text-xs font-semibold text-[#374151]"
                            >
                              <IconWhatsApp className="h-4 w-4" />
                              Avisar envio
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                      {st === 'ready' || st === 'confirmed' ? (
                        !wa && !waOut ? (
                          <p className="text-center text-[10px] text-[#9ca3af] sm:px-1">
                            Sem telefone do cliente para WhatsApp
                          </p>
                        ) : null
                      ) : wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#20BD5A]"
                        >
                          <IconWhatsApp className="h-5 w-5" />
                          WhatsApp
                        </a>
                      ) : (
                        <p className="text-center text-[10px] text-[#9ca3af] sm:px-1">
                          Sem telefone do cliente para WhatsApp
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
