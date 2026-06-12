import type { StoreOrderRow } from '@/lib/store-order'
import type { OrderTicketVariant } from '@/lib/print'

function deliveryFeePositive(
  fee: number | string | null | undefined
): boolean {
  if (fee == null) return false
  if (typeof fee === 'number' && Number.isFinite(fee)) return fee > 0
  const n = Number.parseFloat(String(fee).replace(',', '.'))
  return Number.isFinite(n) && n > 0
}

/** Pedido pelo link com envio: mantém variante delivery e segunda via do entregador. */
export function slugOrderUsesFullDeliveryTicket(
  order: Pick<StoreOrderRow, 'delivery_address' | 'delivery_fee'> | null | undefined
): boolean {
  if (!order) return false
  if (!String(order.delivery_address ?? '').trim()) return false
  return deliveryFeePositive(order.delivery_fee)
}

export function orderTicketVariantFromSource(
  source: string | null | undefined,
  order?: Pick<StoreOrderRow, 'delivery_address' | 'delivery_fee'> | null
): OrderTicketVariant {
  const s = (source ?? '').trim().toLowerCase()
  if (s === 'pdv' || s === 'waiter' || s === 'site_pickup' || s === 'autoatendimento') {
    return 'balcao'
  }
  if (s === 'site_live' || s === 'site_start' || s === 'menu_link') {
    if (slugOrderUsesFullDeliveryTicket(order)) return 'delivery'
    return 'balcao'
  }
  return 'delivery'
}
