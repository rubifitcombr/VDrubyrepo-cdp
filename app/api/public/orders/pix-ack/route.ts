import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import { fetchStoreByPublicSlug } from '@/lib/store-public-slug.server'

function toText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** Cliente indica que já pagou o PIX (sem validação bancária). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
    }

    const raw = body as Record<string, unknown>
    const slug = toText(raw.slug)
    const orderId = toText(raw.orderId)

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

    const method = String(order.payment_method ?? '').toLowerCase()
    if (method !== 'pix') {
      return NextResponse.json(
        { error: 'Este pedido não usa PIX.' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    const patch: Record<string, unknown> = {
      payment_status: 'customer_reported',
      pix_paid_at: now,
    }

    const { error: updateErr } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', orderId)
      .eq('store_id', storeId)

    if (updateErr) {
      if (
        updateErr.message?.includes('payment_status') ||
        updateErr.message?.includes('pix_paid_at')
      ) {
        return NextResponse.json({
          ok: true,
          warning: 'Colunas PIX do pedido ainda não existem no banco.',
        })
      }
      return NextResponse.json(
        { error: updateErr.message || 'Erro ao actualizar pedido.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
