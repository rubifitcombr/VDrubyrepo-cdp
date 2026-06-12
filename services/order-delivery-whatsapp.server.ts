import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { hasOrderPipelineAutomations, parsePlan } from '@/lib/plan'
import { parseAutomationsFromStore } from '@/lib/store-automations'
import { readStorePlano } from '@/lib/store-columns'
import {
  sendWhatsAppMessage,
  shouldSkipAutoReply,
} from '@/services/whatsapp-sender.server'

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

export async function maybeSendOrderOutForDeliveryWhatsApp(
  supabase: SupabaseClient,
  input: {
    store: Record<string, unknown>
    storeId: string
    orderId: string
    customerPhone: string | null | undefined
    customerName: string | null | undefined
  }
): Promise<boolean> {
  const storePlan = parsePlan(readStorePlano(input.store))
  if (!hasOrderPipelineAutomations(storePlan)) return false
  if (!parseAutomationsFromStore(input.store).auto_whatsapp_delivery) return false
  if (!digitsPhoneOk(input.customerPhone)) return false

  const { data: ordered } = await supabase
    .from('orders')
    .select('id')
    .eq('store_id', input.storeId)
    .order('created_at', { ascending: true })

  const ids = (ordered ?? []).map((r) => String((r as { id: string }).id))
  const idx = ids.indexOf(input.orderId)
  const ref =
    idx >= 0
      ? `#${String(idx + 1).padStart(3, '0')}`
      : `#${input.orderId.slice(0, 6)}`

  const spamKey = `delivery-out:${input.storeId}:${input.orderId}`
  if (shouldSkipAutoReply(spamKey, 90_000)) return false

  try {
    await sendWhatsAppMessage({
      storeId: input.storeId,
      to: String(input.customerPhone),
      text: buildOutForDeliveryMessage(
        typeof input.customerName === 'string' ? input.customerName : null,
        ref
      ),
    })
    return true
  } catch (e) {
    console.error('[order-delivery-whatsapp]', e)
    return false
  }
}
