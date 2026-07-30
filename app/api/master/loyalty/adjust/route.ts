import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createClient } from '@/lib/supabase/server'
import { adjustLoyaltyPoints } from '@/services/loyalty.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'loyalty')
  if (deny) return deny

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const customer_phone = String(body.customer_phone || '').trim()
  const points_delta = Number(body.points_delta)
  if (!customer_phone) {
    return NextResponse.json({ error: 'Informe o telefone do cliente.' }, { status: 400 })
  }
  if (!points_delta) {
    return NextResponse.json({ error: 'Informe pontos diferentes de zero.' }, { status: 400 })
  }

  const db = await createClient()
  try {
    const account = await adjustLoyaltyPoints(db, gate.ctx.storeId, {
      customer_phone,
      customer_name: body.customer_name != null ? String(body.customer_name) : null,
      points_delta: Math.trunc(points_delta),
      note: body.note != null ? String(body.note) : null,
    })
    return NextResponse.json({ account })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Falha no ajuste.' },
      { status: 400 }
    )
  }
}
