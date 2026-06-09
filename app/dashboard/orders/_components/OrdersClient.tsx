'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ORDER_SELECT,
  mapStoreOrderRow,
  orderIsVisibleAfterPixConfirmation,
  type StoreOrderRow,
} from '@/lib/store-order'
import type { StorePrintingState } from '@/lib/store-printing'
import {
  openOrderTicketPrint,
  openOrderTicketPrintDeduped,
  orderTicketVariantFromSource,
} from '@/lib/order-print-window'
import { updateOrderStatus } from '@/services/orders'
import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import { type Plan, hasFeature, merchantEntregadoresEnabled } from '@/lib/plan'
import type { StoreEntregadorDTO } from '@/lib/entregas-types'
import { slugChannelSourcesForSupabaseIn } from '@/lib/slug-channel-orders'
import {
  extractUserNotes,
  parseSectorFromNotes,
  parseTableFromNotes,
} from '@/lib/waiter-order-notes'
import { IconPrinter } from '@/app/dashboard/_components/NavIcons'

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

function statusLabel(status: string | null, deliveryPipeline: boolean): string {
  switch (status) {
    case 'pending':
      return 'Pendente'
    case 'preparing':
      return 'Preparando'
    case 'ready':
      return deliveryPipeline ? 'Pronto p/ envio' : 'Pronto'
    case 'confirmed':
      return deliveryPipeline ? 'A caminho' : 'Em curso'
    case 'delivered':
      return 'Entregue'
    case 'cancelled':
      return 'Recusado'
    default:
      return status?.trim() || '—'
  }
}

/**
 * Estrutura neutra preparada para uma futura visualização Kanban: o status aparece
 * apenas na borda lateral, mantendo os cards densos e fáceis de comparar.
 */
function statusCardSurfaceClass(status: string | null): string {
  const base = 'border border-[#e8ecf1] border-l-[3px]'
  switch (status) {
    case 'pending':
      return `${base} border-l-[#94a3b8]`
    case 'preparing':
      return `${base} border-l-orange-500`
    case 'ready':
      return `${base} border-l-blue-500`
    case 'confirmed':
      return `${base} border-l-blue-500`
    case 'delivered':
      return `${base} border-l-emerald-500`
    case 'cancelled':
      return `${base} border-l-[#cbd5e1]`
    default:
      return `${base} border-l-[#cbd5e1]`
  }
}

/** Remove totais por linha (`2x Item=12,50`) para exibição compacta no card. */
function formatItemsSummaryForDisplay(summary: string | null | undefined): string {
  const raw = summary?.trim()
  if (!raw) return 'Itens não indicados neste pedido.'
  return raw
    .split(';')
    .map((segment) => {
      const line = segment.trim()
      if (!line) return ''
      const eq = line.lastIndexOf('=')
      if (eq <= 0) return line
      return line.slice(0, eq).trim()
    })
    .filter(Boolean)
    .join(' · ')
}

