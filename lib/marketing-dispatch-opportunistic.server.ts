import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchMarketingCampaign } from '@/services/marketing.server'

/** Dispara campanhas agendadas vencidas de uma loja (sem cron — ex.: painel marketing). */
export async function dispatchDueMarketingCampaignsForStore(
  db: SupabaseClient,
  storeId: string
): Promise<void> {
  const now = new Date().toISOString()
  const { data: due, error } = await db
    .from('marketing_campaigns')
    .select('id')
    .eq('store_id', storeId)
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(5)

  if (error) {
    console.warn('[marketing opportunistic]', storeId, error.message)
    return
  }

  for (const row of due || []) {
    const campaignId = String((row as { id: string }).id)
    try {
      await dispatchMarketingCampaign(db, storeId, campaignId)
    } catch (e) {
      console.warn('[marketing opportunistic dispatch]', storeId, campaignId, e)
    }
  }
}
