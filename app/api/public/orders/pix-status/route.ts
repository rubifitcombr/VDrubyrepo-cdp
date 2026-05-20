import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import { fetchStoreByPublicSlug } from '@/lib/store-public-slug.server'
import { pixPaymentStatusIsConfirmed } from '@/lib/store-order'

function toText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export async function GET(req: NextRequest) {
  try {
    const slug = toText(req.nextUrl.searchParams.get('slug'))
    const orderId = toText(req.nextUrl.searchParams.get('orderId'))

    if (!slug || !orderId) {
      return NextResponse.json(
        { error: 'Slug e pedido em falta.' },
        { status: 400 }
      )
    }

    const supabase =
      tryCreateServiceRoleClient() ?? (await createClient())
    const { data: store, error: storeErr } = await fetchStoreByPublicSlug(
      supabase,
      slug,
      'id'
    )

    if (storeErr || !store) {
      return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })
    }

    const storeId = String((store as { id: string }).id)
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, payment_method, payment_status')
      .eq('id', orderId)
      .eq('store_id', storeId)
      .maybeSingle()

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
    }

    const method = String(order.payment_method ?? '').trim().toLowerCase()
    if (method !== 'pix') {
      return NextResponse.json(
        { error: 'Este pedido não usa PIX.' },
        { status: 400 }
      )
    }

    const paymentStatus =
      typeof order.payment_status === 'string' ? order.payment_status : null

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
