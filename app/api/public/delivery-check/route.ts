import { NextRequest, NextResponse } from 'next/server'
import { createPublicAnonClient } from '@/lib/supabase/public.server'
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitResponse,
} from '@/lib/rate-limit.server'
import { fetchStoreByPublicSlug } from '@/lib/store-public-slug.server'
import {
  evaluateDeliveryForCustomer,
  type StoreDeliveryConfig,
} from '@/lib/delivery-zone.server'

function toText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req)
    const rl = checkRateLimit(`delivery-check:${ip}`, 40, 60_000)
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec)

    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
    }
    const raw = body as Record<string, unknown>
    const slug = toText(raw.slug)
    const addressLine = toText(raw.addressLine).slice(0, 500)
    const subtotal = Number(raw.subtotal)

    if (!slug) {
      return NextResponse.json({ error: 'Slug em falta.' }, { status: 400 })
    }
    if (!addressLine) {
      return NextResponse.json(
        { error: 'Indica o endereço para simular.' },
        { status: 400 }
      )
    }

    const supabase = createPublicAnonClient()
    const { data: store, error } = await fetchStoreByPublicSlug(
      supabase,
      slug,
      'name, address, delivery_fee, delivery_free_above, delivery_max_km, store_geo_lat, store_geo_lng'
    )

    if (error || !store) {
      return NextResponse.json(
        { error: 'Loja não encontrada.' },
        { status: 404 }
      )
    }

    const storeRow = store as StoreDeliveryConfig
    const safeSubtotal =
      Number.isFinite(subtotal) && subtotal >= 0 ? subtotal : 0

    const zone = await evaluateDeliveryForCustomer(
      storeRow,
      addressLine,
      safeSubtotal
    )

    return NextResponse.json({
      allowed: zone.allowed,
      distanceKm: zone.distanceKm,
      deliveryCharge: zone.deliveryCharge,
      reason: zone.reason ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
