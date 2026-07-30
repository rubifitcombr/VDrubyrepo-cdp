import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import {
  exchangeEmbeddedSignupCode,
  subscribeMerchantWabaToVyriaApp,
} from '@/lib/whatsapp/embedded-signup.server'
import { createClient } from '@/lib/supabase/server'
import { connectWhatsAppForStore } from '@/services/whatsapp-config.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

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
  const phoneNumberId = String(body.phone_number_id || '').trim()

  if (!code) {
    return NextResponse.json({ error: 'Código OAuth em falta.' }, { status: 400 })
  }
  if (!wabaId || !phoneNumberId) {
    return NextResponse.json(
      {
        error:
          'Dados do número não recebidos da Meta. Feche o popup e tente «Conectar com Facebook» novamente.',
      },
      { status: 400 }
    )
  }

  const exchanged = await exchangeEmbeddedSignupCode(code)
  if (!exchanged.ok) {
    return NextResponse.json({ error: exchanged.error }, { status: 400 })
  }

  const subscribed = await subscribeMerchantWabaToVyriaApp(wabaId, exchanged.access_token)
  if (!subscribed.ok) {
    console.warn('[whatsapp embedded] subscribed_apps:', subscribed.error)
  }

  const db = await createClient()
  const result = await connectWhatsAppForStore(db, gate.ctx.storeId, {
    waba_id: wabaId,
    phone_number_id: phoneNumberId,
    access_token: exchanged.access_token,
    display_phone_e164: body.display_phone_e164 != null ? String(body.display_phone_e164) : null,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    config: result.config,
    webhook_subscribed: subscribed.ok,
  })
}
