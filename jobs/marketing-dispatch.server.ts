import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { runDueMarketingCampaigns } from '@/services/marketing.server'

export async function runMarketingDispatchJob(): Promise<{
  processed: number
  sent: number
  failed: number
}> {
  const db = createServiceRoleClient()
  return runDueMarketingCampaigns(db)
}
