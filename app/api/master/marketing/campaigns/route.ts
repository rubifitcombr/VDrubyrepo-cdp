import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import {
  createMarketingCampaign,
  dispatchMarketingCampaign,
} from '@/services/marketing.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'marketing')
  if (deny) return deny

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const db = await createClient()

  try {
    const scheduled_at =
      body.scheduled_at != null && String(body.scheduled_at).trim()
        ? String(body.scheduled_at).trim()
        : null

    const campaign = await createMarketingCampaign(db, gate.ctx.storeId, {
      name: String(body.name || ''),
      body_text: String(body.body_text || ''),
      image_url: String(body.image_url || ''),
      scheduled_at,
    })

    const scheduledMs = campaign.scheduled_at
      ? new Date(campaign.scheduled_at).getTime()
      : Date.now()
    const dispatchNow = scheduledMs <= Date.now() + 60_000

    if (dispatchNow) {
      const svc = createServiceRoleClient()
      void dispatchMarketingCampaign(svc, gate.ctx.storeId, campaign.id).catch((e) =>
        console.warn('[marketing immediate dispatch]', e)
      )
    }

    return NextResponse.json({
      campaign,
      dispatch: dispatchNow ? 'queued' : 'scheduled',
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Falha ao criar campanha.' },
      { status: 400 }
    )
  }
}
