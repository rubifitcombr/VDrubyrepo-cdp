/** Tipos partilhados — WhatsApp Cloud API (plano Master). */

export type WhatsAppConnectionStatus =
  | 'pending'
  | 'active'
  | 'disconnected'
  | 'error'

export type WhatsAppAiTone = 'casual' | 'formal'

export type StoreWhatsAppConfig = {
  store_id: string
  status: WhatsAppConnectionStatus
  waba_id: string | null
  phone_number_id: string | null
  display_phone_e164: string | null
  webhook_verified_at: string | null
  auto_reply_enabled: boolean
  ai_tone: WhatsAppAiTone
  notify_order_received: boolean
  notify_order_preparing: boolean
  notify_order_ready: boolean
  notify_order_delivered: boolean
  last_error: string | null
  created_at: string
  updated_at: string
}

/** Config exposta ao painel (sem token). */
export type StoreWhatsAppConfigPublic = Omit<StoreWhatsAppConfig, never> & {
  has_token: boolean
}

export type WhatsAppMessageDirection = 'inbound' | 'outbound'

export type WhatsAppMessageRow = {
  id: string
  store_id: string
  direction: WhatsAppMessageDirection
  wa_message_id: string | null
  wa_from: string | null
  wa_to: string | null
  message_type: string
  body_text: string | null
  status: string | null
  created_at: string
}
