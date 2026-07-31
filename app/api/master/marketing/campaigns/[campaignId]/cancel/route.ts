import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createClient } from '@/lib/supabase/server'
import { cancelMarketingCampaign } from '@/services/marketing.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

type RouteCtx = { params: Promise<{ campaignId: string }> }

export async function POST(_req: Request, ctx: RouteCtx) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'marketing')
  if (deny) return deny

  const { campaignId } = await ctx.params
  const db = await createClient()

  try {
    const campaign = await cancelMarketingCampaign(db, gate.ctx.storeId, campaignId)
    return NextResponse.json({ campaign })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Falha ao cancelar.' },
      { status: 400 }
    )
  }
}
