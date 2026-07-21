import { NextRequest, NextResponse } from 'next/server'
import { isSalaoGarcomPinRequired } from '@/lib/garcom-pin'
import { gateMerchantGarconsManagement } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'
import { buildGarconsReport } from '@/services/store-garcons-report.server'
import { listGarconsForStore } from '@/services/store-garcons.server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantGarconsManagement(gate.ctx.store, user.email)
  if (deny) return deny

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')

  const supabase = await createClient()
  try {
    const garcons = await listGarconsForStore(supabase, gate.ctx.storeId)
    if (!isSalaoGarcomPinRequired(garcons)) {
      return NextResponse.json({ ok: true, pinsNotConfigured: true, report: null })
    }

    const report = await buildGarconsReport(
      supabase,
      gate.ctx.storeId,
      from ?? '',
      to ?? ''
    )
    return NextResponse.json({ ok: true, report })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
