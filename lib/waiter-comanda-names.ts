import { comandaDisplayName } from '@/lib/order-payments'

export function normalizeComandaName(value: string | null | undefined): string {
  return comandaDisplayName(value, '').trim().toLowerCase()
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
