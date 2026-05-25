import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import {
  isTokenExpiredMetaError,
  metaFetch,
} from '@/lib/marketing/meta.server'

export const dynamic = 'force-dynamic'

type CampaignForMetrics = {
  id: string
  connection_id: string | null
  meta_ad_id: string | null
}

type ConnectionForMetrics = {
  id: string
  access_token: string
}

type MetaInsightsResponse = {
  data?: Array<{
    spend?: string
    reach?: string
    clicks?: string
    impressions?: string
    actions?: Array<{ action_type?: string; value?: string }>
  }>
}

function toNumber(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function actionValue(actions?: Array<{ action_type?: string; value?: string }>) {
  if (!Array.isArray(actions)) return 0
  const hit = actions.find(
    (a) => a?.action_type === 'onsite_conversion.messaging_conversation_started_7d'
  )
  return toNumber(hit?.value)
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const { data: campaigns, error } = await supabase
    .from('ad_campaigns')
    .select('id, connection_id, meta_ad_id')
    .eq('status', 'active')
    .not('meta_ad_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let updated = 0
  let failed = 0

  for (const campaign of (campaigns ?? []) as CampaignForMetrics[]) {
    if (!campaign.connection_id || !campaign.meta_ad_id) continue
    const { data: connection } = await supabase
      .from('social_connections')
      .select('id, access_token')
      .eq('id', campaign.connection_id)
      .maybeSingle()

    const conn = connection as ConnectionForMetrics | null
    if (!conn?.access_token) continue

    try {
      const insights = await metaFetch<MetaInsightsResponse>(`${campaign.meta_ad_id}/insights`, {
        fields: 'spend,reach,clicks,impressions,actions',
        access_token: conn.access_token,
      })
      const row = insights.data?.[0] ?? {}
      await supabase
        .from('ad_campaigns')
        .update({
          spent: toNumber(row.spend),
          reach: Math.round(toNumber(row.reach)),
          clicks: Math.round(toNumber(row.clicks)),
          impressions: Math.round(toNumber(row.impressions)),
          messages: Math.round(actionValue(row.actions)),
          metrics_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign.id)
      updated += 1
    } catch (err) {
      failed += 1
      if (isTokenExpiredMetaError(err)) {
        await supabase
          .from('social_connections')
          .update({ token_expires_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', conn.id)
      }
    }
  }

  return NextResponse.json({ ok: true, updated, failed })
}
