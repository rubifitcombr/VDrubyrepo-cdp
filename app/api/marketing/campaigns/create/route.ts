import { NextResponse } from 'next/server'
import { requireMarketingApiContext } from '@/lib/marketing/api-context.server'
import {
  isTokenExpiredMetaError,
  metaPost,
  normalizeAdAccountPathId,
  tokenExpiredResponse,
} from '@/lib/marketing/meta.server'
import {
  getMarketingConnectionForStore,
  markMarketingConnectionExpired,
} from '@/services/marketing.server'

export const dynamic = 'force-dynamic'

type MetaCreateResponse = { id: string }

function toText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function toNumber(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function dateOnly(v: unknown, fallback: Date): string {
  const s = toText(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return fallback.toISOString().slice(0, 10)
}

function metaTime(date: string, hour: 'start' | 'end') {
  return new Date(`${date}T${hour === 'start' ? '08:00:00' : '23:59:00'}-03:00`).toISOString()
}

function mapObjective(objective: string) {
  switch (objective) {
    case 'MESSAGES':
      return 'OUTCOME_ENGAGEMENT'
    case 'CONVERSIONS':
      return 'OUTCOME_SALES'
    case 'PROFILE_VISITS':
      return 'OUTCOME_TRAFFIC'
    case 'REACH':
    default:
      return 'OUTCOME_AWARENESS'
  }
}

function genderCodes(gender: string) {
  if (gender === 'male') return [1]
  if (gender === 'female') return [2]
  return [1, 2]
}

export async function POST(req: Request) {
  const ctx = await requireMarketingApiContext()
  if (!ctx.ok) return ctx.response

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const sourceType = toText(body.sourceType || body.type) || 'boost'
  if (sourceType !== 'boost') {
    return NextResponse.json(
      { error: 'Criação de campanha com mídia nova está preparada, mas ainda aguarda aprovação da Meta.' },
      { status: 403 }
    )
  }

  const connection = await getMarketingConnectionForStore(ctx.storeId)
  if (!connection?.id || !connection.access_token || !connection.ad_account_id) {
    return NextResponse.json(
      { error: 'Conecte uma conta Meta com conta de anúncios antes de criar campanhas.' },
      { status: 400 }
    )
  }

  const postId = toText(body.postId)
  if (!postId) {
    return NextResponse.json({ error: 'Escolha uma postagem para impulsionar.' }, { status: 400 })
  }

  const today = new Date()
  const inSeven = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const startDate = dateOnly(body.startDate, today)
  const endDate = dateOnly(body.endDate, inSeven)
  const dailyBudget = Math.max(6, Math.round(toNumber(body.dailyBudget, 6) * 100) / 100)
  const ageMin = Math.max(18, Math.min(65, Math.round(toNumber(body.ageMin, 18))))
  const ageMax = Math.max(ageMin, Math.min(65, Math.round(toNumber(body.ageMax, 65))))
  const targetCity = toText(body.targetCity)
  const objective = toText(body.objective) || 'REACH'
  const targetRadiusKm = Math.max(1, Math.min(50, Math.round(toNumber(body.targetRadiusKm, 10))))
  const targetGender = toText(body.gender) || 'all'
  const name =
    toText(body.name) ||
    `Impulsionamento - ${String(ctx.store.name || 'Loja')} - ${new Date().toLocaleDateString('pt-BR')}`

  const { data: campaign, error: insertErr } = await ctx.db
    .from('ad_campaigns')
    .insert({
      store_id: ctx.storeId,
      connection_id: connection.id,
      name,
      type: 'boost',
      status: 'draft',
      post_id: postId,
      post_thumbnail_url: toText(body.postThumbnailUrl) || null,
      post_type: toText(body.postType) || null,
      objective,
      daily_budget: dailyBudget,
      start_date: startDate,
      end_date: endDate,
      target_city: targetCity || null,
      target_radius_km: targetRadiusKm,
      target_age_min: ageMin,
      target_age_max: ageMax,
      target_gender: targetGender,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (insertErr || !campaign) {
    return NextResponse.json(
      { error: insertErr?.message || 'Não foi possível salvar a campanha.' },
      { status: 500 }
    )
  }

  try {
    const act = normalizeAdAccountPathId(connection.ad_account_id)
    const metaCampaign = await metaPost<MetaCreateResponse>(`${act}/campaigns`, {
      name,
      objective: mapObjective(objective),
      status: 'ACTIVE',
      special_ad_categories: [],
      access_token: connection.access_token,
    })

    const metaAdSet = await metaPost<MetaCreateResponse>(`${act}/adsets`, {
      name: `AdSet - ${String(ctx.store.name || 'Loja')}`,
      campaign_id: metaCampaign.id,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'REACH',
      daily_budget: Math.round(dailyBudget * 100),
      start_time: metaTime(startDate, 'start'),
      end_time: metaTime(endDate, 'end'),
      targeting: {
        geo_locations: targetCity
          ? {
              cities: [{ key: targetCity, radius: targetRadiusKm, distance_unit: 'kilometer' }],
              location_types: ['home', 'recent'],
            }
          : { countries: ['BR'] },
        age_min: ageMin,
        age_max: ageMax,
        genders: genderCodes(targetGender),
      },
      status: 'ACTIVE',
      access_token: connection.access_token,
    })

    const metaAd = await metaPost<MetaCreateResponse>(`${act}/ads`, {
      name: `Ad - ${String(ctx.store.name || 'Loja')}`,
      adset_id: metaAdSet.id,
      creative: { object_story_id: postId },
      status: 'ACTIVE',
      access_token: connection.access_token,
    })

    await ctx.db
      .from('ad_campaigns')
      .update({
        status: 'active',
        meta_campaign_id: metaCampaign.id,
        meta_adset_id: metaAdSet.id,
        meta_ad_id: metaAd.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', String(campaign.id))

    return NextResponse.json({ ok: true, campaign_id: String(campaign.id) })
  } catch (err) {
    await ctx.db
      .from('ad_campaigns')
      .update({ status: 'error', updated_at: new Date().toISOString() })
      .eq('id', String(campaign.id))

    if (isTokenExpiredMetaError(err)) {
      await markMarketingConnectionExpired(connection.id)
      return NextResponse.json(tokenExpiredResponse(), { status: 401 })
    }
    const message = err instanceof Error ? err.message : 'Erro ao criar campanha na Meta.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
