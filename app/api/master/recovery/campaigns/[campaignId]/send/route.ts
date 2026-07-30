import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createClient } from '@/lib/supabase/server'
import { runRecoveryCampaign } from '@/services/recovery.server'
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

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'recovery')
  if (deny) return deny

  const { campaignId } = await ctx.params
  const store = gate.ctx.store
  const storeName =
    typeof store.name === 'string' && store.name.trim()
      ? store.name.trim()
      : 'sua loja'
  const storeSlug = typeof store.slug === 'string' ? store.slug : null
  const publicUrl =
    process.env.VYRIA_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_VYRIA_PUBLIC_URL?.trim() ||
    'https://vyria.com.br'

  const db = await createClient()
  try {
    const result = await runRecoveryCampaign(db, gate.ctx.storeId, campaignId, {
      name: storeName,
      slug: storeSlug,
      publicUrl,
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Falha ao enviar campanha.' },
      { status: 400 }
    )
  }
}
