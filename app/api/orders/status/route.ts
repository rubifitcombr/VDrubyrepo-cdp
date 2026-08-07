import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceApiRateLimit } from '@/lib/api-security.server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import {
  isOrderStatusTransitionAllowed,
  ORDER_STATUS_SET,
} from '@/lib/order-status-transitions'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { tryAutoCancelNfceForOrder, tryAutoEmitNfceForOrder } from '@/services/fiscal'
import { triggerLoyaltyEarnForDeliveredOrder, reverseLoyaltyRedeemForCancelledOrder } from '@/services/loyalty.server'
import { restoreOrderItemsStock } from '@/services/inventory.server'
import { notifyOrderWhatsAppStatusChange } from '@/services/order-whatsapp-notifications.server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const limited = enforceApiRateLimit(req, 'orders-status', 120, 60_000)
    if (limited) return limited

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    }

    const gate = await requireLojistaAtivoApi(user.id)
    if (!gate.ok) return gate.response

    const denyPedidos = gateMerchantMenuKey(
      gate.ctx.store,
      user.email ?? undefined,
      'pedidos'
    )
    const denyKds = gateMerchantMenuKey(
      gate.ctx.store,
      user.email ?? undefined,
      'kds'
    )
    if (denyPedidos && denyKds) return denyPedidos

    const body = (await req.json()) as { orderId?: string; status?: string }
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
    const newStatus =
      typeof body.status === 'string' ? body.status.trim() : ''

    if (!orderId || !newStatus || !ORDER_STATUS_SET.has(newStatus)) {
      return NextResponse.json(
        { error: 'Pedido ou estado inválido.' },
        { status: 400 }
      )
    }

    const storeId = gate.ctx.storeId

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select(
        'id, store_id, status, customer_phone, customer_name, source, delivery_address, notes, total, created_at, entregador_nome, entrega_prazo_minutos'
      )
      .eq('id', orderId)
      .eq('store_id', storeId)
      .maybeSingle()

    if (fetchErr || !order) {
      const msg = fetchErr?.message ?? ''
      if (/column|does not exist|42P01/i.test(msg)) {
        return NextResponse.json(
          {
            error:
              'Schema de pedidos incompleto para o KDS. Aplica supabase/migrations/20260725190006_kds_schema.sql no Supabase.',
          },
          { status: 503 }
        )
      }
      return NextResponse.json(
        { error: msg || 'Pedido não encontrado.' },
        { status: 404 }
      )
    }

    const current = typeof order.status === 'string' ? order.status : ''
    if (current === newStatus) {
      return NextResponse.json({ ok: true })
    }

    if (
      !isOrderStatusTransitionAllowed(
        current,
        newStatus,
        order as {
          source?: string | null
          delivery_address?: string | null
          notes?: string | null
        },
        gate.ctx.store
      )
    ) {
      return NextResponse.json(
        { error: 'Transição de estado não permitida.' },
        { status: 409 }
      )
    }

    const { error: upErr, data: updatedRows } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
      .eq('store_id', storeId)
      .eq('status', current)
      .select('id')

    if (upErr) {
      const msg = upErr.message ?? ''
      if (/column|does not exist|42P01/i.test(msg)) {
        return NextResponse.json(
          {
            error:
              'Schema de pedidos incompleto para o KDS. Aplica supabase/migrations/20260725190006_kds_schema.sql no Supabase.',
          },
          { status: 503 }
        )
      }
      return NextResponse.json(
        { error: msg || 'Não foi possível atualizar o pedido.' },
        { status: 500 }
      )
    }

    if (!updatedRows?.length) {
      return NextResponse.json(
        { error: 'O estado do pedido mudou noutro painel. Actualiza e tenta de novo.' },
        { status: 409 }
      )
    }

    const notifyOrder = {
      id: orderId,
      customer_phone: order.customer_phone as string | null,
      customer_name: order.customer_name as string | null,
      delivery_address: order.delivery_address as string | null,
      source: order.source as string | null,
      entregador_nome: (order as { entregador_nome?: string | null }).entregador_nome ?? null,
      entrega_prazo_minutos:
        (order as { entrega_prazo_minutos?: number | null }).entrega_prazo_minutos ?? null,
    }

    void notifyOrderWhatsAppStatusChange(
      supabase,
      storeId,
      notifyOrder,
      current,
      newStatus
    ).catch((e) => console.warn('[order whatsapp notify]', e))

    // Pedido já cancelado: tenta NFC-e sem bloquear a recusa.
    if (newStatus === 'cancelled') {
      const stockRestore = await restoreOrderItemsStock(supabase, storeId, orderId)
      if (!stockRestore.ok) {
        console.warn('[orders/status] stock restore:', stockRestore.error)
      }
      void reverseLoyaltyRedeemForCancelledOrder(supabase, storeId, orderId).catch((e) =>
        console.warn('[loyalty redeem reverse]', e)
      )
      const fiscal = await tryAutoCancelNfceForOrder(orderId)
      return NextResponse.json({ ok: true, fiscal })
    }

    // Pedido entregue: tenta emitir NFC-e (delivery/manual) sem bloquear.
    if (newStatus === 'delivered') {
      const fiscal = await tryAutoEmitNfceForOrder(orderId)
      void triggerLoyaltyEarnForDeliveredOrder(supabase, storeId, orderId).catch((e) =>
        console.warn('[loyalty earn]', e)
      )
      return NextResponse.json({ ok: true, fiscal })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
