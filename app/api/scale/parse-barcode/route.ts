import { NextResponse } from 'next/server'
import {
  gateMerchantScaleIntegration,
  gateMerchantMenuKey,
} from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { resolveWeighableBarcodeForStore } from '@/lib/scale/resolve-weighable-barcode.server'
import { parseScaleFromStore } from '@/lib/store-scale'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const denyPdv = gateMerchantMenuKey(gate.ctx.store, user.email, 'pdv')
  const denyGarcom = gateMerchantMenuKey(gate.ctx.store, user.email, 'garcom')
  if (denyPdv && denyGarcom) {
    return denyPdv
  }

  const denyScale = gateMerchantScaleIntegration(gate.ctx.store, user.email)
  if (denyScale) return denyScale

  let body: { barcode?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const barcode = String(body.barcode ?? '').trim()
  if (!barcode) {
    return NextResponse.json({ error: 'Informe o código de barras.' }, { status: 400 })
  }

  const scale = parseScaleFromStore(gate.ctx.store)
  const supabase = await createClient()
  const result = await resolveWeighableBarcodeForStore(
    supabase,
    gate.ctx.storeId,
    barcode,
    { pluPrefix: scale.scale_plu_prefix }
  )

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, code: result.code },
      { status: result.status }
    )
  }

  return NextResponse.json({ ok: true, data: result.data })
}
