import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { updateWhatsAppSettingsForStore } from '@/services/whatsapp-config.server'
import { getUser } from '@/services/auth.server'
import type { WhatsAppAiTone } from '@/lib/whatsapp/types'

export const dynamic = 'force-dynamic'

/** Apenas definições (robô, notificações). Ligação manual via equipa Vyria. */
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

  const action = String(body.action || '').trim()
  if (action !== 'settings') {
    return NextResponse.json(
      {
        error:
          'A ligação do WhatsApp é feita pela equipa Vyria. Solicite a activação no painel.',
      },
      { status: 400 }
    )
  }

  const db = createServiceRoleClient()

  try {
    const autoReplyEnabled =
      body.auto_reply_enabled === true || body.auto_reply_enabled === false
        ? body.auto_reply_enabled
        : body.ai_enabled === true || body.ai_enabled === false
          ? body.ai_enabled
          : undefined

    const config = await updateWhatsAppSettingsForStore(db, gate.ctx.storeId, {
      auto_reply_enabled: autoReplyEnabled,
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
