export type LoyaltyLedgerKind = 'earn' | 'redeem' | 'adjust' | 'welcome'

export type StoreLoyaltyConfig = {
  store_id: string
  enabled: boolean
  points_per_real: number
  min_redeem_points: number
  redeem_cents_per_point: number
  welcome_bonus_points: number
  whatsapp_balance_enabled: boolean
  created_at: string
  updated_at: string
}

export type LoyaltyAccountRow = {
  store_id: string
  customer_phone: string
  customer_name: string | null
  points_balance: number
  lifetime_earned: number
  lifetime_redeemed: number
  last_order_at: string | null
  created_at: string
  updated_at: string
}

export type LoyaltyLedgerRow = {
  id: string
  store_id: string
  customer_phone: string
  kind: LoyaltyLedgerKind
  points_delta: number
  order_id: string | null
  note: string | null
  created_at: string
}

export type LoyaltySummary = {
  members_count: number
  total_points_outstanding: number
  total_lifetime_earned: number
}
