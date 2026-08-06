import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computePromoPrice,
  splitPromoDescription,
  type GuidedPromoMetaV2,
} from '@/lib/promo-guided'

export type CouponValidationResult =
  | {
      ok: true
      promotionId: string
      code: string
      discountBrl: number
      freeShipping: boolean
      label: string
    }
  | { ok: false; error: string; status: number }

function spNowMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

function parseHm(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null
  const [h, m] = raw.split(':').map((x) => Number(x))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

function isPromoScheduleActive(meta: GuidedPromoMetaV2): boolean {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date())

  if (meta.validFrom && today < meta.validFrom) return false
  if (meta.validUntil && today > meta.validUntil) return false

  const start = parseHm(meta.timeStart)
  const end = parseHm(meta.timeEnd)
  if (start != null && end != null) {
    const now = spNowMinutes()
    if (start <= end) {
      if (now < start || now > end) return false
    } else if (now < start && now > end) {
      return false
    }
  }

  return true
}

function couponDiscountBrl(
  meta: GuidedPromoMetaV2,
  orderSubtotal: number,
  promotionalPrice: number | null
): number | null {
  if (meta.kind === 'free_shipping') return 0

  if (meta.discountMode === 'final' && promotionalPrice != null && promotionalPrice > 0) {
    const discount = Math.round((orderSubtotal - promotionalPrice) * 100) / 100
    return Math.max(0, Math.min(orderSubtotal, discount))
  }

  const reference = meta.referenceTotal > 0 ? meta.referenceTotal : orderSubtotal
  const computed = computePromoPrice(
    reference,
    meta.discountMode,
    meta.discountMode === 'final' && promotionalPrice != null ? String(promotionalPrice) : '',
    meta.discountPercent != null ? String(meta.discountPercent) : '',
    meta.discountFixed != null ? String(meta.discountFixed) : ''
  )

  if (meta.discountMode === 'percent' && meta.discountPercent != null) {
    const pct = Number(meta.discountPercent)
    if (Number.isFinite(pct) && pct > 0) {
      return Math.round(orderSubtotal * (pct / 100) * 100) / 100
    }
  }
  if (meta.discountMode === 'fixed' && meta.discountFixed != null) {
    const fix = Number(meta.discountFixed)
    if (Number.isFinite(fix) && fix > 0) {
      return Math.min(orderSubtotal, Math.round(fix * 100) / 100)
    }
  }

  if (computed.promo != null && reference > 0 && meta.discountMode === 'final') {
    const discount = Math.round((orderSubtotal - computed.promo) * 100) / 100
    return Math.max(0, Math.min(orderSubtotal, discount))
  }

  return null
}

export async function validateCheckoutCoupon(
  db: SupabaseClient,
  input: {
    storeId: string
    code: string
    orderSubtotal: number
    fulfillment: 'delivery' | 'pickup' | 'dine_in'
    customerPhone?: string | null
  }
): Promise<CouponValidationResult> {
  const code = input.code.trim().toUpperCase()
  if (!code || code.length > 32) {
    return { ok: false, error: 'Código de cupom inválido.', status: 400 }
  }

  if (input.orderSubtotal <= 0) {
    return { ok: false, error: 'Adiciona itens ao carrinho antes do cupom.', status: 400 }
  }

  const { data: rows, error } = await db
    .from('store_promotions')
    .select('id, name, description, valid_until, promotional_price, active')
    .eq('store_id', input.storeId)
    .eq('active', true)

  if (error) {
    return { ok: false, error: 'Não foi possível validar o cupom.', status: 500 }
  }

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date())

  let match: {
    id: string
    name: string
    meta: GuidedPromoMetaV2
    promotionalPrice: number | null
  } | null = null

  for (const row of rows ?? []) {
    const r = row as Record<string, unknown>
    const validUntil = r.valid_until != null ? String(r.valid_until).slice(0, 10) : null
    if (validUntil && today > validUntil) continue

    const { meta } = splitPromoDescription(
      typeof r.description === 'string' ? r.description : null
    )
    if (!meta || (meta.kind !== 'coupon' && meta.kind !== 'free_shipping')) continue
    if (meta.kind === 'free_shipping' && input.fulfillment !== 'delivery') continue

    const promoCode = String(meta.couponCode ?? '').trim().toUpperCase()
    if (!promoCode || promoCode !== code) continue
    if (!isPromoScheduleActive(meta)) continue

    match = {
      id: String(r.id),
      name: String(r.name ?? 'Cupom'),
      meta,
      promotionalPrice:
        r.promotional_price != null ? Number(r.promotional_price) : null,
    }
    break
  }

  if (!match) {
    return { ok: false, error: 'Cupom inválido ou expirado.', status: 404 }
  }

  if (match.meta.kind === 'free_shipping') {
    return {
      ok: true,
      promotionId: match.id,
      code,
      discountBrl: 0,
      freeShipping: true,
      label: match.name,
    }
  }

  const discount =
    couponDiscountBrl(match.meta, input.orderSubtotal, match.promotionalPrice)

  if (discount == null || discount <= 0) {
    return {
      ok: false,
      error: 'Este cupom não se aplica ao valor actual do carrinho.',
      status: 400,
    }
  }

  return {
    ok: true,
    promotionId: match.id,
    code,
    discountBrl: discount,
    freeShipping: false,
    label: match.name,
  }
}

export async function recordCouponRedemption(
  db: SupabaseClient,
  input: {
    storeId: string
    promotionId: string
    couponCode: string
    orderId: string
    customerPhone?: string | null
  }
): Promise<void> {
  const { error } = await db.from('store_promo_redemptions').insert({
    store_id: input.storeId,
    promotion_id: input.promotionId,
    coupon_code: input.couponCode,
    order_id: input.orderId,
    customer_phone: input.customerPhone?.replace(/\D/g, '') || null,
  })
  if (error && !/does not exist|42P01/i.test(error.message ?? '')) {
    console.warn('[promo coupon] redemption insert:', error.message)
  }
}
