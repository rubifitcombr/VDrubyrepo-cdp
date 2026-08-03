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
import { listStoreWhatsAppTemplates } from '@/services/whatsapp-templates.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

export async function GET() {
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
  const messages = await listRecentWhatsAppMessages(db, gate.ctx.storeId)
  const sendFailureStats = await getWhatsAppSendFailureStats(db, gate.ctx.storeId)
  const sendFailures = await listRecentWhatsAppSendFailures(db, gate.ctx.storeId, 20)
  const templates = await listStoreWhatsAppTemplates(db, gate.ctx.storeId)
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
    webhookUrl: publicWebhookUrl(),
  })
}

function publicWebhookUrl(): string {
  const base =
    process.env.VYRIA_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_VYRIA_PUBLIC_URL?.trim() ||
    ''
  if (!base) return '/api/webhooks/whatsapp'
  const normalized = base.replace(/\/$/, '').replace(/^http:\/\//i, 'https://')
  if (!normalized.includes('://www.') && normalized.includes('acesseseusistemavyria.online')) {
    return normalized.replace('://', '://www.') + '/api/webhooks/whatsapp'
  }
  return `${normalized}/api/webhooks/whatsapp`
}
