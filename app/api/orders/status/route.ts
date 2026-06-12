import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { maybeSendOrderOutForDeliveryWhatsApp } from '@/services/order-delivery-whatsapp.server'

export const dynamic = 'force-dynamic'

const STATUS_SET = new Set([
  'pending',
  'preparing',
  'ready',
  'confirmed',
  'delivered',
  'cancelled',
])

/** Transições permitidas (painel Pedidos / KDS). */
const ALLOWED_NEXT: Record<string, Set<string>> = {
  pending: new Set(['preparing', 'cancelled']),
  preparing: new Set(['ready', 'cancelled']),
  ready: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['delivered', 'cancelled']),
  delivered: new Set(),
  cancelled: new Set(),
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { orderId?: string; status?: string }
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
    const newStatus =
      typeof body.status === 'string' ? body.status.trim() : ''

    if (!orderId || !newStatus || !STATUS_SET.has(newStatus)) {
      return NextResponse.json(
        { error: 'Pedido ou estado inválido.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    }

    const gate = await requireLojistaAtivoApi(user.id)
    if (!gate.ok) return gate.response

    const deny = gateMerchantMenuKey(
      gate.ctx.store,
      user.email ?? undefined,
      'pedidos'
    )
    if (deny) return deny

    const storeId = gate.ctx.storeId

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, store_id, status, customer_phone, customer_name, source')
      .eq('id', orderId)
      .eq('store_id', storeId)
      .maybeSingle()

    if (fetchErr || !order) {
      return NextResponse.json(
        { error: fetchErr?.message || 'Pedido não encontrado.' },
        { status: 404 }
      )
    }

    const current = typeof order.status === 'string' ? order.status : ''
    if (current === newStatus) {
      return NextResponse.json({ ok: true, deliveryNotified: false })
    }

    const src = String((order as { source?: string }).source ?? '').trim().toLowerCase()
    const waiterToDelivered =
      (src === 'waiter' || src === 'autoatendimento') &&
      newStatus === 'delivered' &&
      ['pending', 'preparing', 'ready', 'confirmed'].includes(current)

    const presencialReadyToDelivered =
      (src === 'pdv' || src === 'waiter' || src === 'autoatendimento') &&
      current === 'ready' &&
      newStatus === 'delivered'

    const allowed = waiterToDelivered
      ? new Set(['delivered'])
      : presencialReadyToDelivered
        ? new Set(['delivered'])
        : ALLOWED_NEXT[current]
    if (!allowed || !allowed.has(newStatus)) {
      return NextResponse.json(
        { error: 'Transição de estado não permitida.' },
        { status: 409 }
      )
    }

    const { error: upErr } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
      .eq('store_id', storeId)

    if (upErr) {
      return NextResponse.json(
        { error: upErr.message || 'Não foi possível atualizar o pedido.' },
        { status: 500 }
      )
    }

    let deliveryNotified = false
    const wasReadyToConfirmed =
      current === 'ready' && newStatus === 'confirmed'

    if (wasReadyToConfirmed) {
      deliveryNotified = await maybeSendOrderOutForDeliveryWhatsApp(supabase, {
        store: gate.ctx.store,
        storeId,
        orderId,
        customerPhone: order.customer_phone as string | null | undefined,
        customerName: order.customer_name as string | null | undefined,
      })
    }

    return NextResponse.json({ ok: true, deliveryNotified })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
