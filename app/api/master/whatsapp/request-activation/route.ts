import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

/** Desactivado — ligação apenas via Conectar com Facebook (coexistência). */
export async function POST() {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'whatsapp_ai')
  if (deny) return deny

  return NextResponse.json(
    {
      error:
        'Use o botão Conectar com Facebook no painel WhatsApp para ligar o número com coexistência.',
    },
    { status: 410 }
  )
}
