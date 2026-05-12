import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { readStorePlano } from '@/lib/store-columns'
import {
  isDeliveryPipelineEnabled,
  parseOperationModeFromStore,
} from '@/lib/merchant-operation-mode'
import { hasOrderPipelineAutomations, parsePlan } from '@/lib/plan'
import { parseAutomationsFromStore } from '@/lib/store-automations'
import { maybeSendOrderAcceptedWhatsApp } from '@/services/order-accepted-whatsapp.server'
import {
  sendWhatsAppMessage,
  shouldSkipAutoReply,
} from '@/services/whatsapp-sender.server'

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

function digitsPhoneOk(phone: string | null | undefined): boolean {
  const d = phone?.replace(/\D/g, '') ?? ''
  return d.length >= 10
}

function buildOutForDeliveryMessage(
  customerName: string | null,
  orderRef: string
): string {
  const first = customerName?.trim().split(/\s+/)[0]
  const greet = first ? `Olá ${first}! ` : 'Olá! '
  return `${greet}O teu pedido ${orderRef} já saiu para entrega e está a caminho. Obrigado pela preferência!`
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
      src === 'waiter' &&
      newStatus === 'delivered' &&
      ['pending', 'preparing', 'ready', 'confirmed'].includes(current)

    const deliveryPipe = isDeliveryPipelineEnabled(
      parseOperationModeFromStore(gate.ctx.store)
    )
    const presencialReadyToDelivered =
      !deliveryPipe &&
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

    const storePlan = parsePlan(readStorePlano(gate.ctx.store))

    const wasPendingToPreparing =
      current === 'pending' && newStatus === 'preparing'
    if (wasPendingToPreparing && hasOrderPipelineAutomations(storePlan)) {
      await maybeSendOrderAcceptedWhatsApp(supabase, {
        store: gate.ctx.store,
        storeId,
        orderId,
        customerPhone: order.customer_phone as string | null | undefined,
        customerName: order.customer_name as string | null | undefined,
      })
    }

    let deliveryNotified = false
    const wasReadyToConfirmed =
      current === 'ready' && newStatus === 'confirmed'

    if (
      wasReadyToConfirmed &&
      hasOrderPipelineAutomations(storePlan)
    ) {
      const automations = parseAutomationsFromStore(gate.ctx.store)
      if (
        automations.auto_whatsapp_delivery &&
        digitsPhoneOk(order.customer_phone as string | null)
      ) {
        const { data: ordered } = await supabase
          .from('orders')
          .select('id')
          .eq('store_id', storeId)
          .order('created_at', { ascending: true })

        const ids = (ordered ?? []).map((r) => String((r as { id: string }).id))
        const idx = ids.indexOf(orderId)
        const ref =
          idx >= 0 ? `#${String(idx + 1).padStart(3, '0')}` : `#${orderId.slice(0, 6)}`

        const spamKey = `delivery-out:${storeId}:${orderId}`
        if (!shouldSkipAutoReply(spamKey, 90_000)) {
          try {
            await sendWhatsAppMessage({
              storeId,
              to: String(order.customer_phone),
              text: buildOutForDeliveryMessage(
                typeof order.customer_name === 'string'
                  ? order.customer_name
                  : null,
                ref
              ),
            })
            deliveryNotified = true
          } catch (e) {
            console.error('[orders/status] WhatsApp entrega:', e)
          }
        }
      }
    }

    return NextResponse.json({ ok: true, deliveryNotified })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
