'use client'

import Link from 'next/link'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ORDER_SELECT,
  OPERATIONAL_ORDERS_PULL_LIMIT,
  mapStoreOrderRow,
  operationalOrdersPullSinceIso,
  orderIsVisibleAfterPixConfirmation,
  type StoreOrderRow,
} from '@/lib/store-order'
import type { StorePrintingState } from '@/lib/store-printing'
import { toWhatsAppLinkNumber } from '@/lib/whatsapp-number'
import {
  openOrderTicketPrint,
  openOrderTicketAutoPrintOnConfirm,
  orderTicketVariantFromSource,
} from '@/lib/order-print-window'
import {
  canUseConfiguredPrintAgent,
  sendOrderTicketToPrintAgent,
} from '@/lib/print-agent-client'
import {
  isBluetoothPrinterReady,
  sendOrderTicketToBluetooth,
  tryReconnectKnownBluetoothPrinter,
} from '@/lib/bluetooth-print-client'
import {
  isOperationalSyncTabVisible,
  notifyStoreOrdersChanged,
  subscribeOperationalVisibilityRefresh,
  subscribeStoreOrdersSync,
} from '@/lib/store-operational-realtime.client'
import { isDeliveryFlowOrder } from '@/lib/order-status-transitions'
import { updateOrderStatus } from '@/services/orders'
import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import { type Plan, hasFeature, merchantEntregadoresEnabled } from '@/lib/plan'
import type { StoreEntregadorDTO } from '@/lib/entregas-types'
import { slugChannelSourcesForSupabaseIn } from '@/lib/slug-channel-orders'
import {
  extractUserNotes,
  parseSectorFromNotes,
  parseTableFromOrder,
} from '@/lib/waiter-order-notes'
import { comandaDisplayName } from '@/lib/order-payments'
import {
  canCancelOrderFromPedidos,
  isPresencialComandaActive,
  isPresencialNaMesaOrder,
  type SalonMapTableRef,
} from '@/lib/presencial-table-orders'
import {
  mapActiveStoreTableRows,
  STORE_TABLES_SELECT,
} from '@/lib/store-tables'
import { orderPaymentRegisteredInCaixa } from '@/lib/cashier-comanda-close'
import {
  ordersDeliveryChannelVisible,
  ordersPresencialChannelVisible,
  resolveOrdersChannelFilter,
  type MerchantOperationMode,
} from '@/lib/merchant-operation-mode'
import {
  NFCE_CANCEL_JUSTIFICATIVA_MIN,
  nfceCancelPrazoLabel,
} from '@/lib/fiscal'
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
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'delivering'
  | 'delivered'

type ChannelFilter = 'delivery' | 'presencial'

const TAB_DEF: {
  id: TabId
  label: string
  match: (s: string | null) => boolean
}[] = [
  {
    id: 'pending',
    label: 'Aguardando preparação',
    match: (s) => s === 'pending',
  },
  { id: 'preparing', label: 'Preparando', match: (s) => s === 'preparing' },
  { id: 'ready', label: 'Pronto para entrega', match: (s) => s === 'ready' },
  {
    id: 'delivering',
    label: 'A caminho',
    match: (s) => s === 'confirmed',
  },
  { id: 'delivered', label: 'Entregues', match: (s) => s === 'delivered' },
]

const STATUS_TONE: Record<
  TabId,
  {
    header: string
    rail: string
    dot: string
    border: string
    count: string
  }
> = {
  pending: {
    header: 'bg-amber-50 text-amber-950 ring-amber-200',
    rail: 'border-t-amber-400',
    dot: 'bg-amber-500',
    border: 'border-l-amber-400',
    count: 'bg-amber-500 text-white',
  },
  preparing: {
    header: 'bg-blue-50 text-blue-950 ring-blue-200',
    rail: 'border-t-blue-500',
    dot: 'bg-blue-500',
    border: 'border-l-blue-500',
    count: 'bg-blue-500 text-white',
  },
  ready: {
    header: 'bg-orange-50 text-orange-950 ring-orange-200',
    rail: 'border-t-orange-500',
    dot: 'bg-orange-500',
    border: 'border-l-orange-500',
    count: 'bg-orange-500 text-white',
  },
  delivering: {
    header: 'bg-orange-50 text-orange-950 ring-orange-200',
    rail: 'border-t-orange-500',
    dot: 'bg-orange-500',
    border: 'border-l-orange-500',
    count: 'bg-orange-500 text-white',
  },
  delivered: {
    header: 'bg-emerald-50 text-emerald-950 ring-emerald-200',
    rail: 'border-t-emerald-500',
    dot: 'bg-emerald-500',
    border: 'border-l-emerald-500',
    count: 'bg-emerald-500 text-white',
  },
}

function kanbanLabel(id: TabId, channel: ChannelFilter): string {
  if (channel === 'presencial') {
    switch (id) {
      case 'pending':
        return 'Aguardando preparação'
      case 'preparing':
        return 'Produção'
      case 'ready':
        return 'Pronto para servir'
      case 'delivered':
        return 'Fechadas'
      case 'delivering':
        return 'Na mesa'
    }
  }
  switch (id) {
    case 'pending':
      return 'Aguardando preparação'
    case 'preparing':
      return 'Preparando'
    case 'ready':
      return 'Pronto para entrega'
    case 'delivering':
      return 'A caminho'
    case 'delivered':
      return 'Entregues'
  }
}

function statusLabel(
  status: string | null,
  deliveryPipeline: boolean,
  order?: StoreOrderRow,
  channel?: ChannelFilter,
  salonMapTables?: SalonMapTableRef[]
): string {
  if (
    channel === 'presencial' &&
    order &&
    isPresencialNaMesaOrder(order, salonMapTables)
  ) {
    const st = String(order.status ?? '').trim().toLowerCase()
    if (st === 'delivered' || st === 'confirmed') return 'Na mesa'
  }
  switch (status) {
    case 'pending':
      return 'Aguardando preparação'
    case 'preparing':
      return 'Preparando'
    case 'ready':
      return 'Pronto para entrega'
    case 'confirmed':
      return deliveryPipeline ? 'A caminho' : 'Em curso'
    case 'delivered':
      return 'Entregue'
    case 'cancelled':
      return 'Cancelado'
    default:
      return status?.trim() || '—'
  }
}

/**
 * Estrutura neutra preparada para uma futura visualização Kanban: o status aparece
 * apenas na borda lateral, mantendo os cards densos e fáceis de comparar.
 */
function statusCardSurfaceClass(status: string | null): string {
  const base = 'border border-slate-200 border-l-4 bg-white'
  switch (status) {
    case 'pending':
      return `${base} border-l-amber-500`
    case 'preparing':
      return `${base} border-l-blue-500`
    case 'ready':
      return `${base} border-l-orange-500`
    case 'confirmed':
      return `${base} border-l-orange-500`
    case 'delivered':
      return `${base} border-l-emerald-500`
    case 'cancelled':
      return `${base} border-l-slate-400 opacity-70`
    default:
      return `${base} border-l-slate-300`
  }
}

/** Remove totais por linha (`2x Item=12,50`) para exibição no card. */
function parseItemsSummaryLines(summary: string | null | undefined): string[] {
  const raw = summary?.trim()
  if (!raw) return []
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
}

const ORDER_ITEMS_COLLAPSED_COUNT = 3

