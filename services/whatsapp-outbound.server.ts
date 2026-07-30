import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppTextMessage } from '@/lib/whatsapp/graph-api.server'
import { normalizePhoneE164 } from '@/services/loyalty.server'
import {
  getWhatsAppAccessTokenForStore,
  getWhatsAppConfigForStore,
} from '@/services/whatsapp-config.server'

export async function sendStoreWhatsAppText(
  db: SupabaseClient,
  storeId: string,
  toPhone: string,
  body: string
): Promise<boolean> {
  const phone = normalizePhoneE164(toPhone)
  if (!phone) return false

  const waConfig = await getWhatsAppConfigForStore(db, storeId)
  if (!waConfig || waConfig.status !== 'active' || !waConfig.phone_number_id) return false
  if (waConfig.ai_enabled === false) return false

  const token = await getWhatsAppAccessTokenForStore(db, storeId)
  if (!token) return false

  const sent = await sendWhatsAppTextMessage({
    phoneNumberId: waConfig.phone_number_id,
    accessToken: token,
    toE164: phone,
    body,
  })

  if (sent.ok) {
    await db.from('whatsapp_messages').insert({
      store_id: storeId,
      direction: 'outbound',
      wa_message_id: sent.messageId,
      wa_to: phone,
      message_type: 'text',
      body_text: body,
      status: 'sent',
    })
    return true
  }

  console.warn('[whatsapp outbound]', sent.error)
  return false
}

export async function canSendStoreWhatsApp(db: SupabaseClient, storeId: string): Promise<boolean> {
  const waConfig = await getWhatsAppConfigForStore(db, storeId)
  if (!waConfig || waConfig.status !== 'active' || !waConfig.phone_number_id) return false
  if (waConfig.ai_enabled === false) return false
  const token = await getWhatsAppAccessTokenForStore(db, storeId)
  return !!token
}
