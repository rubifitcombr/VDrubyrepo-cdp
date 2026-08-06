import { comandaDisplayName } from '@/lib/order-payments'
import type { StoreOrderRow } from '@/lib/store-order'

export function normalizeComandaName(value: string | null | undefined): string {
  return comandaDisplayName(value, '').trim().toLowerCase()
}

/** Nome legível no picker do mapa — evita várias «Comanda» iguais em pedidos QR sem nome. */
export function salonComandaPickerLabel(order: Pick<StoreOrderRow, 'id' | 'customer_name' | 'items_summary'>): string {
  const named = comandaDisplayName(order.customer_name, '')
  if (named && !isGenericComandaLabel(named)) return named
  const firstItem = String(order.items_summary ?? '')
    .split(';')
    .map((s) => s.trim())
    .find(Boolean)
  if (firstItem) {
    return firstItem.length > 42 ? `${firstItem.slice(0, 39)}…` : firstItem
  }
  return `Comanda #${order.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

/** Rótulo automático «Comanda · Mesa N» — não distingue comandas na mesma mesa. */
export function isGenericComandaLabel(value: string | null | undefined): boolean {
  const n = String(value ?? '').trim()
  return /^Comanda\s*·\s*Mesa\s+/i.test(n)
}

export function comandaNamesConflict(
  orders: { customer_name?: string | null; id?: string }[],
  candidate: string,
  excludeOrderId?: string | null
): boolean {
  const norm = normalizeComandaName(candidate)
  if (!norm) return false
  return orders.some((o) => {
    if (excludeOrderId && o.id === excludeOrderId) return false
    return normalizeComandaName(o.customer_name) === norm
  })
}
