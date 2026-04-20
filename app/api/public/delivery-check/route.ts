import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
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
    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
    }
    const raw = body as Record<string, unknown>
    const slug = toText(raw.slug)
    const addressLine = toText(raw.addressLine)
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

    const supabase =
      tryCreateServiceRoleClient() ?? (await createClient())
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

    const sub =
      Number.isFinite(subtotal) && subtotal >= 0 ? subtotal : 0

    const result = await evaluateDeliveryForCustomer(
      storeRow,
      addressLine,
      sub
    )

    return NextResponse.json({
      ok: true,
      allowed: result.allowed,
      distanceKm: result.distanceKm,
      deliveryCharge: result.deliveryCharge,
      reason: result.reason ?? null,
      freeAbove:
        storeRow.delivery_free_above != null
          ? Number(storeRow.delivery_free_above)
          : null,
      maxKm:
        storeRow.delivery_max_km != null ? Number(storeRow.delivery_max_km) : null,
      baseFee:
        storeRow.delivery_fee != null ? Number(storeRow.delivery_fee) : null,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro inesperado.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