function orderDisplayLocation(o: StoreOrderRow): {
  title: string
  detail?: string
} {
  const table = parseTableFromNotes(o.notes)
  const sector = parseSectorFromNotes(o.notes)
  const source = (o.source ?? '').trim().toLowerCase()
  const address = o.delivery_address?.trim()

  if (table) {
    const normalizedTable = table.replace(/^mesa\s+/i, '').trim() || table
    const detail =
      sector && !/^sal[aã]o$/i.test(sector.trim()) ? sector.trim() : undefined
    return { title: `Mesa ${normalizedTable}`, detail }
  }

  if (address && /^mesa\b/i.test(address)) {
    return { title: address }
  }
  if (source === 'pdv') return { title: 'Balcão' }
  if (source === 'site_pickup') return { title: 'Retirada' }
  if (source === 'waiter' || source === 'autoatendimento') {
    return { title: address || 'Salão' }
  }
  if (address && !/^retirada/i.test(address)) {
    return {
      title: address.length > 48 ? `${address.slice(0, 48).trim()}…` : address,
    }
  }
  return { title: 'Sem local' }
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

function pixNeedsWhatsAppProofCheck(order: StoreOrderRow): boolean {
  const method = paymentKind(order.payment_method)
  const status = String(order.payment_status ?? '').trim().toLowerCase()
  return method === 'pix' && status === 'customer_reported'
}

/** Entrega com endereço (não retirada no balcão / garçom / pickup no site / QR mesa). */
function isDeliveryFlowOrder(o: StoreOrderRow): boolean {
  const source = (o.source ?? '').trim().toLowerCase()
  if (
    source === 'pdv' ||
    source === 'waiter' ||
    source === 'site_pickup' ||
    source === 'autoatendimento'
  ) {
    return false
  }
  const addr = (o.delivery_address ?? '').trim()
  if (!addr) return false
  if (/^retirada/i.test(addr)) return false
  return true
}

function orderChannelLabel(source: string): string {
  switch (source) {
    case 'pdv':
      return 'Balcão'
    case 'waiter':
      return 'Garçom'
    case 'autoatendimento':
      return 'QR mesa'
    case 'site_pickup':
      return 'Retirada'
    case 'site':
    case 'menu_link':
    case 'site_delivery':
      return 'Delivery'
    default:
      return source ? source.replace(/_/g, ' ') : 'Canal não informado'
  }
}

function deliveryFeeNumber(o: StoreOrderRow): number {
  const v = o.delivery_fee
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function parseMoneyInputLocal(raw: string): number {
  const n = Number(raw.replace(',', '.').trim())
  if (Number.isNaN(n) || n < 0) return 0
  return Math.round(n * 100) / 100
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

function canPrintComandaStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toLowerCase()
  return s === 'pending' || s === 'preparing' || s === 'ready' || s === 'confirmed'
}

export function OrdersClient({
  initialOrders,
  storeId,
  storeName,
  printing,
  plan,
  deliveryPipelineEnabled = true,
  slugChannelSourcesOnly = false,
}: {
  initialOrders: StoreOrderRow[]
  storeId: string
  storeName: string
  printing: StorePrintingState
  plan: Plan
  /** Slug / entregas / separador «A caminho»: só delivery e híbrido. */
  deliveryPipelineEnabled?: boolean
  /** Growth + delivery: só pedidos do cardápio público (slug/QR entrega ou retirada). */
  slugChannelSourcesOnly?: boolean
}) {
  const [orders, setOrders] = useState<StoreOrderRow[]>(initialOrders)
  const [tab, setTab] = useState<TabId>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [liveOk, setLiveOk] = useState(false)
  const seenIdsRef = useRef<Set<string>>(
    new Set(initialOrders.map((o) => o.id))
  )
  const [waNotice, setWaNotice] = useState<string | null>(null)
  const waNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [deliveryModal, setDeliveryModal] = useState<
    null | { mode: 'on_deliver' | 'late'; order: StoreOrderRow }
  >(null)
  const [entregadoresOpts, setEntregadoresOpts] = useState<StoreEntregadorDTO[]>([])
  const [deliveryEntLoading, setDeliveryEntLoading] = useState(false)
  const [delSel, setDelSel] = useState('')
  const [delNomeAvulso, setDelNomeAvulso] = useState('')
  const [delValorCorrida, setDelValorCorrida] = useState('')
  const [delClientePagou, setDelClientePagou] = useState(false)
  const [delValorRecebido, setDelValorRecebido] = useState('')
  const [delForma, setDelForma] = useState<'dinheiro' | 'pix' | 'cartao'>('dinheiro')
  const [delObs, setDelObs] = useState('')
  const [delSubmitting, setDelSubmitting] = useState(false)
  const [orderIdsComEntrega, setOrderIdsComEntrega] = useState<Set<string>>(new Set())
  const [thermalBusyId, setThermalBusyId] = useState<string | null>(null)

  const tabList = useMemo(
    () =>
      deliveryPipelineEnabled
        ? TAB_DEF
        : TAB_DEF.filter((t) => t.id !== 'delivering'),
    [deliveryPipelineEnabled]
  )

  /** Growth+ (módulo Pedidos): comanda manual sempre disponível, com ou sem automações. */
  const showManualComandaPrint = hasFeature(plan, 'orders')

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
      let q = supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('store_id', storeId)
      if (slugChannelSourcesOnly) {
        q = q.in('source', slugChannelSourcesForSupabaseIn())
      }
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error || !data) return
      const rows = (data as Record<string, unknown>[])
        .map(mapStoreOrderRow)
        .filter(orderIsVisibleAfterPixConfirmation)
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
      if (document.visibilityState !== 'visible') return
      void pullOrders()
    }, 20000)

    return () => {
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [storeId, slugChannelSourcesOnly])

  useEffect(() => {
    if (!deliveryPipelineEnabled && tab === 'delivering') {
      setTab('all')
    }
  }, [deliveryPipelineEnabled, tab])

  useEffect(() => {
    if (!deliveryPipelineEnabled || tab !== 'delivered') return
    let cancelled = false
    void (async () => {
      const res = await dashboardFetch('/api/entregas?period=7d')
      const json = (await res.json().catch(() => ({}))) as {
        entregas?: { order_id: string }[]
      }
      if (cancelled || !Array.isArray(json.entregas)) return
      setOrderIdsComEntrega(new Set(json.entregas.map((e) => e.order_id)))
    })()
    return () => {
      cancelled = true
    }
  }, [tab, orders, deliveryPipelineEnabled])

  useEffect(() => {
    if (!deliveryModal) return
    if (!merchantEntregadoresEnabled(plan)) {
      setDeliveryModal(null)
      return
    }
    const o = deliveryModal.order
    setDelSel('')
    setDelNomeAvulso('')
    setDelValorCorrida('')
    setDelClientePagou(false)
    const fee = deliveryFeeNumber(o)
    setDelValorRecebido(fee > 0 ? String(fee).replace('.', ',') : '')
    setDelForma('dinheiro')
    setDelObs('')
    setDeliveryEntLoading(true)
    void (async () => {
      if (deliveryModal.mode === 'late') {
        const chk = await dashboardFetch(`/api/entregas?orderId=${encodeURIComponent(o.id)}`)
        const cj = (await chk.json().catch(() => ({}))) as { entrega?: unknown }
        if (cj.entrega) {
          alert('Este pedido já tem entrega registada.')
          setDeliveryModal(null)
          setDeliveryEntLoading(false)
          return
        }
      }
      const res = await dashboardFetch('/api/store/entregadores')
      const json = (await res.json().catch(() => ({}))) as {
        entregadores?: StoreEntregadorDTO[]
      }
      const list = (json.entregadores ?? []).filter((e) => e.ativo)
      setEntregadoresOpts(list)
      setDeliveryEntLoading(false)
    })()
  }, [deliveryModal, plan])

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
    const def = tabList.find((t) => t.id === tab)
    const match = def?.match ?? (() => true)
    return orders.filter((o) => match(o.status))
  }, [orders, tab, tabList])

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

  function printComanda(o: StoreOrderRow) {
    const orderRef =
      displayNumberById.get(o.id) ?? o.id.replace(/-/g, '').slice(0, 8)
    const r = openOrderTicketPrint({
      storeName,
      order: o,
      orderDisplayRef: orderRef,
      printing: {
        print_include_customer_details:
          printing.print_include_customer_details,
        print_delivery_copy: printing.print_delivery_copy,
        print_paper_mm: printing.print_paper_mm,
      },
      variant: orderTicketVariantFromSource(o.source, o),
    })
    if (r === 'failed') {
      flashWaNotice(
        'Permite pop-ups neste site para abrir a janela de impressão da comanda.'
      )
    }
  }

  async function printOrderDefault(o: StoreOrderRow) {
    const useThermal =
      hasFeature(plan, 'printing') && Boolean(printing.print_agent_url?.trim())
    if (useThermal) {
      setThermalBusyId(o.id)
      flashWaNotice('A imprimir…')
      try {
        const res = await dashboardFetch('/api/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: storeId, order_id: o.id }),
        })
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          ok?: boolean
        }
        if (res.ok && json.ok) {
          flashWaNotice('Comanda enviada à impressora.')
          return
        }
      } catch {
        /* tenta janela de comanda */
      } finally {
        setThermalBusyId(null)
      }
      flashWaNotice('A abrir pré-visualização da comanda…')
    }
    printComanda(o)
  }

  async function patchStatus(orderId: string, status: string) {
    const orderBefore = orders.find((o) => o.id === orderId)
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
    if (status === 'confirmed' && deliveryPipelineEnabled) {
      setTab('delivering')
    }
    if (status === 'delivered') {
      setTab('delivered')
    }
    if (deliveryNotified) {
      flashWaNotice('Aviso de entrega enviado ao cliente por WhatsApp.')
    }
    if (
      status === 'preparing' &&
      printing.print_auto_on_confirm &&
      orderBefore
    ) {
      const ref =
        displayNumberById.get(orderId) ?? orderId.replace(/-/g, '').slice(0, 8)
      const ok = openOrderTicketPrintDeduped(orderId, {
        storeName,
        order: { ...orderBefore, status: 'preparing' },
        orderDisplayRef: ref,
        printing: {
          print_include_customer_details:
            printing.print_include_customer_details,
          print_delivery_copy: printing.print_delivery_copy,
          print_paper_mm: printing.print_paper_mm,
        },
        variant: orderTicketVariantFromSource(orderBefore.source, orderBefore),
      })
      if (!ok) {
        flashWaNotice(
          'Permite pop-ups neste site para a impressão automática funcionar.'
        )
      }
    }
  }

  function onMarkDelivered(o: StoreOrderRow) {
    if (o.status !== 'confirmed') return
    if (isDeliveryFlowOrder(o)) {
      if (!merchantEntregadoresEnabled(plan)) {
        void patchStatus(o.id, 'delivered')
        return
      }
      setDeliveryModal({ mode: 'on_deliver', order: o })
      return
    }
    void patchStatus(o.id, 'delivered')
  }

  async function submitDeliveryModal(skip: boolean) {
    if (!deliveryModal) return
    if (!skip && !merchantEntregadoresEnabled(plan)) return
    const o = deliveryModal.order
    setDelSubmitting(true)
    try {
      if (skip) {
        const res = await dashboardFetch('/api/orders/register-delivery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: o.id, skip: true }),
        })
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          alert(json.error || 'Não foi possível marcar como entregue.')
          return
        }
        setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, status: 'delivered' } : x)))
        setDeliveryModal(null)
        setTab('delivered')
        return
      }

      const avulso = delSel === '__avulso__'
      const entregadorId =
        !avulso && delSel.trim() ? delSel.trim() : null
      const nomeAvulso = avulso ? delNomeAvulso.trim() : ''
      if (!entregadorId && !nomeAvulso) {
        alert('Seleciona um entregador ou indica nome avulso.')
        return
      }
      const valorCorrida = parseMoneyInputLocal(delValorCorrida)
      const clientePagou = delClientePagou
      const valorRecebido = clientePagou ? parseMoneyInputLocal(delValorRecebido) : 0
      if (clientePagou && valorRecebido <= 0) {
        alert('Indica o valor recebido do cliente.')
        return
      }

      const body = {
        orderId: o.id,
        skip: false,
        entregadorId,
        entregadorNomeAvulso: avulso ? nomeAvulso : undefined,
        valorCorrida,
        clientePagouTaxa: clientePagou,
        valorRecebidoCliente: clientePagou ? valorRecebido : 0,
        formaPagamentoEntrega: clientePagou ? delForma : undefined,
        observacao: delObs.trim() || undefined,
      }

      if (deliveryModal.mode === 'on_deliver') {
        const res = await dashboardFetch('/api/orders/register-delivery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          order?: Record<string, unknown>
        }
        if (!res.ok) {
          alert(json.error || 'Não foi possível confirmar a entrega.')
          return
        }
        if (json.order) {
          const row = mapStoreOrderRow(json.order)
          setOrders((prev) => prev.map((x) => (x.id === o.id ? row : x)))
        } else {
          setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, status: 'delivered' } : x)))
        }
      } else {
        const res = await dashboardFetch('/api/entregas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: o.id,
            entregadorId,
            entregadorNomeAvulso: avulso ? nomeAvulso : undefined,
            valorCorrida,
            clientePagouTaxa: clientePagou,
            valorRecebidoCliente: clientePagou ? valorRecebido : 0,
            formaPagamentoEntrega: clientePagou ? delForma : undefined,
            observacao: delObs.trim() || undefined,
          }),
        })
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          alert(json.error || 'Não foi possível registar a entrega.')
          return
        }
        setOrderIdsComEntrega((prev) => new Set(prev).add(o.id))
      }
      setDeliveryModal(null)
      setTab('delivered')
    } finally {
      setDelSubmitting(false)
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
        {tabList.map((t) => {
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
        <ul className="mt-6 flex flex-col gap-3" data-view="orders-list">
          {filtered.map((o) => {
            const busy = busyId === o.id
            const thermalBusy = thermalBusyId === o.id
            const st = o.status
            const ref = `#${displayNumberById.get(o.id) ?? '—'}`
            const itemsLine = formatItemsSummaryForDisplay(o.items_summary)
            const phone = o.customer_phone
            const wa = phone ? waUrl(phone, o.customer_name, ref) : null
            const waOut =
              phone ? waOutForDeliveryUrl(phone, o.customer_name, ref) : null
            const userNotes = extractUserNotes(o.notes)
            const isTrocoNote = Boolean(userNotes && /troco/i.test(userNotes))
            const payKind = paymentKind(o.payment_method)
            const showPaymentHighlight = payKind === 'pix' || payKind === 'card'
            const showPixProofWarning = pixNeedsWhatsAppProofCheck(o)
            const source = (o.source ?? '').trim().toLowerCase()

            const location = orderDisplayLocation(o)
            const channelLabel = orderChannelLabel(source)
            const totalLabel = money.format(Number(o.total) || 0)
            const payment = paymentLabel(o.payment_method)
            const showAlertPanel =
              showPixProofWarning || showPaymentHighlight || Boolean(userNotes)
            const primaryButtonClass =
              'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[var(--dash-primary)] px-3.5 text-xs font-semibold text-white shadow-sm shadow-[var(--dash-primary)]/15 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50'
            const secondaryButtonClass =
              'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#e2e8f0] bg-white px-3 text-xs font-medium text-[#64748b] transition hover:border-[#cbd5e1] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50'

            return (
              <li
                key={o.id}
                data-order-card
                data-status={st ?? 'unknown'}
                aria-label={`Pedido ${ref}, ${statusLabel(st, deliveryPipelineEnabled)}`}
                className={`group overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition hover:shadow-[0_4px_16px_rgba(15,23,42,0.08)] ${statusCardSurfaceClass(st)} ${
                  st === 'cancelled' ? 'opacity-70' : ''
                }`}
              >
                <div id={`order-details-${o.id}`} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-semibold tracking-tight text-[#0f172a]">
                        Pedido {ref}
                      </span>
                      <span className="text-[#e2e8f0]">·</span>
                      <span className="text-[13px] font-medium text-[#334155]">
                        {location.title}
                      </span>
                      {location.detail ? (
                        <span className="rounded-md bg-[#f1f5f9] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">
                          {location.detail}
                        </span>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums tracking-tight text-[#0f172a]">
                      {totalLabel}
                    </span>
                  </div>

                  <p className="mt-1 line-clamp-1 text-[13px] leading-5 text-[#64748b]">
                    {itemsLine}
                  </p>

                  <p className="mt-1.5 text-[12px] font-medium text-[#94a3b8]">
                    <span>{relativeTimePt(o.created_at)}</span>
                    <span className="mx-1.5 text-[#e2e8f0]">·</span>
                    <span>{channelLabel}</span>
                    {payment !== '—' ? (
                      <>
                        <span className="mx-1.5 text-[#e2e8f0]">·</span>
                        <span>{payment}</span>
                      </>
                    ) : null}
                  </p>

                  {showAlertPanel ? (
                    <div className="mt-2.5 space-y-1.5">
                      {showPixProofWarning ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] font-medium text-amber-900">
                          <span>
                            PIX informado pelo cliente. Confirme o comprovante antes de
                            avançar.
                          </span>
                          {wa ? (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md bg-[#25D366] px-2.5 text-[11px] font-semibold text-white"
                            >
                              <IconWhatsApp className="h-3.5 w-3.5" />
                              WhatsApp
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                      {showPaymentHighlight && !showPixProofWarning ? (
                        <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#475569]">
                          {payKind === 'card' ? (
                            <IconCardPay className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <IconPixPay className="h-3.5 w-3.5 shrink-0" />
                          )}
                          Pagamento: {payment}
                        </p>
                      ) : null}
                      {isTrocoNote ? (
                        <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#475569]">
                          <IconCoin className="h-3.5 w-3.5 shrink-0" />
                          {userNotes}
                        </p>
                      ) : userNotes ? (
                        <p className="text-[11px] leading-relaxed text-[#64748b]">
                          {userNotes}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#f1f5f9] pt-3">
                    {st === 'pending' ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void patchStatus(o.id, 'preparing')}
                          className={primaryButtonClass}
                        >
                          Aceitar pedido
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => confirmReject(o.id)}
                          className={secondaryButtonClass}
                        >
                          Recusar
                        </button>
                      </>
                    ) : null}
                    {st === 'preparing' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void patchStatus(o.id, 'ready')}
                        className={primaryButtonClass}
                      >
                        Pedido pronto
                      </button>
                    ) : null}
                    {st === 'ready' ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void patchStatus(
                              o.id,
                              deliveryPipelineEnabled ? 'confirmed' : 'delivered'
                            )
                          }
                          className={primaryButtonClass}
                        >
                          {deliveryPipelineEnabled
                            ? 'Sair para entrega'
                            : 'Marcar concluído'}
                        </button>
                        {deliveryPipelineEnabled && waOut ? (
                          <a
                            href={waOut}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={secondaryButtonClass}
                          >
                            <IconWhatsApp className="h-4 w-4" />
                            Avisar envio
                          </a>
                        ) : null}
                      </>
                    ) : null}
                    {st === 'confirmed' ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onMarkDelivered(o)}
                          className={primaryButtonClass}
                        >
                          Marcar entregue
                        </button>
                        {waOut ? (
                          <a
                            href={waOut}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={secondaryButtonClass}
                          >
                            <IconWhatsApp className="h-4 w-4" />
                            Avisar envio
                          </a>
                        ) : null}
                      </>
                    ) : null}
                    {st === 'delivered' &&
                    deliveryPipelineEnabled &&
                    merchantEntregadoresEnabled(plan) &&
                    isDeliveryFlowOrder(o) &&
                    !orderIdsComEntrega.has(o.id) ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setDeliveryModal({ mode: 'late', order: o })}
                        className={primaryButtonClass}
                      >
                        Registar entrega
                      </button>
                    ) : null}
                    {showManualComandaPrint && canPrintComandaStatus(st) ? (
                      <button
                        type="button"
                        disabled={thermalBusy}
                        onClick={() => void printOrderDefault(o)}
                        className={secondaryButtonClass}
                        title="Térmica Wi‑Fi se configurada; senão abre a pré-visualização da comanda."
                      >
                        <IconPrinter className="h-4 w-4 shrink-0" />
                        {thermalBusy ? '…' : 'Comanda'}
                      </button>
                    ) : null}
                    {st !== 'ready' && st !== 'confirmed' && wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={secondaryButtonClass}
                      >
                        <IconWhatsApp className="h-4 w-4" />
                        WhatsApp
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {deliveryModal && merchantEntregadoresEnabled(plan) ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Fechar"
            onClick={() => !delSubmitting && setDeliveryModal(null)}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-xl">
            {(() => {
              const o = deliveryModal.order
              const ref = `#${displayNumberById.get(o.id) ?? '—'}`
              const addr = o.delivery_address?.trim() || '—'
              const title =
                deliveryModal.mode === 'late'
                  ? `Registar entrega — ${ref}`
                  : `Confirmar entrega — ${ref}`
              return (
                <>
                  <h3 className="text-lg font-bold text-[#1a1614]">{title}</h3>
                  <p className="mt-1 text-sm text-[#6b7280]">
                    {(o.customer_name || 'Cliente').trim()} · {addr} · Total{' '}
                    {money.format(Number(o.total) || 0)}
                  </p>
                  {deliveryEntLoading ? (
                    <p className="mt-4 text-sm text-[#6b7280]">A carregar…</p>
                  ) : (
                    <>
                      <label className="mt-5 block text-xs font-medium text-[#6b7280]">
                        Entregador
                        <select
                          value={delSel}
                          onChange={(e) => setDelSel(e.target.value)}
                          className="mt-1 block w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm text-[#1a1614]"
                        >
                          <option value="">Selecionar…</option>
                          {entregadoresOpts.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.nome}
                              {e.tipo === 'autonomo' ? ' (Autônomo)' : ' (Fixo)'}
                            </option>
                          ))}
                          <option value="__avulso__">+ Adicionar entregador avulso</option>
                        </select>
                      </label>
                      <p className="mt-2 text-right">
                        <Link
                          href="/dashboard/entregadores"
                          className="text-xs font-semibold text-[var(--dash-primary)] hover:underline"
                        >
                          Gerir cadastro de entregadores
                        </Link>
                      </p>
                      {delSel === '__avulso__' ? (
                        <label className="mt-3 block text-xs font-medium text-[#6b7280]">
                          Nome do entregador avulso <span className="text-red-600">*</span>
                          <input
                            value={delNomeAvulso}
                            onChange={(e) => setDelNomeAvulso(e.target.value)}
                            className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
                            placeholder="Nome"
                          />
                        </label>
                      ) : null}

                      <label className="mt-4 block text-xs font-medium text-[#6b7280]">
                        Valor da corrida (R$)
                        <input
                          type="text"
                          inputMode="decimal"
                          value={delValorCorrida}
                          onChange={(e) => setDelValorCorrida(e.target.value)}
                          placeholder="0,00"
                          className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
                        />
                        <span className="mt-1 block text-[11px] text-[#9ca3af]">
                          Quanto o entregador vai receber por essa corrida
                        </span>
                      </label>

                      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-[#fafafa] px-3 py-3">
                        <span className="text-sm font-medium text-[#374151]">
                          O cliente pagou a taxa de entrega ao entregador?
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setDelClientePagou((v) => {
                              if (!v) {
                                const fee = deliveryFeeNumber(o)
                                setDelValorRecebido(
                                  fee > 0 ? String(fee).replace('.', ',') : ''
                                )
                              }
                              return !v
                            })
                          }}
                          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                            delClientePagou
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white text-[#6b7280] ring-1 ring-[var(--card-border)]'
                          }`}
                        >
                          {delClientePagou ? 'Sim' : 'Não'}
                        </button>
                      </div>
                      {delClientePagou ? (
                        <div className="mt-3 space-y-3">
                          <label className="block text-xs font-medium text-[#6b7280]">
                            Valor recebido do cliente (R$)
                            <input
                              type="text"
                              inputMode="decimal"
                              value={delValorRecebido}
                              onChange={(e) => setDelValorRecebido(e.target.value)}
                              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
                            />
                          </label>
                          <label className="block text-xs font-medium text-[#6b7280]">
                            Como pagou?
                            <select
                              value={delForma}
                              onChange={(e) =>
                                setDelForma(e.target.value as 'dinheiro' | 'pix' | 'cartao')
                              }
                              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
                            >
                              <option value="dinheiro">Dinheiro</option>
                              <option value="pix">PIX</option>
                              <option value="cartao">Cartão</option>
                            </select>
                          </label>
                        </div>
                      ) : null}

                      <label className="mt-4 block text-xs font-medium text-[#6b7280]">
                        Observação <span className="font-normal text-[#9ca3af]">(opcional)</span>
                        <input
                          value={delObs}
                          onChange={(e) => setDelObs(e.target.value)}
                          className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
                        />
                      </label>

                      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          disabled={delSubmitting}
                          onClick={() => setDeliveryModal(null)}
                          className="rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold text-[#374151] disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        {deliveryModal.mode === 'on_deliver' ? (
                          <button
                            type="button"
                            disabled={delSubmitting}
                            onClick={() => void submitDeliveryModal(true)}
                            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 disabled:opacity-50"
                          >
                            Pular por agora
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={delSubmitting}
                          onClick={() => void submitDeliveryModal(false)}
                          className="rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                        >
                          {delSubmitting ? 'A guardar…' : 'Confirmar entrega'}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      ) : null}
    </div>
  )
}
