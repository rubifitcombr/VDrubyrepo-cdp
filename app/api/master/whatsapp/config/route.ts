import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createClient } from '@/lib/supabase/server'
import {
  getWhatsAppConfigForStore,
  getVerifiedWhatsAppSenderForStore,
  listRecentWhatsAppMessages,
  toPublicWhatsAppConfig,
} from '@/services/whatsapp-config.server'
import {
  getWhatsAppSendFailureStats,
  listRecentWhatsAppSendFailures,
} from '@/services/whatsapp-send-failures.server'
import { publicWhatsAppWebhookUrl } from '@/services/whatsapp-onboarding.server'
import { listStoreWhatsAppTemplates } from '@/services/whatsapp-templates.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

function isSchemaMismatchError(message: string): boolean {
  return /column|does not exist|schema cache|42P01/i.test(message)
}

export async function GET() {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const gate = await requireLojistaAtivoApi(user.id)
    if (!gate.ok) return gate.response

    const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'whatsapp_ai')
    if (deny) return deny

    const db = await createClient()
    const row = await getWhatsAppConfigForStore(db, gate.ctx.storeId)

    let messages: Awaited<ReturnType<typeof listRecentWhatsAppMessages>> = []
    let sendFailureStats = { window_expired_24h: 0, other_errors_24h: 0 }
    let sendFailures: Awaited<ReturnType<typeof listRecentWhatsAppSendFailures>> = []
    let templates: Awaited<ReturnType<typeof listStoreWhatsAppTemplates>> = []

    try {
      messages = await listRecentWhatsAppMessages(db, gate.ctx.storeId)
    } catch (e) {
      console.warn('[whatsapp config] messages:', e)
    }

    try {
      sendFailureStats = await getWhatsAppSendFailureStats(db, gate.ctx.storeId)
      sendFailures = await listRecentWhatsAppSendFailures(db, gate.ctx.storeId, 20)
    } catch (e) {
      console.warn('[whatsapp config] send failures:', e)
    }

    try {
      templates = await listStoreWhatsAppTemplates(db, gate.ctx.storeId)
    } catch (e) {
      console.warn('[whatsapp config] templates:', e)
    }

    const verifiedSender = row
      ? await getVerifiedWhatsAppSenderForStore(db, gate.ctx.storeId)
      : null

    if (row && verifiedSender?.display_phone_e164) {
      row.display_phone_e164 = verifiedSender.display_phone_e164
    }

    const { data: tokenRow } = await db
      .from('store_whatsapp_config')
      .select('access_token_enc')
      .eq('store_id', gate.ctx.storeId)
      .maybeSingle()

    return NextResponse.json({
      config: row
        ? toPublicWhatsAppConfig(
            row,
            (tokenRow as { access_token_enc?: string } | null)?.access_token_enc
          )
        : null,
      verifiedSender,
      messages,
      sendFailureStats,
      sendFailures,
      templates,
      webhookUrl: publicWhatsAppWebhookUrl(),
      connectionMode: 'manual' as const,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro ao carregar WhatsApp.'
    console.error('[whatsapp config]', e)
    if (isSchemaMismatchError(message)) {
      return NextResponse.json(
        {
          error:
            'Base de dados desactualizada para o WhatsApp Master. Contacte o suporte Vyria para aplicar as migrations.',
          schemaError: true,
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
