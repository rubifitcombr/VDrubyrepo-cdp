export type MarketingCampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'completed'
  | 'cancelled'
  | 'failed'

export type MarketingAudience = 'all_contacts'

export type StoreMarketingConfig = {
  store_id: string
  enabled: boolean
  max_recipients_per_campaign: number
  cooldown_days: number
  max_campaigns_per_month: number
  created_at: string
  updated_at: string
}

export type MarketingCampaignRow = {
  id: string
  store_id: string
  name: string
  body_text: string
  image_url: string
  audience: MarketingAudience
  status: MarketingCampaignStatus
  scheduled_at: string | null
  recipient_count: number
  sent_count: number
  failed_count: number
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type MarketingSendRow = {
  id: string
  campaign_id: string
  store_id: string
  customer_phone: string
  customer_name: string | null
  sent_at: string
  wa_message_id: string | null
  error_message: string | null
}

export type MarketingReport = {
  campaigns_total: number
  sends_total: number
  failed_total: number
  whatsapp_contacts_total: number
  campaigns_this_month: number
  max_campaigns_per_month: number
  max_recipients_per_campaign: number
}

export type MarketingAudienceContact = {
  customer_phone: string
  customer_name: string | null
  first_seen_at: string
  last_inbound_at: string | null
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
