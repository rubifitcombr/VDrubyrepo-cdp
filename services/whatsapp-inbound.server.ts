import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { tryWhatsAppAutoReply } from '@/services/whatsapp-ai.server'

export type InboundWhatsAppMessageInput = {
  bodyText?: string | null
  listReplyId?: string | null
  isNewSession: boolean
  customerName?: string | null
}

/**
 * Processa mensagem inbound do cliente e responde via atendimento automático.
 */
export async function handleInboundWhatsAppCustomerMessage(
  db: SupabaseClient,
  storeId: string,
  fromE164: string,
  input: InboundWhatsAppMessageInput
): Promise<void> {
  await tryWhatsAppAutoReply(db, storeId, fromE164, input)
}