function OrderItemsSummary({ summary }: { summary: string | null | undefined }) {
  const items = useMemo(() => parseItemsSummaryLines(summary), [summary])
  const [expanded, setExpanded] = useState(false)
  const needsExpand = items.length > ORDER_ITEMS_COLLAPSED_COUNT
  const visible =
    expanded || !needsExpand ? items : items.slice(0, ORDER_ITEMS_COLLAPSED_COUNT)
  const hiddenCount = items.length - ORDER_ITEMS_COLLAPSED_COUNT

  if (items.length === 0) {
    return (
      <p className="text-sm leading-5 text-slate-700">
        Itens não indicados neste pedido.
      </p>
    )
  }

  return (
    <div className="min-w-0 flex-1">
      <ul className="space-y-0.5 text-sm leading-5 text-slate-700">
        {visible.map((item, index) => (
          <li key={`${index}-${item}`} className="break-words">
            {item}
          </li>
        ))}
      </ul>
      {needsExpand ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-1.5 text-xs font-bold text-[var(--dash-primary)] underline-offset-2 hover:underline"
        >
          {expanded
            ? 'Ver menos'
            : `Ver mais ${hiddenCount} item${hiddenCount === 1 ? '' : 's'}`}
        </button>
      ) : null}
    </div>
  )
}

