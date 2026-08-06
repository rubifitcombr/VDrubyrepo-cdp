import { NextRequest, NextResponse } from 'next/server'
import { createPublicAnonClient } from '@/lib/supabase/public.server'
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitResponse,
} from '@/lib/rate-limit.server'
import { fetchPublicStoreForSlugPage } from '@/lib/store-public-slug.server'
import { validateCheckoutCoupon } from '@/services/promo-coupon.server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req)
    const rl = checkRateLimit(ip, 'coupon-validate', 30, 60_000)
    if (!rl.ok) {
      return rateLimitResponse(
        rl.retryAfterSec,
        rl.guard?.message,
        rl.guard?.status === 403 ? 403 : 429
      )
    }

    const body = (await req.json()) as Record<string, unknown>
    const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
    const code = typeof body.couponCode === 'string' ? body.couponCode : ''
    const fulfillment =
      body.fulfillment === 'delivery' ||
      body.fulfillment === 'pickup' ||
      body.fulfillment === 'dine_in'
        ? body.fulfillment
        : 'delivery'
    const orderSubtotal = Math.max(0, Number(body.orderSubtotal) || 0)

    if (!slug) {
      return NextResponse.json({ error: 'Loja inválida.' }, { status: 400 })
    }

    const { data: store } = await fetchPublicStoreForSlugPage(slug, 'id')
    if (!store) {
      return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })
    }

    const storeId = String((store as { id: string }).id)
    const db = tryCreateServiceRoleClient() ?? createPublicAnonClient()

    const result = await validateCheckoutCoupon(db, {
      storeId,
      code,
      orderSubtotal,
      fulfillment,
      customerPhone:
        typeof body.customerPhone === 'string' ? body.customerPhone : null,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      ok: true,
      code: result.code,
      discountBrl: result.discountBrl,
      freeShipping: result.freeShipping,
      label: result.label,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
