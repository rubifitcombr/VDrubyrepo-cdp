import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { tryWhatsAppAiReply } from '@/services/whatsapp-ai.server'

/**
 * Processa mensagem inbound do cliente e responde via assistente (IA + fallback).
 */
export async function handleInboundWhatsAppCustomerMessage(
  db: SupabaseClient,
  storeId: string,
  fromE164: string,
  bodyText: string
): Promise<void> {
  await tryWhatsAppAiReply(db, storeId, fromE164, bodyText)
}