function orderDisplayLocation(o: StoreOrderRow): {
  title: string
  detail?: string
} {
  const table = parseTableFromOrder(o)
  const sector = parseSectorFromNotes(o.notes)
  const source = (o.source ?? '').trim().toLowerCase()
  const address = o.delivery_address?.trim()

  if (table) {
    const normalizedTable = table.replace(/^mesa\s+/i, '').trim() || table
    const sectorLabel =
      sector && !/^sal[aã]o$/i.test(sector.trim()) ? sector.trim() : null
    const comanda = comandaDisplayName(o.customer_name, '')
    const titleParts = [`Mesa ${normalizedTable}`]
    if (sectorLabel) titleParts.push(sectorLabel)
    return {
      title: titleParts.join(' · '),
      detail: comanda || undefined,
    }
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

function isInPersonOrder(o: StoreOrderRow): boolean {
  const source = (o.source ?? '').trim().toLowerCase()
  return source === 'pdv' || source === 'waiter' || source === 'autoatendimento'
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

function orderAgeMinutes(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.floor(ms / 60000)
}

function waitLabel(minutes: number): string {
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function priorityTone(
  minutes: number,
  expectedMinutes = 20
): {
  label: string
  className: string
} {
  const expected = Math.max(1, expectedMinutes)
  if (minutes > expected * 1.2) {
    return {
      label: 'Atrasado',
      className: 'bg-red-50 text-red-700 ring-red-200',
    }
  }
  if (minutes > expected) {
    return {
      label: 'Atenção',
      className: 'bg-amber-50 text-amber-700 ring-amber-200',
    }
  }
  return {
    label: 'Dentro do prazo',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  }
}

function itemCountLabel(summary: string | null | undefined): string {
  const raw = summary?.trim()
  if (!raw) return 'Itens não informados'
  const segments = raw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  let count = 0
  for (const segment of segments) {
    const match = segment.match(/^(\d+)\s*x/i)
    count += match ? Number(match[1]) || 1 : 1
  }
  return `${count} item${count === 1 ? '' : 's'}`
}

function digitsPhone(phone: string | null | undefined): string | null {
  const d = phone?.replace(/\D/g, '') ?? ''
  if (d.length < 10) return null
  return toWhatsAppLinkNumber(d)
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

function IconTablerBase({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

function IconMapPin({ className }: { className?: string }) {
  return (
    <IconTablerBase className={className}>
      <path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M17.657 16.657L13.414 20.9a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z" />
    </IconTablerBase>
  )
}

function IconClock({ className }: { className?: string }) {
  return (
    <IconTablerBase className={className}>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
      <path d="M12 7v5l3 3" />
    </IconTablerBase>
  )
}

function IconCreditCard({ className }: { className?: string }) {
  return (
    <IconTablerBase className={className}>
      <path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2H5a2 2 0 0 1 -2 -2z" />
      <path d="M3 10h18" />
      <path d="M7 15h.01" />
      <path d="M11 15h2" />
    </IconTablerBase>
  )
}

function IconShoppingCart({ className }: { className?: string }) {
  return (
    <IconTablerBase className={className}>
      <path d="M6 19a2 2 0 1 0 0.01 0" />
      <path d="M17 19a2 2 0 1 0 0.01 0" />
      <path d="M17 17H6V3H4" />
      <path d="M6 5l14 1l-1 7H6" />
    </IconTablerBase>
  )
}

function IconCurrencyDollar({ className }: { className?: string }) {
  return (
    <IconTablerBase className={className}>
      <path d="M12 3v18" />
      <path d="M17 7.5c0 -1.38 -2.24 -2.5 -5 -2.5s-5 1.12 -5 2.5s2.24 2.5 5 2.5s5 1.12 5 2.5s-2.24 2.5 -5 2.5s-5 -1.12 -5 -2.5" />
    </IconTablerBase>
  )
}

function IconBike({ className }: { className?: string }) {
  return (
    <IconTablerBase className={className}>
      <path d="M5 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
      <path d="M19 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
      <path d="M12 18l-3 -7l4 -3l2 3h3" />
      <path d="M17 6l-2 2" />
    </IconTablerBase>
  )
}

function IconReceipt({ className }: { className?: string }) {
  return (
    <IconTablerBase className={className}>
      <path d="M5 21V5a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
    </IconTablerBase>
  )
}

function IconTool({ className }: { className?: string }) {
  return (
    <IconTablerBase className={className}>
      <path d="M7 10h3V7L6.5 3.5a6 6 0 0 0 8 7.5l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 0 -7.5 -8z" />
    </IconTablerBase>
  )
}

function canPrintComandaStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toLowerCase()
  return s === 'pending' || s === 'preparing' || s === 'ready' || s === 'confirmed'
}

function useOrdersRealtime(
  storeId: string,
  initialOrders: StoreOrderRow[],
  slugChannelSourcesOnly: boolean
) {
  const [orders, setOrders] = useState<StoreOrderRow[]>(initialOrders)
  const [liveOk, setLiveOk] = useState(false)
  const seenIdsRef = useRef<Set<string>>(
    new Set(initialOrders.map((o) => o.id))
  )

  useEffect(() => {
    const supabase = createClient()

    /** Pull operacional: últimos 7 dias, max 250 — alinhado ao SSR. Histórico «Ver histórico» filtra entregues in-memory; sem busca de pedidos antigos no poll. */
    async function pullOrders(options?: { beepOnNew?: boolean }) {
      const since = operationalOrdersPullSinceIso()
      let q = supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('store_id', storeId)
        .gte('created_at', since)
      if (slugChannelSourcesOnly) {
        q = q.in('source', slugChannelSourcesForSupabaseIn())
      }
      const { data, error } = await q
        .order('created_at', { ascending: false })
        .limit(OPERATIONAL_ORDERS_PULL_LIMIT)
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

    void pullOrders().then(() => setLiveOk(true))

    const unsubscribe = subscribeStoreOrdersSync(storeId, (detail) => {
      if (!isOperationalSyncTabVisible()) return
      if (detail.source !== 'orders' && detail.source !== 'order_items') return
      void pullOrders({
        beepOnNew: detail.source === 'orders' && detail.eventType === 'INSERT',
      })
      setLiveOk(true)
    })

    const unsubscribeVis = subscribeOperationalVisibilityRefresh(() => {
      void pullOrders()
      setLiveOk(true)
    })

    const poll = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void pullOrders()
    }, 20000)

    return () => {
      window.clearInterval(poll)
      unsubscribe()
      unsubscribeVis()
    }
  }, [storeId, slugChannelSourcesOnly])

  return { orders, setOrders, liveOk }
}

type OrderCardActions = {
  patchStatus: (orderId: string, status: string) => void
  reject: (orderId: string, order: StoreOrderRow) => void
  dispatch: (order: StoreOrderRow) => void
  markDelivered: (order: StoreOrderRow) => void
  print: (order: StoreOrderRow) => void
  late: (order: StoreOrderRow) => void
  emitNfce: (order: StoreOrderRow) => void
  cancelNfce: (order: StoreOrderRow) => void
}

type NfceState = {
  status: string
  nfeUrl?: string | null
  xmlUrl?: string | null
  qrCodeUrl?: string | null
  invoiceId?: string | null
  emitidaEm?: string | null
}

function OrderCard({
  order,
  orderRef,
  plan,
  deliveryPipelineEnabled,
  channelFilter,
  busy,
  thermalBusy,
  showManualComandaPrint,
  orderHasDeliveryRegistration,
  fiscalActive,
  nfceBusy,
  nfceState,
  salonMapTables,
  onAction,
}: {
  order: StoreOrderRow
  orderRef: string
  plan: Plan
  deliveryPipelineEnabled: boolean
  channelFilter: ChannelFilter
  busy: boolean
  thermalBusy: boolean
  showManualComandaPrint: boolean
  orderHasDeliveryRegistration: boolean
  fiscalActive: boolean
  nfceBusy: boolean
  nfceState?: NfceState
  salonMapTables: SalonMapTableRef[]
  onAction: OrderCardActions
}) {
  const st = order.status
  const itemsCount = itemCountLabel(order.items_summary)
  const age = orderAgeMinutes(order.created_at)
  const priority = priorityTone(age, order.entrega_prazo_minutos ?? 20)
  const phone = order.customer_phone
  const wa = phone ? waUrl(phone, order.customer_name, orderRef) : null
  const waOut =
    phone ? waOutForDeliveryUrl(phone, order.customer_name, orderRef) : null
  const userNotes = extractUserNotes(order.notes)
  const isTrocoNote = Boolean(userNotes && /troco/i.test(userNotes))
  const payKind = paymentKind(order.payment_method)
  const paidInAdvance = orderPaymentRegisteredInCaixa(order.notes)
  const showPaymentHighlight = payKind === 'pix' || payKind === 'card'
  const showPixProofWarning = pixNeedsWhatsAppProofCheck(order)
  const source = (order.source ?? '').trim().toLowerCase()
  const location = orderDisplayLocation(order)
  const channelLabel = orderChannelLabel(source)
  const totalLabel = money.format(Number(order.total) || 0)
  const payment = paymentLabel(order.payment_method)
  const showAlertPanel =
    showPixProofWarning || showPaymentHighlight || Boolean(userNotes)
  const showDeliveryRegistration =
    st === 'delivered' &&
    deliveryPipelineEnabled &&
    merchantEntregadoresEnabled(plan) &&
    isDeliveryFlowOrder(order) &&
    !orderHasDeliveryRegistration
  const showManualPrintAction =
    showManualComandaPrint && canPrintComandaStatus(st)
  const isPresencialNaMesa = isPresencialNaMesaOrder(order, salonMapTables)
  const canCancel = canCancelOrderFromPedidos(order)
  const cancelActionLabel = isInPersonOrder(order)
    ? 'Cancelar comanda'
    : 'Cancelar pedido'
  const isActiveStatus =
    st === 'pending' || st === 'preparing' || st === 'ready' || st === 'confirmed'
  const showPrimaryStatusAction = isActiveStatus && !isPresencialNaMesa
  const showSecondaryWhatsapp = Boolean(st === 'ready' || st === 'confirmed' ? waOut || wa : wa)
  const readyIsDelivery = deliveryPipelineEnabled && isDeliveryFlowOrder(order)
  const showNfce =
    fiscalActive &&
    (st !== 'cancelled' || nfceState?.status === 'autorizada')
  const nfceAuthorized = nfceState?.status === 'autorizada'
  const nfceCancelled = nfceState?.status === 'cancelada'
  const nfcePrazoHint = nfceAuthorized
    ? nfceCancelPrazoLabel({
        status: 'autorizada',
        emitida_em: nfceState?.emitidaEm ?? null,
      })
    : null

  const primaryButtonBase =
    'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-extrabold text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50'
  const secondaryButtonClass =
    'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50'

  const primary =
    st === 'pending'
      ? {
          label: '✓ Preparar',
          className: 'bg-emerald-600 hover:bg-emerald-700',
          run: () => onAction.patchStatus(order.id, 'preparing'),
        }
      : st === 'preparing'
        ? {
            label: '✓ Pronto',
            className: 'bg-blue-600 hover:bg-blue-700',
            run: () => onAction.patchStatus(order.id, 'ready'),
          }
        : st === 'ready'
          ? {
              label: readyIsDelivery ? '🛵 Sair para entrega' : '✓ Entregue',
              className: 'bg-orange-600 hover:bg-orange-700',
              run: () => onAction.dispatch(order),
            }
          : st === 'confirmed'
            ? {
                label: '✓ Marcar entregue',
                className: 'bg-orange-600 hover:bg-orange-700',
                run: () => onAction.markDelivered(order),
              }
            : null

  return (
    <li
      id={`order-card-${order.id}`}
      data-order-card
      data-status={st ?? 'unknown'}
      aria-label={`Pedido ${orderRef}, ${statusLabel(st, deliveryPipelineEnabled, order, channelFilter, salonMapTables)}`}
      className={`group scroll-mt-28 rounded-xl shadow-sm transition hover:border-slate-300 hover:shadow-md ${statusCardSurfaceClass(st)} ${
        st === 'cancelled' ? 'opacity-70' : ''
      }`}
    >
      <div id={`order-details-${order.id}`} className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-black tracking-tight text-slate-950">
              Pedido {orderRef}
            </p>
            <div className="mt-1 flex flex-col items-start gap-1.5">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ring-1 ${priority.className}`}
              >
                {priority.label}
              </span>
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                {statusLabel(st, deliveryPipelineEnabled, order, channelFilter, salonMapTables)}
              </span>
            </div>
          </div>
          <p className="shrink-0 text-lg font-black tabular-nums tracking-tight text-slate-950">
            {totalLabel}
          </p>
        </div>

        <div className="mt-3 space-y-2 border-y border-slate-100 py-2">
          <p className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-950">
            <IconMapPin className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">
              {location.title}
              {location.detail ? (
                <span className="text-xs font-bold uppercase text-slate-500">
                  {' · '}
                  {location.detail}
                </span>
              ) : null}
            </span>
          </p>
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold leading-5 text-slate-500">
            <IconClock className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="whitespace-nowrap">{waitLabel(age)} aguardando</span>
            <span aria-hidden className="px-0.5 text-slate-300">
              ·
            </span>
            <span className="whitespace-nowrap">{channelLabel}</span>
            {payment !== '—' ? (
              <>
                <span aria-hidden className="px-0.5 text-slate-300">
                  ·
                </span>
                <IconCreditCard className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="whitespace-nowrap">{payment}</span>
              </>
            ) : null}
            {paidInAdvance ? (
              <>
                <span aria-hidden className="px-0.5 text-slate-300">
                  ·
                </span>
                <span className="whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200">
                  Pago
                </span>
              </>
            ) : null}
            {order.entregador_nome ? (
              <>
                <span aria-hidden className="px-0.5 text-slate-300">
                  ·
                </span>
                <span className="whitespace-nowrap">{order.entregador_nome}</span>
              </>
            ) : null}
          </p>
          <div className="flex items-start justify-between gap-2">
            <OrderItemsSummary summary={order.items_summary} />
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
              {itemsCount}
            </span>
          </div>
        </div>

        {showAlertPanel ? (
          <div className="mt-3 space-y-2 rounded-xl bg-slate-50 px-3 py-2">
            {showPixProofWarning ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
                <span>
                  PIX informado pelo cliente. Confirme o comprovante antes de
                  avançar.
                </span>
                {wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md bg-[#25D366] px-2.5 text-xs font-bold text-white"
                  >
                    <IconWhatsApp className="h-3.5 w-3.5" />
                    WhatsApp
                  </a>
                ) : null}
              </div>
            ) : null}
            {showPaymentHighlight && !showPixProofWarning ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-[#475569]">
                {payKind === 'card' ? (
                  <IconCardPay className="h-4 w-4 shrink-0" />
                ) : (
                  <IconPixPay className="h-4 w-4 shrink-0" />
                )}
                Pagamento: {payment}
              </p>
            ) : null}
            {isTrocoNote ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-[#475569]">
                <IconCoin className="h-4 w-4 shrink-0" />
                {userNotes}
              </p>
            ) : userNotes ? (
              <p className="text-xs leading-relaxed text-[#64748b]">
                {userNotes}
              </p>
            ) : null}
          </div>
        ) : null}

        {showPrimaryStatusAction || showDeliveryRegistration || showManualPrintAction || showSecondaryWhatsapp || showNfce ? (
          <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
            {primary ? (
              <button
                type="button"
                disabled={busy}
                onClick={primary.run}
                className={`${primaryButtonBase} ${primary.className}`}
              >
                {primary.label}
              </button>
            ) : null}
            {showDeliveryRegistration ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction.late(order)}
                className={`${primaryButtonBase} bg-orange-600 hover:bg-orange-700`}
              >
                ✓ Registar entrega
              </button>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {showManualPrintAction ? (
                <button
                  type="button"
                  disabled={thermalBusy}
                  onClick={() => onAction.print(order)}
                  className={secondaryButtonClass}
                  title="Térmica Wi-Fi se configurada; senão abre a pré-visualização da comanda."
                >
                  <IconPrinter className="h-4 w-4 shrink-0" />
                  {thermalBusy ? '…' : 'Comanda'}
                </button>
              ) : null}
              {showSecondaryWhatsapp ? (
                <a
                  href={(st === 'ready' || st === 'confirmed' ? waOut || wa : wa) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={secondaryButtonClass}
                >
                  <IconWhatsApp className="h-4 w-4" />
                  WhatsApp
                </a>
              ) : null}
              {showNfce ? (
                nfceAuthorized ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {nfceState?.nfeUrl ? (
                      <a
                        href={nfceState.nfeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${secondaryButtonClass} border-emerald-200 bg-emerald-50 text-emerald-700`}
                        title={
                          nfcePrazoHint
                            ? `Abrir DANFE. ${nfcePrazoHint}`
                            : 'Abrir DANFE'
                        }
                      >
                        <IconReceipt className="h-4 w-4" />
                        DANFE
                      </a>
                    ) : (
                      <span
                        className={`${secondaryButtonClass} border-emerald-200 bg-emerald-50 text-emerald-700`}
                        title={nfcePrazoHint ?? 'NFC-e autorizada'}
                      >
                        <IconReceipt className="h-4 w-4" />
                        NFC-e ✓
                      </span>
                    )}
                    {nfceState?.xmlUrl ? (
                      <a
                        href={`${nfceState.xmlUrl}${nfceState.xmlUrl.includes('?') ? '&' : '?'}download=1`}
                        className={secondaryButtonClass}
                        title="Baixar XML autorizado"
                      >
                        XML
                      </a>
                    ) : null}
                    {nfceState?.qrCodeUrl ? (
                      <a
                        href={nfceState.qrCodeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={secondaryButtonClass}
                        title="Abrir QR Code da NFC-e (consulta SEFAZ)"
                      >
                        QR
                      </a>
                    ) : null}
                    <button
                      type="button"
                      disabled={nfceBusy}
                      onClick={() => onAction.cancelNfce(order)}
                      className={`${secondaryButtonClass} border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-900`}
                      title={
                        nfcePrazoHint
                          ? `Cancelar NFC-e na SEFAZ. ${nfcePrazoHint}`
                          : 'Cancelar NFC-e na SEFAZ'
                      }
                    >
                      {nfceBusy ? 'Cancelando…' : 'Cancelar NFC-e'}
                    </button>
                  </div>
                ) : nfceCancelled ? (
                  <span className={`${secondaryButtonClass} border-slate-200 bg-slate-50 text-slate-500`}>
                    <IconReceipt className="h-4 w-4" />
                    NFC-e cancelada
                  </span>
                ) : st !== 'cancelled' ? (
                  <button
                    type="button"
                    disabled={nfceBusy}
                    onClick={() => onAction.emitNfce(order)}
                    className={secondaryButtonClass}
                    title="Emitir Nota Fiscal de Consumidor (NFC-e) deste pedido"
                  >
                    <IconReceipt className="h-4 w-4 shrink-0" />
                    {nfceBusy ? 'Emitindo…' : 'Emitir NFC-e'}
                  </button>
                ) : null
              ) : null}
            </div>
          </div>
        ) : null}

        {canCancel ? (
          <div className="mt-2 border-t border-slate-50 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction.reject(order.id, order)}
              className="block w-full text-center text-[10px] font-medium text-slate-400 underline-offset-2 opacity-60 transition hover:text-rose-600 hover:underline hover:opacity-100 focus:text-rose-600 focus:underline focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
              title={
                isInPersonOrder(order)
                  ? 'Anular comanda antes do pagamento'
                  : 'Cancelar pedido em andamento'
              }
            >
              {cancelActionLabel}
            </button>
          </div>
        ) : null}
      </div>
    </li>
  )
}

