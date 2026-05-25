import 'server-only'

import { createClient as createSessionClient } from '@/lib/supabase/server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'

export type SocialConnectionRow = {
  id: string
  store_id: string
  provider: string | null
  access_token: string
  long_lived_token: string | null
  token_expires_at: string | null
  facebook_user_id: string | null
  instagram_id: string | null
  page_id: string | null
  page_name: string | null
  page_access_token: string | null
  ad_account_id: string | null
  instagram_username: string | null
  connected_at: string | null
  updated_at: string | null
}

export type AdCampaignRow = {
  id: string
  store_id: string
  connection_id: string | null
  name: string
  type: 'boost' | 'campaign'
  status: 'draft' | 'active' | 'paused' | 'completed' | 'error'
  post_id: string | null
  post_thumbnail_url: string | null
  post_type: string | null
  media_url: string | null
  media_type: string | null
  headline: string | null
  caption: string | null
  cta_type: string | null
  objective: string | null
  daily_budget: number | null
  start_date: string | null
  end_date: string | null
  target_city: string | null
  target_radius_km: number | null
  target_age_min: number | null
  target_age_max: number | null
  target_gender: string | null
  meta_campaign_id: string | null
  meta_adset_id: string | null
  meta_ad_id: string | null
  spent: number | null
  reach: number | null
  clicks: number | null
  messages: number | null
  impressions: number | null
  metrics_updated_at: string | null
  created_at: string | null
  updated_at: string | null
}

export async function marketingDb() {
  return tryCreateServiceRoleClient() ?? (await createSessionClient())
}

export async function getMarketingConnectionForStore(
  storeId: string
): Promise<SocialConnectionRow | null> {
  const db = await marketingDb()
  const { data } = await db
    .from('social_connections')
    .select('*')
    .eq('store_id', storeId)
    .eq('provider', 'meta')
    .maybeSingle()
  return (data as SocialConnectionRow | null) ?? null
}

export async function getMarketingCampaignsForStore(
  storeId: string
): Promise<AdCampaignRow[]> {
  const db = await marketingDb()
  const { data } = await db
    .from('ad_campaigns')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
  return (data ?? []) as AdCampaignRow[]
}

export async function markMarketingConnectionExpired(connectionId: string) {
  const db = await marketingDb()
  await db
    .from('social_connections')
    .update({ token_expires_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', connectionId)
}
