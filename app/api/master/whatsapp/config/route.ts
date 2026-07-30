import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createClient } from '@/lib/supabase/server'
import {
  getWhatsAppConfigForStore,
  listRecentWhatsAppMessages,
  toPublicWhatsAppConfig,
} from '@/services/whatsapp-config.server'
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
    messages,
    webhookUrl: publicWebhookUrl(),
  })
}

function publicWebhookUrl(): string {
  const base =
    process.env.VYRIA_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_VYRIA_PUBLIC_URL?.trim() ||
    ''
  if (!base) return '/api/webhooks/whatsapp'
  return `${base.replace(/\/$/, '')}/api/webhooks/whatsapp`
}
