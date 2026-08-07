import { NextRequest, NextResponse } from 'next/server'
import { createPublicAnonClient } from '@/lib/supabase/public.server'
import { createPublicCheckoutDbClient } from '@/lib/supabase/public-checkout-db.server'
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitResponse,
} from '@/lib/rate-limit.server'
import { fetchPublicStoreForSlugPage } from '@/lib/store-public-slug.server'
import { effectiveStorePlan } from '@/lib/effective-plan.server'
import { readStorePlano } from '@/lib/store-columns'
import { hasFeature } from '@/lib/plan'
import {
  getCustomerLoyaltyBalance,
  getOrCreateLoyaltyConfig,
  normalizePhoneE164,
  toPublicLoyaltyProgram,
} from '@/services/loyalty.server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req)
    const rl = checkRateLimit(ip, 'loyalty-balance', 30, 60_000)
    if (!rl.ok) {
      return rateLimitResponse(
        rl.retryAfterSec,
        rl.guard?.message,
        rl.guard?.status === 403 ? 403 : 429
      )
    }

    const slug = req.nextUrl.searchParams.get('slug')?.trim() || ''
    const phoneRaw = req.nextUrl.searchParams.get('phone')?.trim() || ''
    const orderTotal = Number(req.nextUrl.searchParams.get('orderTotal') || 0)
    const phone = normalizePhoneE164(phoneRaw)

    if (!slug) {
      return NextResponse.json({ error: 'Slug em falta.' }, { status: 400 })
    }
    if (phone.length < 10) {
      return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 })
    }

    const supabase = createPublicAnonClient()
    const { data: store, error: storeErr } = await fetchPublicStoreForSlugPage(
      slug,
      'id, plan, plano'
    )

    if (storeErr || !store) {
      return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })
    }

    const plan = effectiveStorePlan(readStorePlano(store as Record<string, unknown>))
    if (!hasFeature(plan, 'loyalty')) {
      return NextResponse.json({ program: null, balance: null })
    }

    const db = createPublicCheckoutDbClient(supabase)
    const storeId = String((store as { id: string }).id)
    const config = await getOrCreateLoyaltyConfig(db, storeId)

    if (!config.enabled) {
      return NextResponse.json({
        program: toPublicLoyaltyProgram(config),
        balance: null,
      })
    }

    const balance = await getCustomerLoyaltyBalance(
      db,
      storeId,
      phone,
      Number.isFinite(orderTotal) && orderTotal > 0 ? orderTotal : 0
    )

    return NextResponse.json({
      program: toPublicLoyaltyProgram(config),
      balance,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
