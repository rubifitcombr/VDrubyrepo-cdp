import { NextResponse } from 'next/server'
import { gateMerchantDeliveryPipeline } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getDeliveryOpsPayload } from '@/services/delivery-ops.server'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantDeliveryPipeline(gate.ctx.store, user.email)
  if (deny) return deny

  const supabase = await createClient()
  const payload = await getDeliveryOpsPayload(supabase, gate.ctx.storeId)
  return NextResponse.json({ ok: true, ...payload })
}
