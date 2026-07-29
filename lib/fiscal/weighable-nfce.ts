import { roundWeightKg } from '@/lib/scale/price'

export type FiscalOrderItemLike = {
  quantity?: unknown
  unit_price?: unknown
  price?: unknown
  unit_type?: unknown
  weight_kg?: unknown
  price_per_kg_snapshot?: unknown
  products?: {
    unidade?: string | null
    sold_by_weight?: boolean | null
  } | null
}

export function isWeightFiscalOrderItem(item: FiscalOrderItemLike): boolean {
  return item.unit_type === 'weight'
}

/** Quantidade NFC-e: inteiro para UN; até 4 casas para KG. */
export function nfceQuantityFromOrderItem(item: FiscalOrderItemLike): number {
  if (isWeightFiscalOrderItem(item)) {
    const w = roundWeightKg(Number(item.weight_kg ?? item.quantity) || 0)
    return w > 0 ? w : 0
  }
  const q = Math.floor(Number(item.quantity) || 0)
  return q >= 1 ? q : 0
}

/** Preço unitário NFC-e: R$/kg para pesáveis; preço da unidade caso contrário. */
export function nfceUnitPriceFromOrderItem(item: FiscalOrderItemLike): number {
  if (isWeightFiscalOrderItem(item)) {
    const perKg = Number(item.price_per_kg_snapshot ?? item.unit_price ?? item.price)
    return Number.isFinite(perKg) && perKg > 0 ? perKg : 0
  }
  const unit = Number(item.unit_price ?? item.price)
  return Number.isFinite(unit) && unit > 0 ? unit : 0
}

export function nfceUnidadeFromOrderItem(item: FiscalOrderItemLike): string {
  if (isWeightFiscalOrderItem(item)) {
    const raw = item.products?.unidade?.trim().toUpperCase()
    if (raw === 'KG' || raw === 'KGM') return 'KG'
    return 'KG'
  }
  const u = item.products?.unidade?.trim()
  return u || 'UN'
}

export function nfceLineTotalFromOrderItem(item: FiscalOrderItemLike): number {
  const q = nfceQuantityFromOrderItem(item)
  const u = nfceUnitPriceFromOrderItem(item)
  return Number((q * u).toFixed(2))
}
