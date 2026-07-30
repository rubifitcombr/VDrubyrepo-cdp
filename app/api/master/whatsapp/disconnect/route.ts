import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createClient } from '@/lib/supabase/server'
import { disconnectWhatsAppForStore } from '@/services/whatsapp-config.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

export async function POST() {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'whatsapp_ai')
  if (deny) return deny

  const db = await createClient()
  await disconnectWhatsAppForStore(db, gate.ctx.storeId)

  return NextResponse.json({ ok: true })
}
