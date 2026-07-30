import { NextResponse } from 'next/server'
import { isVyriaAdminPanelUser } from '@/lib/admin-panel-user'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { subscribeMerchantWabaToVyriaApp } from '@/lib/whatsapp/embedded-signup.server'
import {
  connectWhatsAppForStore,
  updateWhatsAppSettingsForStore,
} from '@/services/whatsapp-config.server'
import { getUser } from '@/services/auth.server'
import type { WhatsAppAiTone } from '@/lib/whatsapp/types'

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

  const action = String(body.action || 'connect').trim()
  const db = createServiceRoleClient()

  if (action === 'settings') {
    try {
      const config = await updateWhatsAppSettingsForStore(db, gate.ctx.storeId, {
        ai_enabled: body.ai_enabled === true || body.ai_enabled === false ? body.ai_enabled : undefined,
        ai_tone:
          body.ai_tone === 'formal' || body.ai_tone === 'casual'
            ? (body.ai_tone as WhatsAppAiTone)
            : undefined,
        notify_order_received:
          body.notify_order_received === true || body.notify_order_received === false
            ? body.notify_order_received
            : undefined,
        notify_order_preparing:
          body.notify_order_preparing === true || body.notify_order_preparing === false
            ? body.notify_order_preparing
            : undefined,
        notify_order_ready:
          body.notify_order_ready === true || body.notify_order_ready === false
            ? body.notify_order_ready
            : undefined,
        notify_order_delivered:
          body.notify_order_delivered === true || body.notify_order_delivered === false
            ? body.notify_order_delivered
            : undefined,
      })
      return NextResponse.json({ ok: true, config })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao guardar.'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  if (!isVyriaAdminPanelUser(user.id)) {
    return NextResponse.json(
      {
        error:
          'Use o botão «Conectar com Facebook» para ligar o WhatsApp da loja.',
      },
      { status: 403 }
    )
  }

  const result = await connectWhatsAppForStore(db, gate.ctx.storeId, {
    waba_id: String(body.waba_id || ''),
    phone_number_id: String(body.phone_number_id || ''),
    access_token: String(body.access_token || ''),
    display_phone_e164:
      body.display_phone_e164 != null ? String(body.display_phone_e164) : null,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const wabaId = String(body.waba_id || '').trim()
  const token = String(body.access_token || '').trim()
  if (wabaId && token) {
    const subscribed = await subscribeMerchantWabaToVyriaApp(wabaId, token)
    if (!subscribed.ok) {
      console.warn('[whatsapp connect] subscribed_apps:', subscribed.error)
    }
  }

  return NextResponse.json({ ok: true, config: result.config })
}
