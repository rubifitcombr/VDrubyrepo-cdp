import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseAutomationsFromStore } from '@/lib/store-automations'
import { readStorePlano } from '@/lib/store-columns'
import { hasOrderPipelineAutomations, parsePlan } from '@/lib/plan'
import {
  sendWhatsAppMessage,
  shouldSkipAutoReply,
} from '@/services/whatsapp-sender.server'

function digitsPhoneOk(phone: string | null | undefined): boolean {
  const d = phone?.replace(/\D/g, '') ?? ''
  return d.length >= 10
}

export function buildOrderAcceptedWhatsAppMessage(
  customerName: string | null,
  orderRef: string
): string {
  const first = customerName?.trim().split(/\s+/)[0]
  const greet = first ? `Olá ${first}! ` : 'Olá! '
  return `${greet}O teu pedido ${orderRef} foi confirmado e está a ser preparado. Obrigado!`
}

/**
 * «Mensagem de confirmação» ao aceitar o pedido (Pendente → Preparando).
 */
export async function maybeSendOrderAcceptedWhatsApp(
  supabase: SupabaseClient,
  input: {
    store: Record<string, unknown>
    storeId: string
    orderId: string
    customerPhone: string | null | undefined
    customerName: string | null | undefined
  }
): Promise<boolean> {
  const plan = parsePlan(readStorePlano(input.store))
  if (!hasOrderPipelineAutomations(plan)) return false
  if (!parseAutomationsFromStore(input.store).auto_whatsapp_confirm) return false
  if (!digitsPhoneOk(input.customerPhone)) return false

  const { data: ordered } = await supabase
    .from('orders')
    .select('id')
    .eq('store_id', input.storeId)
    .order('created_at', { ascending: true })

  const ids = (ordered ?? []).map((r) => String((r as { id: string }).id))
  const idx = ids.indexOf(input.orderId)
  const ref =
    idx >= 0 ? `#${String(idx + 1).padStart(3, '0')}` : `#${input.orderId.slice(0, 6)}`

  const spamKey = `order-accepted-wa:${input.storeId}:${input.orderId}`
  if (shouldSkipAutoReply(spamKey, 90_000)) return false

  try {
    await sendWhatsAppMessage({
      storeId: input.storeId,
      to: String(input.customerPhone),
      text: buildOrderAcceptedWhatsAppMessage(
        typeof input.customerName === 'string' ? input.customerName : null,
        ref
      ),
    })
    return true
  } catch (e) {
    console.error('[maybeSendOrderAcceptedWhatsApp]', e)
    return false
  }
}
