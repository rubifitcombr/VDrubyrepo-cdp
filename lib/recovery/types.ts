export type RecoveryCampaignStatus = 'draft' | 'sending' | 'completed' | 'paused'

export type StoreRecoveryConfig = {
  store_id: string
  enabled: boolean
  default_inactive_days: number
  default_message_template: string
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
  recent_campaigns: RecoveryCampaignRow[]
}

export type InactiveCustomer = {
  customer_phone: string
  customer_name: string | null
  last_order_at: string
  days_inactive: number
}