function KanbanColumn({
  title,
  status,
  orders,
  color,
  renderOrder,
}: {
  title: string
  status: TabId
  orders: StoreOrderRow[]
  color: (typeof STATUS_TONE)[TabId]
  renderOrder: (order: StoreOrderRow) => ReactNode
}) {
  return (
    <section
      data-kanban-status={status}
      className={`max-h-[calc(100vh-220px)] min-h-[220px] overflow-y-auto rounded-2xl border border-l-4 border-slate-200 bg-slate-50/70 p-2.5 shadow-sm ${color.border}`}
    >
      <div className={`sticky top-0 z-10 mb-2 rounded-xl px-3 py-2 ring-1 backdrop-blur ${color.header}`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold">{title}</h2>
          <span
            className={`inline-flex min-w-8 items-center justify-center rounded-full px-2 py-1 text-sm font-black leading-none tabular-nums ${color.count}`}
            aria-label={`${orders.length} pedidos em ${title}`}
          >
            {orders.length}
          </span>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-8 text-center text-xs font-semibold text-slate-400">
          Sem comandas
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {orders.map((order) => renderOrder(order))}
        </ul>
      )}
    </section>
  )
}

export function OrdersClient({
  initialOrders,
  storeId,
  storeName,
  printing,
  plan,
  deliveryPipelineEnabled = true,
  operationMode = null,
  slugChannelSourcesOnly = false,
  initialChannelFilter = 'delivery',
  initialSalonTables = [],
}: {
  initialOrders: StoreOrderRow[]
  storeId: string
  storeName: string
  printing: StorePrintingState
  plan: Plan
  /** Slug / entregas / separador «A caminho»: só delivery e híbrido. */
  deliveryPipelineEnabled?: boolean
  /** Modelo de operação da loja — define quais canais aparecem em Pedidos. */
  operationMode?: MerchantOperationMode | null
  /** Growth + delivery: só pedidos do cardápio público (slug/QR entrega ou retirada). */
  slugChannelSourcesOnly?: boolean
  /** Hub `?hub=comandas` abre direto no canal presencial (quando disponível). */
  initialChannelFilter?: ChannelFilter
  /** Mesas do salão — alinha «Na mesa» em Pedidos com o mapa do Garçom. */
  initialSalonTables?: SalonMapTableRef[]
}) {
  const showDeliveryChannel = ordersDeliveryChannelVisible(operationMode)
  const showPresencialChannel = ordersPresencialChannelVisible(operationMode)
  const [salonTables, setSalonTables] = useState<SalonMapTableRef[]>(initialSalonTables)
  const { orders, setOrders, liveOk } = useOrdersRealtime(
    storeId,
    initialOrders,
    slugChannelSourcesOnly
  )
  useEffect(() => {
    setOrders(initialOrders)
  }, [initialOrders, setOrders])
  useEffect(() => {
    setSalonTables(initialSalonTables)
  }, [initialSalonTables])
  useEffect(() => {
    const supabase = createClient()

    async function pullSalonTables() {
      const { data, error } = await supabase
        .from('store_tables')
        .select(STORE_TABLES_SELECT)
        .eq('store_id', storeId)
        .order('ambiente', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (error || !data) return
      setSalonTables(
        mapActiveStoreTableRows(data as Record<string, unknown>[]).map((t) => ({
          name: t.name,
          ambiente: t.ambiente,
        }))
      )
    }

    void pullSalonTables()

    const unsubscribe = subscribeStoreOrdersSync(storeId, (detail) => {
      if (!isOperationalSyncTabVisible()) return
      if (detail.source === 'store_tables') void pullSalonTables()
    })

    const unsubscribeVis = subscribeOperationalVisibilityRefresh(() => {
      void pullSalonTables()
    })

    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void pullSalonTables()
    }, 30000)

    return () => {
      window.clearInterval(poll)
      unsubscribe()
      unsubscribeVis()
    }
  }, [storeId])
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>(() =>
    resolveOrdersChannelFilter(operationMode, initialChannelFilter)
  )
  useEffect(() => {
    setChannelFilter((current) =>
      resolveOrdersChannelFilter(operationMode, current)
    )
  }, [operationMode])
  const [showActionQueue, setShowActionQueue] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [waNotice, setWaNotice] = useState<string | null>(null)
  const waNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [deliveryModal, setDeliveryModal] = useState<
    null | { mode: 'dispatch' | 'on_deliver' | 'late'; order: StoreOrderRow }
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
  const [fiscalActive, setFiscalActive] = useState(false)
  const [nfceBusyId, setNfceBusyId] = useState<string | null>(null)
  const [nfceStateById, setNfceStateById] = useState<Map<string, NfceState>>(new Map())

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
    if (!hasFeature(plan, 'printing')) return
    void tryReconnectKnownBluetoothPrinter()
  }, [plan])

  // Só mostra o botão "Emitir NFC-e" quando o add-on fiscal está ativo.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/store/fiscal?storeId=${encodeURIComponent(storeId)}`, {
          credentials: 'include',
        })
        const json = (await res.json().catch(() => ({}))) as { fiscal?: { status?: string } }
        if (!cancelled) setFiscalActive(json.fiscal?.status === 'ativo')
      } catch {
        if (!cancelled) setFiscalActive(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [storeId])

  // Carrega NFC-e autorizadas/canceladas dos pedidos visíveis (PDV/caixa incluídos).
  useEffect(() => {
    if (!fiscalActive) return
    const ids = orders.map((o) => o.id).filter(Boolean)
    if (!ids.length) return
    let cancelled = false
    void (async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('fiscal_invoices')
        .select('id, order_id, status, nfe_url, xml_url, qr_code_url, emitida_em')
        .eq('store_id', storeId)
        .in('order_id', ids)
        .in('status', ['autorizada', 'cancelada'])
      if (cancelled || !data?.length) return
      setNfceStateById((prev) => {
        const next = new Map(prev)
        for (const row of data) {
          const orderId = String((row as { order_id?: string }).order_id ?? '')
          if (!orderId) continue
          const status = String((row as { status?: string }).status ?? '')
          const existing = next.get(orderId)
          // Preferir autorizada se houver conflito.
          if (existing?.status === 'autorizada' && status !== 'autorizada') continue
          next.set(orderId, {
            status,
            nfeUrl: ((row as { nfe_url?: string | null }).nfe_url as string | null) ?? null,
            xmlUrl: ((row as { xml_url?: string | null }).xml_url as string | null) ?? null,
            qrCodeUrl:
              ((row as { qr_code_url?: string | null }).qr_code_url as string | null) ?? null,
            invoiceId: String((row as { id?: string }).id ?? '') || null,
            emitidaEm:
              ((row as { emitida_em?: string | null }).emitida_em as string | null) ?? null,
          })
        }
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [fiscalActive, orders, storeId])

  useEffect(() => {
    if (!deliveryPipelineEnabled) return
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
  }, [orders, deliveryPipelineEnabled])

  useEffect(() => {
    if (!deliveryModal) return
    if (!merchantEntregadoresEnabled(plan)) {
      setDeliveryModal(null)
      return
    }
    const o = deliveryModal.order
    const preAssigned = o.entregador_id?.trim() || ''
    setDelSel(
      preAssigned
        ? preAssigned
        : deliveryModal.mode === 'on_deliver' && !o.entregador_nome?.trim()
          ? '__sem_entregador__'
          : ''
    )
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
      const assigned = preAssigned
        ? list.find((e) => e.id === preAssigned)
        : null
      if (assigned?.valor_padrao_corrida && assigned.valor_padrao_corrida > 0) {
        setDelValorCorrida(String(assigned.valor_padrao_corrida).replace('.', ','))
      } else if (deliveryModal.mode === 'dispatch') {
        setDelValorCorrida('')
      }
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

  const channelCounts = useMemo(() => {
    const isActive = (o: StoreOrderRow) => {
      if ((o.status ?? '') === 'cancelled') return false
      return o.status !== 'delivered' && o.status !== 'cancelled'
    }
    const activeOrders = orders.filter((o) => {
      if ((o.status ?? '') === 'cancelled') return false
      if (isInPersonOrder(o)) return isPresencialComandaActive(o)
      return o.status !== 'delivered'
    })
    const delivery = orders.filter((o) => !isInPersonOrder(o)).length
    const presencial = orders.filter((o) => isInPersonOrder(o)).length
    const deliveryActive = orders.filter(
      (o) => !isInPersonOrder(o) && isActive(o)
    ).length
    const presencialActive = orders.filter((o) => isPresencialComandaActive(o)).length
    const lateActive = orders.filter((o) => {
      if (!isActive(o)) return false
      const expected = Math.max(1, o.entrega_prazo_minutos ?? 20)
      return orderAgeMinutes(o.created_at) > expected * 1.2
    }).length
    const revenue = activeOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
    return {
      all: activeOrders.length,
      delivery,
      presencial,
      deliveryActive,
      presencialActive,
      lateActive,
      revenue,
    }
  }, [orders])

  const channelFilteredOrders = useMemo(() => {
    if (channelFilter === 'delivery') {
      return orders.filter((o) => !isInPersonOrder(o))
    }
    return orders.filter((o) => isInPersonOrder(o))
  }, [channelFilter, orders])

  const counts = useMemo(() => {
    const total = channelFilteredOrders.length
    const pending = channelFilteredOrders.filter((o) => o.status === 'pending').length
    const preparing = channelFilteredOrders.filter((o) => o.status === 'preparing').length
    const ready = channelFilteredOrders.filter((o) => o.status === 'ready').length
    const delivering =
      channelFilter === 'presencial'
        ? channelFilteredOrders.filter((o) =>
            isPresencialNaMesaOrder(o, salonTables)
          ).length
        : channelFilteredOrders.filter((o) => o.status === 'confirmed').length
    const delivered = channelFilteredOrders.filter((o) => o.status === 'delivered').length
    return { total, pending, preparing, ready, delivering, delivered }
  }, [channelFilter, channelFilteredOrders, salonTables])

  const visibleColumns = useMemo(() => {
    if (channelFilter === 'presencial') {
      return TAB_DEF.filter((c) => c.id !== 'delivered')
    }
    if (!deliveryPipelineEnabled) {
      return TAB_DEF.filter((c) => c.id !== 'delivering' && c.id !== 'delivered')
    }
    return TAB_DEF.filter((c) => c.id !== 'delivered')
  }, [channelFilter, deliveryPipelineEnabled])

  const kanbanColumns = useMemo(
    () =>
      visibleColumns.map((column) => ({
        ...column,
        label: kanbanLabel(column.id, channelFilter),
        orders: channelFilteredOrders.filter((o) => {
          if (channelFilter === 'presencial' && column.id === 'delivering') {
            return isPresencialNaMesaOrder(o, salonTables)
          }
          if (channelFilter === 'presencial' && column.id !== 'delivering') {
            return column.match(o.status) && !isPresencialNaMesaOrder(o, salonTables)
          }
          return column.match(o.status)
        }),
      })),
    [channelFilter, channelFilteredOrders, visibleColumns, salonTables]
  )

  const historyOrders = useMemo(
    () =>
      channelFilteredOrders.filter((o) => {
        if (channelFilter === 'presencial') {
          const status = String(o.status ?? '').trim().toLowerCase()
          if (status !== 'delivered') return false
          return !isPresencialNaMesaOrder(o, salonTables)
        }
        return o.status === 'delivered'
      }),
    [channelFilter, channelFilteredOrders, salonTables]
  )

  const actionOrders = useMemo(
    () =>
      channelFilteredOrders
        .filter((o) => o.status !== 'delivered' && o.status !== 'cancelled')
        .sort((a, b) => orderAgeMinutes(b.created_at) - orderAgeMinutes(a.created_at)),
    [channelFilteredOrders]
  )

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
    const printingEnabled = hasFeature(plan, 'printing')
    const orderRef =
      displayNumberById.get(o.id) ?? o.id.replace(/-/g, '').slice(0, 8)
    const ticketOpts = {
      storeName,
      order: o,
      orderDisplayRef: orderRef,
      printing: {
        print_include_customer_details: printing.print_include_customer_details,
        print_delivery_copy: printing.print_delivery_copy,
        print_paper_mm: printing.print_paper_mm,
      },
      variant: orderTicketVariantFromSource(o.source, o),
    }

    if (printingEnabled && isBluetoothPrinterReady()) {
      setThermalBusyId(o.id)
      flashWaNotice('A imprimir por Bluetooth…')
      try {
        const bt = await sendOrderTicketToBluetooth(ticketOpts)
        if (bt.ok) {
          flashWaNotice('Comanda enviada à impressora Bluetooth.')
          return
        }
        flashWaNotice(bt.message || 'Bluetooth falhou, a tentar outra via…')
      } catch {
        /* tenta agente / pré-visualização */
      } finally {
        setThermalBusyId(null)
      }
    }

    const useThermal = printingEnabled && Boolean(printing.print_agent_url?.trim())
    if (useThermal) {
      setThermalBusyId(o.id)
      flashWaNotice('A imprimir…')
      try {
        if (canUseConfiguredPrintAgent(printing)) {
          const direct = await sendOrderTicketToPrintAgent(ticketOpts, printing)
          if (direct.ok) {
            flashWaNotice('Comanda enviada à impressora.')
            return
          }
        }
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

  async function patchStatus(
    orderId: string,
    status: string,
    options?: { presencial?: boolean }
  ) {
    const orderBefore = orders.find((o) => o.id === orderId)
    const presencial =
      options?.presencial ?? Boolean(orderBefore && isInPersonOrder(orderBefore))
    setBusyId(orderId)
    const { error, fiscal } = await updateOrderStatus(orderId, status, { storeId })
    setBusyId(null)
    if (error) {
      alert(error.message)
      return
    }
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status } : o))
    )
    notifyStoreOrdersChanged(storeId, { eventType: 'UPDATE' })
    if (status === 'cancelled' && fiscal?.attempted) {
      const cancelledLabel = presencial ? 'Comanda cancelada' : 'Pedido cancelado'
      if (fiscal.ok) {
        setNfceStateById((prev) => {
          const next = new Map(prev)
          const cur = next.get(orderId)
          next.set(orderId, {
            status: 'cancelada',
            nfeUrl: cur?.nfeUrl ?? null,
            xmlUrl: cur?.xmlUrl ?? null,
            qrCodeUrl: cur?.qrCodeUrl ?? null,
            invoiceId: cur?.invoiceId ?? null,
            emitidaEm: cur?.emitidaEm ?? null,
          })
          return next
        })
        flashWaNotice(`${cancelledLabel}. NFC-e cancelada.`)
      } else {
        flashWaNotice(
          `${cancelledLabel}, mas a NFC-e não foi cancelada: ${
            fiscal.motivo || 'erro desconhecido'
          }. Use «Cancelar NFC-e» se ainda estiver no prazo.`
        )
      }
    } else if (status === 'cancelled') {
      flashWaNotice(presencial ? 'Comanda cancelada.' : 'Pedido cancelado.')
    }
    if (
      status === 'preparing' &&
      printing.print_auto_on_confirm &&
      orderBefore
    ) {
      const ref =
        displayNumberById.get(orderId) ?? orderId.replace(/-/g, '').slice(0, 8)
      const ok = openOrderTicketAutoPrintOnConfirm(
        orderId,
        {
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
        },
        printing
      )
      if (!ok) {
        flashWaNotice(
          'Permite pop-ups neste site para a impressão automática funcionar.'
        )
      }
    }
  }

  function onDispatchForDelivery(o: StoreOrderRow) {
    if (o.status !== 'ready') return
    if (!isDeliveryFlowOrder(o)) {
      void patchStatus(o.id, 'delivered')
      return
    }
    if (!deliveryPipelineEnabled) {
      void patchStatus(o.id, 'delivered')
      return
    }
    if (!merchantEntregadoresEnabled(plan)) {
      void patchStatus(o.id, 'confirmed')
      return
    }
    setDeliveryModal({ mode: 'dispatch', order: o })
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

  async function submitDispatchModal() {
    if (!deliveryModal || deliveryModal.mode !== 'dispatch') return
    const o = deliveryModal.order
    const semEntregador = delSel === '__sem_entregador__'
    const avulso = delSel === '__avulso__'
    const entregadorId =
      !semEntregador && !avulso && delSel.trim() ? delSel.trim() : null
    const nomeAvulso = avulso ? delNomeAvulso.trim() : ''
    if (!semEntregador && !entregadorId && !nomeAvulso) {
      alert(
        'Seleciona um entregador cadastrado, indica nome avulso ou despacha sem entregador (apps externos).'
      )
      return
    }
    setDelSubmitting(true)
    try {
      const res = await dashboardFetch('/api/orders/assign-courier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: o.id,
          semEntregador,
          entregadorId,
          entregadorNomeAvulso: avulso ? nomeAvulso : undefined,
          prazoMinutos: 45,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        order?: Record<string, unknown>
      }
      if (!res.ok) {
        alert(json.error || 'Não foi possível despachar o pedido.')
        return
      }
      if (json.order) {
        setOrders((prev) =>
          prev.map((x) => (x.id === o.id ? mapStoreOrderRow(json.order!) : x))
        )
      } else {
        setOrders((prev) =>
          prev.map((x) =>
            x.id === o.id ? { ...x, status: 'confirmed' } : x
          )
        )
      }
      setDeliveryModal(null)
      notifyStoreOrdersChanged(storeId, { eventType: 'UPDATE' })
    } finally {
      setDelSubmitting(false)
    }
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
        notifyStoreOrdersChanged(storeId, { eventType: 'UPDATE' })
        return
      }

      const avulso = delSel === '__avulso__'
      const semEntregador = delSel === '__sem_entregador__'
      const entregadorId =
        !avulso && !semEntregador && delSel.trim() ? delSel.trim() : null
      const nomeAvulso = avulso ? delNomeAvulso.trim() : ''
      if (
        deliveryModal.mode === 'on_deliver' &&
        (semEntregador || (!entregadorId && !nomeAvulso && !o.entregador_id?.trim()))
      ) {
        await submitDeliveryModal(true)
        return
      }
      if (!entregadorId && !nomeAvulso) {
        alert(
          'Seleciona um entregador cadastrado, indica nome avulso ou marca sem entregador.'
        )
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
      notifyStoreOrdersChanged(storeId, { eventType: 'UPDATE' })
    } finally {
      setDelSubmitting(false)
    }
  }

  function confirmReject(orderId: string, order: StoreOrderRow) {
    const presencial = isInPersonOrder(order)
    const ref = displayNumberById.get(orderId) ?? '—'
    const total = money.format(Number(order.total) || 0)
    const msg = presencial
      ? `Cancelar a comanda #${ref} (${total})?\n\nEla deixa de contar na mesa e não pode ser reaberta.`
      : `Cancelar o pedido #${ref} (${total})?\n\nEsta ação não pode ser desfeita. Avise o cliente se necessário.`
    if (!confirm(msg)) return
    const typed = window.prompt(
      `Para confirmar, escreva CANCELAR (pedido #${ref}):`
    )
    if (typed?.trim().toUpperCase() !== 'CANCELAR') {
      if (typed !== null) {
        flashWaNotice('Cancelamento não confirmado.')
      }
      return
    }
    void patchStatus(orderId, 'cancelled', { presencial })
  }

  async function emitNfce(order: StoreOrderRow) {
    const ref = `#${displayNumberById.get(order.id) ?? '—'}`
    const cpfInput = window.prompt(
      `Emitir NFC-e do pedido ${ref}.\n\nCPF na nota (opcional) — informe apenas os números ou deixe em branco:`,
      ''
    )
    if (cpfInput === null) return // cancelado
    const cpf = cpfInput.replace(/\D/g, '')
    if (cpf && cpf.length !== 11) {
      flashWaNotice('CPF inválido: use 11 dígitos ou deixe em branco.')
      return
    }
    setNfceBusyId(order.id)
    try {
      const res = await dashboardFetch('/api/store/fiscal/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, cpf: cpf || undefined }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        status?: string
        chaveAcesso?: string
        nfeUrl?: string
        xmlUrl?: string
        qrCodeUrl?: string
        invoiceId?: string
      }
      if (!res.ok) {
        flashWaNotice(json.error || 'Não foi possível emitir a NFC-e.')
        return
      }
      setNfceStateById((prev) => {
        const next = new Map(prev)
        next.set(order.id, {
          status: json.status || 'autorizada',
          nfeUrl: json.nfeUrl,
          xmlUrl: json.xmlUrl,
          qrCodeUrl: json.qrCodeUrl,
          invoiceId: json.invoiceId ?? null,
          emitidaEm: new Date().toISOString(),
        })
        return next
      })
      flashWaNotice(
        json.chaveAcesso
          ? `NFC-e autorizada (${json.chaveAcesso}).`
          : 'NFC-e emitida com sucesso.'
      )
    } finally {
      setNfceBusyId(null)
    }
  }

  async function cancelNfce(order: StoreOrderRow) {
    const ref = `#${displayNumberById.get(order.id) ?? '—'}`
    const state = nfceStateById.get(order.id)
    const prazo = nfceCancelPrazoLabel({
      status: state?.status,
      emitida_em: state?.emitidaEm ?? null,
    })
    const justificativaInput = window.prompt(
      `Cancelar NFC-e do pedido ${ref}.\n\n${prazo}\n\nJustificativa (mínimo ${NFCE_CANCEL_JUSTIFICATIVA_MIN} caracteres):`,
      'Cancelamento do pedido pelo lojista.'
    )
    if (justificativaInput === null) return
    const justificativa = justificativaInput.trim()
    if (justificativa.length < NFCE_CANCEL_JUSTIFICATIVA_MIN) {
      flashWaNotice(
        `Justificativa deve ter no mínimo ${NFCE_CANCEL_JUSTIFICATIVA_MIN} caracteres.`
      )
      return
    }
    setNfceBusyId(order.id)
    try {
      const res = await dashboardFetch('/api/store/fiscal/cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          invoiceId: state?.invoiceId || undefined,
          justificativa,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        status?: string
        invoiceId?: string
      }
      if (!res.ok) {
        flashWaNotice(json.error || 'Não foi possível cancelar a NFC-e.')
        return
      }
      setNfceStateById((prev) => {
        const next = new Map(prev)
        next.set(order.id, {
          status: 'cancelada',
          nfeUrl: state?.nfeUrl ?? null,
          xmlUrl: state?.xmlUrl ?? null,
          qrCodeUrl: state?.qrCodeUrl ?? null,
          invoiceId: json.invoiceId ?? state?.invoiceId ?? null,
          emitidaEm: state?.emitidaEm ?? null,
        })
        return next
      })
      flashWaNotice('NFC-e cancelada com sucesso.')
    } finally {
      setNfceBusyId(null)
    }
  }

  function scrollToOrder(orderId: string) {
    setShowActionQueue(false)
    window.requestAnimationFrame(() => {
      document
        .getElementById(`order-card-${orderId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <nav className="-ml-4 text-xs text-[#6b7280] sm:ml-0">
        <Link href="/dashboard" className="hover:text-[#1a1614]">
          Início
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-[#1a1614]">Pedidos</span>
      </nav>

      <header className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">
                Pedidos
              </h1>
              <button
                type="button"
                onClick={() => setShowActionQueue((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
              >
                <span className="relative flex h-2 w-2">
                  {liveOk ? (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  ) : null}
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                {liveOk ? `${actionOrders.length} pedidos aguardando ação` : 'Atualizando'}
              </button>
            </div>
            <div
              className={`mt-2 grid grid-cols-2 gap-2 ${
                showDeliveryChannel && showPresencialChannel
                  ? 'md:grid-cols-4'
                  : 'md:grid-cols-3'
              }`}
            >
              <div
                className={`min-w-0 overflow-hidden rounded-xl border px-3 py-2 ${
                  channelCounts.lateActive > 0
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <IconShoppingCart className="h-4 w-4 shrink-0 text-slate-500" />
                  <p className="min-w-0 truncate text-xl font-semibold tabular-nums text-slate-950 sm:text-2xl">
                    {channelCounts.all}
                  </p>
                </div>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  Pedidos ativos
                </p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <IconCurrencyDollar className="h-4 w-4 shrink-0 text-slate-500" />
                  <p className="min-w-0 truncate text-lg font-semibold tabular-nums text-slate-950 sm:text-xl">
                    {money.format(channelCounts.revenue)}
                  </p>
                </div>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  Faturamento ativo
                </p>
              </div>
              {showDeliveryChannel ? (
              <div className="min-w-0 overflow-hidden rounded-xl border border-orange-100 bg-orange-50/50 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <IconBike className="h-4 w-4 shrink-0 text-orange-700" />
                  <p className="min-w-0 truncate text-xl font-semibold tabular-nums text-orange-950 sm:text-2xl">
                    {channelCounts.deliveryActive}
                  </p>
                </div>
                <p className="mt-0.5 text-xs font-semibold text-orange-700">
                  Delivery ativo
                </p>
              </div>
              ) : null}
              {showPresencialChannel ? (
              <div className="min-w-0 overflow-hidden rounded-xl border border-orange-100 bg-orange-50/50 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <IconTool className="h-4 w-4 shrink-0 text-orange-700" />
                  <p className="min-w-0 truncate text-xl font-semibold tabular-nums text-orange-950 sm:text-2xl">
                    {channelCounts.presencialActive}
                  </p>
                </div>
                <p className="mt-0.5 text-xs font-semibold text-orange-700">
                  Presencial ativo
                </p>
              </div>
              ) : null}
            </div>
          </div>

          <div
            className={`grid w-full gap-2 xl:w-auto xl:min-w-[420px] ${
              showDeliveryChannel && showPresencialChannel
                ? 'sm:grid-cols-2'
                : 'grid-cols-1'
            }`}
          >
            {showDeliveryChannel ? (
            <button
              type="button"
              onClick={() => setChannelFilter('delivery')}
              className={`group relative min-w-0 rounded-2xl border-2 px-4 py-4 text-left shadow-sm transition-all active:scale-[0.98] ${
                channelFilter === 'delivery'
                  ? 'border-orange-500 bg-orange-50 text-orange-950 shadow-md shadow-orange-500/15 ring-2 ring-orange-200'
                  : 'border-slate-200 bg-white text-slate-800 hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50 hover:shadow-md'
              }`}
            >
              <span className="flex min-w-0 items-center justify-between gap-2 text-base font-extrabold">
                <span className="min-w-0 truncate">Delivery</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                    channelFilter === 'delivery'
                      ? 'bg-orange-500 text-white'
                      : 'bg-orange-100 text-orange-700 group-hover:bg-orange-200'
                  }`}
                >
                  Abrir
                </span>
              </span>
              <span
                className={`mt-1 block text-xs font-bold ${
                  channelFilter === 'delivery' ? 'text-orange-800' : 'text-slate-500'
                }`}
              >
                {channelCounts.deliveryActive} pedidos ativos
              </span>
            </button>
            ) : null}
            {showPresencialChannel ? (
            <button
              type="button"
              onClick={() => setChannelFilter('presencial')}
              className={`group relative min-w-0 rounded-2xl border-2 px-4 py-4 text-left shadow-sm transition-all active:scale-[0.98] ${
                channelFilter === 'presencial'
                  ? 'border-orange-500 bg-orange-50 text-orange-950 shadow-md shadow-orange-500/15 ring-2 ring-orange-200'
                  : 'border-slate-200 bg-white text-slate-800 hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50 hover:shadow-md'
              }`}
            >
              <span className="flex min-w-0 items-center justify-between gap-2 text-base font-extrabold">
                <span className="min-w-0 truncate">Presencial</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                    channelFilter === 'presencial'
                      ? 'bg-orange-500 text-white'
                      : 'bg-orange-100 text-orange-700 group-hover:bg-orange-200'
                  }`}
                >
                  Abrir
                </span>
              </span>
              <span
                className={`mt-1 block text-xs font-bold ${
                  channelFilter === 'presencial' ? 'text-orange-800' : 'text-slate-500'
                }`}
              >
                {channelCounts.presencialActive} comandas ativas
              </span>
            </button>
            ) : null}
          </div>
        </div>

        <div
          aria-hidden={!showActionQueue}
          className={`mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 ${
            showActionQueue
              ? 'max-h-[560px] translate-y-0 border-emerald-200 opacity-100'
              : 'max-h-0 -translate-y-2 border-transparent opacity-0'
          }`}
        >
          <div className="px-4 py-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-extrabold text-emerald-950">
                Pedidos aguardando ação
              </p>
              <button
                type="button"
                onClick={() => setShowActionQueue(false)}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50"
              >
                Fechar
              </button>
            </div>
            {actionOrders.length === 0 ? (
              <p className="mt-2 text-xs font-semibold text-emerald-800">
                Nenhum pedido pendente de ação neste canal.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {actionOrders.slice(0, 6).map((o) => {
                  const ref = `#${displayNumberById.get(o.id) ?? '—'}`
                  const age = orderAgeMinutes(o.created_at)
                  return (
                    <div
                      key={o.id}
                      className="min-h-[86px] rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs shadow-sm"
                    >
                      <p className="font-black text-slate-950">Pedido {ref}</p>
                      <p className="font-semibold text-slate-500">
                        {waitLabel(age)} aguardando
                      </p>
                      <button
                        type="button"
                        onClick={() => scrollToOrder(o.id)}
                        className="mt-2 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-black text-white transition hover:bg-emerald-700"
                      >
                        Ir para pedido
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
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

      {channelCounts.all === 0 ? (
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
      ) : counts.total === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-8 py-14 text-center text-sm text-slate-600 shadow-sm">
          Nenhuma comanda em{' '}
          <strong>
            {channelFilter === 'delivery' ? 'Delivery' : 'Presencial'}
          </strong>
          .
        </div>
      ) : (
        <div
          className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3"
          data-view="orders-kanban"
        >
          {kanbanColumns.map((column) => (
            <KanbanColumn
              key={column.id}
              title={column.label}
              status={column.id}
              orders={column.orders}
              color={STATUS_TONE[column.id]}
              renderOrder={(order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  orderRef={`#${displayNumberById.get(order.id) ?? '—'}`}
                  plan={plan}
                  deliveryPipelineEnabled={deliveryPipelineEnabled}
                  channelFilter={channelFilter}
                  busy={busyId === order.id}
                  thermalBusy={thermalBusyId === order.id}
                  showManualComandaPrint={showManualComandaPrint}
                  orderHasDeliveryRegistration={orderIdsComEntrega.has(order.id)}
                  fiscalActive={fiscalActive}
                  nfceBusy={nfceBusyId === order.id}
                  nfceState={nfceStateById.get(order.id)}
                  salonMapTables={salonTables}
                  onAction={{
                    patchStatus: (orderId, status) =>
                      void patchStatus(orderId, status),
                    reject: confirmReject,
                    dispatch: onDispatchForDelivery,
                    markDelivered: onMarkDelivered,
                    print: (o) => void printOrderDefault(o),
                    late: (o) => setDeliveryModal({ mode: 'late', order: o }),
                    emitNfce: (o) => void emitNfce(o),
                    cancelNfce: (o) => void cancelNfce(o),
                  }}
                />
              )}
            />
          ))}
        </div>
      )}

      {channelCounts.all > 0 ? (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-extrabold text-slate-950">Histórico</p>
              <p className="text-xs font-semibold text-slate-500">
                {historyOrders.length} pedido{historyOrders.length === 1 ? '' : 's'} entregue
                {historyOrders.length === 1 ? '' : 's'} neste canal
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
            >
              {showHistory ? 'Ocultar histórico' : 'Ver histórico'}
            </button>
          </div>
          {showHistory ? (
            historyOrders.length === 0 ? (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-4 text-center text-xs font-semibold text-slate-500">
                Nenhum pedido entregue neste canal.
              </p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {historyOrders.slice(0, 12).map((o) => {
                  const ref = `#${displayNumberById.get(o.id) ?? '—'}`
                  const location = orderDisplayLocation(o)
                  return (
                    <div
                      key={o.id}
                      className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-black text-slate-950">Pedido {ref}</p>
                        <p className="font-black tabular-nums text-slate-950">
                          {money.format(Number(o.total) || 0)}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-600">
                        {location.title} · {relativeTimePt(o.created_at)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )
          ) : null}
        </section>
      ) : null}

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
                  : deliveryModal.mode === 'dispatch'
                    ? `Sair para entrega — ${ref}`
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
                          <option value="__sem_entregador__">
                            Sem entregador (iFood, Uber Eats, etc.)
                          </option>
                          <option value="__avulso__">+ Entregador avulso (nome livre)</option>
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
                      ) : delSel === '__sem_entregador__' ? (
                        <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-950">
                          O pedido vai para <strong>A caminho</strong> sem entregador vinculado —
                          use quando a entrega for feita por app externo ou motoboy próprio não
                          cadastrado.
                        </p>
                      ) : null}

                      {deliveryModal.mode !== 'dispatch' ? (
                      <>
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
                      </>
                      ) : (
                        <p className="mt-4 rounded-xl border border-[#e8ecf1] bg-[#f8fafc] px-3 py-2.5 text-xs text-[#64748b]">
                          Escolhe um entregador cadastrado, um avulso ou{' '}
                          <strong>sem entregador</strong> para apps externos. Com entregador
                          cadastrado, o pedido aparece em{' '}
                          <strong>Entregadores → Na rua</strong>.
                        </p>
                      )}

                      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          disabled={delSubmitting}
                          onClick={() => setDeliveryModal(null)}
                          className="rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold text-[#374151] disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        {deliveryModal.mode === 'dispatch' ? (
                          <button
                            type="button"
                            disabled={delSubmitting}
                            onClick={() => void submitDispatchModal()}
                            className="rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                          >
                            {delSubmitting ? 'A despachar…' : 'Sair para entrega'}
                          </button>
                        ) : deliveryModal.mode === 'on_deliver' ? (
                          <button
                            type="button"
                            disabled={delSubmitting}
                            onClick={() => void submitDeliveryModal(true)}
                            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 disabled:opacity-50"
                          >
                            Pular por agora
                          </button>
                        ) : null}
                        {deliveryModal.mode !== 'dispatch' ? (
                        <button
                          type="button"
                          disabled={delSubmitting}
                          onClick={() => void submitDeliveryModal(false)}
                          className="rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                        >
                          {delSubmitting ? 'A guardar…' : 'Confirmar entrega'}
                        </button>
                        ) : null}
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
