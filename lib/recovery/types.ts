export type RecoveryCampaignStatus = 'draft' | 'sending' | 'completed' | 'paused'

export type RecoveryOfferFields = {
  promotion_id: string | null
  offer_title: string | null
  offer_description: string | null
}

export type StoreRecoveryConfig = {
  store_id: string
  enabled: boolean
  default_inactive_days: number
  default_message_template: string
  promotion_id: string | null
  offer_title: string | null
  offer_description: string | null
  auto_send_enabled: boolean
  cooldown_days: number
  max_sends_per_run: number
  last_auto_run_at: string | null
  created_at: string
  updated_at: string
}

export type RecoveryCampaignRow = {
  id: string
  store_id: string
  name: string
  message_template: string
  inactive_days: number
  status: RecoveryCampaignStatus
  sent_count: number
  converted_count: number
  revenue_cents: number
  promotion_id: string | null
  offer_title: string | null
  offer_description: string | null
  is_automatic: boolean
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type RecoverySendRow = {
  id: string
  campaign_id: string
  store_id: string
  customer_phone: string
  customer_name: string | null
  sent_at: string
  converted_at: string | null
  order_id: string | null
  order_total_cents: number | null
  wa_message_id: string | null
  error_message: string | null
}

export type RecoveryReport = {
  campaigns_total: number
  sends_total: number
  conversions_total: number
  revenue_cents_total: number
  conversion_rate_pct: number
  whatsapp_contacts_total: number
  recent_campaigns: RecoveryCampaignRow[]
}

export type InactiveCustomer = {
  customer_phone: string
  customer_name: string | null
  last_activity_at: string
  days_inactive: number
  source: 'order' | 'whatsapp' | 'both'
}

export type RecoveryPromotionOption = {
  id: string
  name: string
  active: boolean
  summary: string
  coupon_code: string | null
}

export type RecoveryMessageVars = {
  nome: string
  loja: string
  link: string
  dias: string
  oferta: string
  promo: string
  cupom: string
}

export type WhatsAppContactSummary = {
  store_id: string
  customer_phone: string
  customer_name: string | null
  first_seen_at: string
  last_inbound_at: string | null
  last_outbound_at: string | null
  last_order_at: string | null
  marketing_opt_out: boolean
  source: string
  inbound_count: number
  created_at: string
  updated_at: string
}
