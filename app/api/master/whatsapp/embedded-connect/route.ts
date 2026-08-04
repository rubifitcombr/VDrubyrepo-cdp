import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { resolveCoexistencePhoneNumberId } from '@/lib/whatsapp/coexistence.server'
import { exchangeEmbeddedSignupCode } from '@/lib/whatsapp/embedded-signup.server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { finalizeWhatsAppConnection } from '@/services/whatsapp-onboarding.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

/** Embedded Signup com coexistência (WhatsApp Business no celular + Cloud API). */
export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'whatsapp_ai')
  if (deny) return deny

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const code = String(body.code || '').trim()
  const wabaId = String(body.waba_id || '').trim()
  let phoneNumberId = String(body.phone_number_id || '').trim()
  const coexistence = body.coexistence === true

  if (!code) {
    return NextResponse.json({ error: 'Código OAuth em falta.' }, { status: 400 })
  }
  if (!wabaId) {
    return NextResponse.json(
      { error: 'Dados da conta WhatsApp não recebidos da Meta. Tente novamente.' },
      { status: 400 }
    )
  }

  const exchanged = await exchangeEmbeddedSignupCode(code)
  if (!exchanged.ok) {
    return NextResponse.json({ error: exchanged.error }, { status: 400 })
  }

  let displayPhoneE164 =
    body.display_phone_e164 != null ? String(body.display_phone_e164) : null

  if (!phoneNumberId) {
    const resolved = await resolveCoexistencePhoneNumberId(wabaId, exchanged.access_token)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }
    phoneNumberId = resolved.phoneNumberId
    displayPhoneE164 = displayPhoneE164 || resolved.displayPhoneE164
  }

  const db = createServiceRoleClient()
  const result = await finalizeWhatsAppConnection(db, gate.ctx.storeId, {
    waba_id: wabaId,
    phone_number_id: phoneNumberId,
    access_token: exchanged.access_token,
    display_phone_e164: displayPhoneE164,
    coexistence: coexistence || !body.phone_number_id,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    config: result.config,
    webhook_subscribed: result.webhook_subscribed,
    coexistence_sync: result.coexistence_sync ?? null,
  })
}
