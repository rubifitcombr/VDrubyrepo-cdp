export type ProductPriceChannel = 'delivery' | 'dine_in' | 'base'

export type ProductPricingFields = {
  price?: number | string | null
  promotional_price?: number | string | null
  promotion_active?: boolean | null
  delivery_price?: number | string | null
  dine_in_price?: number | string | null
  delivery_promotional_price?: number | string | null
  delivery_promotion_active?: boolean | null
  dine_in_promotional_price?: number | string | null
  dine_in_promotion_active?: boolean | null
}

function parseNum(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function legacyBasePrice(p: ProductPricingFields): number {
  const n = parseNum(p.price)
  return n != null && n >= 0 ? n : 0
}

/** Preço de tabela do canal (sem promoção). */
export function baseProductPriceForChannel(
  p: ProductPricingFields,
  channel: ProductPriceChannel = 'base'
): number {
  if (channel === 'delivery') {
    const d = parseNum(p.delivery_price)
    if (d != null && d >= 0) return d
    return legacyBasePrice(p)
  }
  if (channel === 'dine_in') {
    const d = parseNum(p.dine_in_price)
    if (d != null && d >= 0) return d
    return legacyBasePrice(p)
  }
  return legacyBasePrice(p)
}

function channelPromoFields(
  p: ProductPricingFields,
  channel: ProductPriceChannel
): { active: boolean; promo: number | null; base: number } {
  const base = baseProductPriceForChannel(p, channel)
  if (channel === 'delivery') {
    const channelActive = p.delivery_promotion_active === true
    const channelPromo = parseNum(p.delivery_promotional_price)
    if (channelActive && channelPromo != null && channelPromo > 0) {
      return { active: true, promo: channelPromo, base }
    }
    if (
      p.delivery_price == null &&
      p.promotion_active &&
      parseNum(p.promotional_price) != null
    ) {
      return { active: true, promo: parseNum(p.promotional_price), base }
    }
    return { active: false, promo: null, base }
  }
  if (channel === 'dine_in') {
    const channelActive = p.dine_in_promotion_active === true
    const channelPromo = parseNum(p.dine_in_promotional_price)
    if (channelActive && channelPromo != null && channelPromo > 0) {
      return { active: true, promo: channelPromo, base }
    }
    if (
      p.dine_in_price == null &&
      p.promotion_active &&
      parseNum(p.promotional_price) != null
    ) {
      return { active: true, promo: parseNum(p.promotional_price), base }
    }
    return { active: false, promo: null, base }
  }
  const legacyPromo = parseNum(p.promotional_price)
  return {
    active: !!p.promotion_active,
    promo: legacyPromo,
    base,
  }
}

/** Preço efetivo para carrinho / checkout (promoção ativa no canal). */
export function effectiveProductPrice(
  p: ProductPricingFields,
  channel: ProductPriceChannel = 'base'
): number {
  const { active, promo, base } = channelPromoFields(p, channel)
  if (!active || promo == null || promo <= 0) return base
  return Math.min(base, promo)
}

export function hasActivePromotion(
  p: ProductPricingFields,
  channel: ProductPriceChannel = 'base'
): boolean {
  const { active, promo, base } = channelPromoFields(p, channel)
  return active && promo != null && promo > 0 && promo < base
}

/** Preço de tabela antes da promo (para riscar na vitrine). */
export function listPriceBeforePromotion(
  p: ProductPricingFields,
  channel: ProductPriceChannel = 'base'
): number | null {
  if (!hasActivePromotion(p, channel)) return null
  return baseProductPriceForChannel(p, channel)
}
