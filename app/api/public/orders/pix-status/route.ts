import { NextRequest, NextResponse } from 'next/server'
import { createPublicAnonClient } from '@/lib/supabase/public.server'
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitResponse,
} from '@/lib/rate-limit.server'
import { fetchStoreByPublicSlug } from '@/lib/store-public-slug.server'
import { pixPaymentStatusIsConfirmed } from '@/lib/store-order'
import { tryAutoThermalPrint } from '@/services/thermal-print.server'

function toText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export async function GET(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req)
    const rl = checkRateLimit(`pix-status:${ip}`, 60, 60_000)
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec)

    const slug = toText(req.nextUrl.searchParams.get('slug'))
    const orderId = toText(req.nextUrl.searchParams.get('orderId'))

    if (!slug || !orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return NextResponse.json(
        { error: 'Slug e pedido em falta.' },
        { status: 400 }
      )
    }

    const supabase = createPublicAnonClient()
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      'get_public_pix_order_status',
      { p_slug: slug, p_order_id: orderId }
    )

    if (rpcErr) {
      return NextResponse.json(
        { error: rpcErr.message || 'Erro ao consultar pedido.' },
        { status: 500 }
      )
    }

    const result = (rpcData ?? {}) as {
      ok?: boolean
      error?: string
      paymentStatus?: string | null
    }

    if (!result.ok) {
      const msg = result.error || 'Pedido não encontrado.'
      const status = msg.includes('Loja não encontrada')
        ? 404
        : msg.includes('não usa PIX')
          ? 400
          : msg.includes('não encontrado')
            ? 404
            : 400
      return NextResponse.json({ error: msg }, { status })
    }

    const paymentStatus =
      typeof result.paymentStatus === 'string' ? result.paymentStatus : null

    return NextResponse.json({
      ok: true,
      confirmed: pixPaymentStatusIsConfirmed(paymentStatus),
      paymentStatus,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req)
    const rl = checkRateLimit(`pix-report:${ip}`, 20, 60_000)
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec)

    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
    }

    const raw = body as Record<string, unknown>
    const slug = toText(raw.slug)
    const orderId = toText(raw.orderId)

    if (!slug || !orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return NextResponse.json(
        { error: 'Slug e pedido em falta.' },
        { status: 400 }
      )
    }

    const supabase = createPublicAnonClient()
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      'report_customer_pix_payment',
      { p_slug: slug, p_order_id: orderId }
    )

    if (rpcErr) {
      return NextResponse.json(
        { error: rpcErr.message || 'Erro ao actualizar pedido.' },
        { status: 500 }
      )
    }

    const result = (rpcData ?? {}) as {
      ok?: boolean
      error?: string
      confirmed?: boolean
      paymentStatus?: string
      alreadyConfirmed?: boolean
    }

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || 'Não foi possível confirmar o PIX.' },
        { status: 400 }
      )
    }

    if (!result.alreadyConfirmed) {
      const { data: store } = await fetchStoreByPublicSlug(supabase, slug, 'id')
      const storeId = store ? String((store as { id: string }).id) : ''
      if (storeId) {
        void tryAutoThermalPrint({
          storeId,
          orderId,
          orderSource: 'site_live',
        })
      }
    }

    return NextResponse.json({
      ok: true,
      confirmed: true,
      paymentStatus: result.paymentStatus ?? 'customer_reported',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
