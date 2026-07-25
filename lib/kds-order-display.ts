import { comandaDisplayName } from '@/lib/order-payments'
import { isDeliveryFlowOrder } from '@/lib/order-status-transitions'
import {
  parseSectorFromNotes,
  parseTableFromOrder,
} from '@/lib/waiter-order-notes'
import type { StoreOrderRow } from '@/lib/store-order'

export const KDS_KITCHEN_STATUSES = ['pending', 'preparing', 'ready'] as const

export type KdsKitchenChannel = 'delivery' | 'mesa' | 'balcao' | 'retirada'

export type KdsChannelFilter = 'all' | 'delivery' | 'presencial'

export function isKdsKitchenQueueOrder(order: {
  status?: string | null
}): boolean {
  const status = String(order.status ?? '').trim().toLowerCase()
  return (KDS_KITCHEN_STATUSES as readonly string[]).includes(status)
}

export function kdsKitchenChannel(order: {
  source?: string | null
  notes?: string | null
  delivery_address?: string | null
}): KdsKitchenChannel {
  if (isDeliveryFlowOrder(order)) return 'delivery'
  const source = String(order.source ?? '').trim().toLowerCase()
  if (source === 'site_pickup') return 'retirada'
  if (source === 'pdv') return 'balcao'
  if (parseTableFromOrder(order)) return 'mesa'
  if (source === 'waiter' || source === 'autoatendimento') return 'mesa'
  return 'balcao'
}

export function kdsKitchenChannelLabel(channel: KdsKitchenChannel): string {
  switch (channel) {
    case 'delivery':
      return 'Delivery'
    case 'mesa':
      return 'Mesa'
    case 'balcao':
      return 'Balcão'
    case 'retirada':
      return 'Retirada'
  }
}

export function kdsKitchenFilterGroup(channel: KdsKitchenChannel): 'delivery' | 'presencial' {
  return channel === 'delivery' ? 'delivery' : 'presencial'
}

export function kdsOrderMatchesChannelFilter(
  order: StoreOrderRow,
  filter: KdsChannelFilter
): boolean {
  if (filter === 'all') return true
  return kdsKitchenFilterGroup(kdsKitchenChannel(order)) === filter
}

export function kdsOrderSubtitle(order: StoreOrderRow): string {
  const table = parseTableFromOrder(order)
  if (table) {
    const normalized = table.replace(/^mesa\s+/i, '').trim() || table
    const sector = parseSectorFromNotes(order.notes)
    const sectorLabel =
      sector && !/^sal[aã]o$/i.test(sector.trim()) ? sector.trim() : null
    const comanda = comandaDisplayName(order.customer_name, '')
    const parts = [`Mesa ${normalized}`]
    if (sectorLabel) parts.push(sectorLabel)
    if (comanda) parts.push(comanda)
    return parts.join(' · ')
  }

  if (isDeliveryFlowOrder(order)) {
    const name = order.customer_name?.trim()
    const addr = order.delivery_address?.trim()
    if (name && addr) {
      const shortAddr = addr.length > 36 ? `${addr.slice(0, 36).trim()}…` : addr
      return `${name} · ${shortAddr}`
    }
    if (addr) return addr.length > 48 ? `${addr.slice(0, 48).trim()}…` : addr
    return name || 'Entrega'
  }

  const source = String(order.source ?? '').trim().toLowerCase()
  if (source === 'site_pickup') {
    return order.customer_name?.trim() || 'Retirada no balcão'
  }
  if (source === 'pdv') {
    return order.customer_name?.trim() || 'Balcão / PDV'
  }
  return order.customer_name?.trim() || 'Presencial'
}

export function kdsChannelBadgeClass(channel: KdsKitchenChannel): string {
  switch (channel) {
    case 'delivery':
      return 'bg-sky-500/20 text-sky-200 ring-sky-400/35'
    case 'mesa':
      return 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/35'
    case 'balcao':
      return 'bg-violet-500/20 text-violet-200 ring-violet-400/35'
    case 'retirada':
      return 'bg-amber-500/20 text-amber-100 ring-amber-400/35'
  }
}
