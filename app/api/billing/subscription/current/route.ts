import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import { getSubscriptionBillingUiForStore } from '@/services/subscription-billing.server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id, { skipSubscriptionGate: true })
  if (!gate.ok) return gate.response

  const svc = tryCreateServiceRoleClient() ?? supabase
  const state = await getSubscriptionBillingUiForStore(
    svc,
    gate.ctx.storeId,
    user.email ?? undefined
  )

  if (!state) {
    return NextResponse.json({ ok: true, enabled: false, billing: null })
  }

  return NextResponse.json({ ok: true, enabled: true, billing: state })
}
