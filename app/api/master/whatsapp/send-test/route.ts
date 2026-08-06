import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { enforceApiRateLimit } from '@/lib/api-security.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import {
  getVerifiedWhatsAppSenderForStore,
} from '@/services/whatsapp-config.server'
import { sendWhatsAppTestMessage } from '@/services/whatsapp-webhook.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const limited = enforceApiRateLimit(request, 'whatsapp-send-test', 5, 60_000)
  if (limited) return limited

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'whatsapp_ai')
  if (deny) return deny

  let body: { to?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const to = String(body.to || '').replace(/\D/g, '')
  if (to.length < 10) {
    return NextResponse.json(
      { error: 'Informe um telefone válido (com DDD).' },
      { status: 400 }
    )
  }

  const db = createServiceRoleClient()
  const sender = await getVerifiedWhatsAppSenderForStore(db, gate.ctx.storeId)
  const result = await sendWhatsAppTestMessage(db, gate.ctx.storeId, to)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    from_phone: sender?.display_phone_formatted || sender?.display_phone_e164 || null,
    from_name: sender?.verified_name || null,
    phone_number_id: sender?.phone_number_id || null,
  })
}
