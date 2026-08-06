import { NextResponse } from 'next/server'
import { enforceApiRateLimit } from '@/lib/api-security.server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { matchGarcomByPin, normalizeGarcomPin } from '@/lib/garcom-pin'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'
import { listGarconsForStore } from '@/services/store-garcons.server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const limited = enforceApiRateLimit(request, 'garcom-pin-verify', 30, 60_000)
  if (limited) return limited

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMenuKey(gate.ctx.store, user.email, 'garcom')
  if (deny) return deny

  let body: { pin?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const pin = normalizeGarcomPin(body.pin)
  if (pin.length !== 4) {
    return NextResponse.json({ error: 'PIN inválido.' }, { status: 400 })
  }

  const supabase = await createClient()
  const garcons = await listGarconsForStore(supabase, gate.ctx.storeId)
  const garcom = matchGarcomByPin(garcons, pin)
  if (!garcom) {
    return NextResponse.json({ error: 'PIN inválido.' }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    garcom: { id: garcom.id, nome: garcom.nome },
  })
}
