import { NextResponse } from 'next/server'
import { requireMarketingApiContext } from '@/lib/marketing/api-context.server'
import {
  isTokenExpiredMetaError,
  metaPost,
  tokenExpiredResponse,
} from '@/lib/marketing/meta.server'
import {
  getMarketingConnectionForStore,
  markMarketingConnectionExpired,
} from '@/services/marketing.server'

export const dynamic = 'force-dynamic'

type MetaUpdateResponse = { success?: boolean }

export async function PATCH(
  req: Request,
  ctxParams: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketingApiContext()
  if (!ctx.ok) return ctx.response

  const { id } = await ctxParams.params
  const campaignId = String(id ?? '').trim()
  const body = (await req.json().catch(() => ({}))) as { status?: string }
  const nextStatus = body.status === 'active' ? 'active' : body.status === 'paused' ? 'paused' : null
  if (!campaignId || !nextStatus) {
    return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
  }

  const { data: campaign, error } = await ctx.db
    .from('ad_campaigns')
    .select('id, store_id, meta_ad_id, status')
    .eq('id', campaignId)
    .eq('store_id', ctx.storeId)
    .maybeSingle()

  if (error || !campaign) {
    return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })
  }

  const connection = await getMarketingConnectionForStore(ctx.storeId)
  if (!connection?.access_token) {
    return NextResponse.json({ error: 'Conta Meta não conectada.' }, { status: 400 })
  }

  try {
    const metaAdId = String((campaign as { meta_ad_id?: string | null }).meta_ad_id ?? '')
    if (metaAdId) {
      await metaPost<MetaUpdateResponse>(metaAdId, {
        status: nextStatus === 'active' ? 'ACTIVE' : 'PAUSED',
        access_token: connection.access_token,
      })
    }

    await ctx.db
      .from('ad_campaigns')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', campaignId)
      .eq('store_id', ctx.storeId)

    return NextResponse.json({ ok: true, status: nextStatus })
  } catch (err) {
    if (isTokenExpiredMetaError(err)) {
      await markMarketingConnectionExpired(connection.id)
      return NextResponse.json(tokenExpiredResponse(), { status: 401 })
    }
    const message = err instanceof Error ? err.message : 'Erro ao atualizar campanha.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
