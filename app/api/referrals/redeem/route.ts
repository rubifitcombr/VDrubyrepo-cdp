import { NextResponse } from 'next/server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { redeemReferralBonus } from '@/services/store-referral.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

export async function POST() {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMenuKey(gate.ctx.store, user.email, 'indique')
  if (deny) return deny

  try {
    const svc = createServiceRoleClient()
    const result = await redeemReferralBonus(svc, gate.ctx.storeId, gate.ctx.store)
    if ('error' in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 400 }
      )
    }
    return NextResponse.json({
      ok: true,
      plano_vence_em: result.plano_vence_em,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao resgatar bónus.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
