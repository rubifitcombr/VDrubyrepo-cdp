/** Preço efetivo para carrinho / WhatsApp (promoção ativa). */
export function effectiveProductPrice(p: {
  price: number | string | null
  promotional_price?: number | string | null
  promotion_active?: boolean | null
}): number {
  const base = Number(p.price)
  if (Number.isNaN(base)) return 0
  if (!p.promotion_active) return base
  const promo = Number(p.promotional_price)
  if (Number.isNaN(promo) || promo <= 0) return base
  return Math.min(base, promo)
}

export function hasActivePromotion(p: {
  price: number | string | null
  promotional_price?: number | string | null
  promotion_active?: boolean | null
}): boolean {
  const base = Number(p.price)
  const promo = Number(p.promotional_price)
  return (
    !!p.promotion_active &&
    !Number.isNaN(promo) &&
    promo > 0 &&
    promo < base
  )
}
