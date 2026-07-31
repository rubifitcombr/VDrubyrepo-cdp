import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createClient } from '@/lib/supabase/server'
import {
  getOrCreateMarketingConfig,
  getMarketingReport,
  listMarketingAudience,
  listMarketingCampaigns,
  listMarketingSends,
  updateMarketingConfig,
} from '@/services/marketing.server'
import { listWhatsAppContacts } from '@/services/whatsapp-contacts.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'marketing')
  if (deny) return deny

  const db = await createClient()
  const config = await getOrCreateMarketingConfig(db, gate.ctx.storeId)
  const report = await getMarketingReport(db, gate.ctx.storeId)
  const campaigns = await listMarketingCampaigns(db, gate.ctx.storeId)
  const sends = await listMarketingSends(db, gate.ctx.storeId, 50)
  const contacts = await listWhatsAppContacts(db, gate.ctx.storeId, 80)
  const audiencePreview = await listMarketingAudience(
    db,
    gate.ctx.storeId,
    config.cooldown_days,
    config.max_recipients_per_campaign
  )

  return NextResponse.json({
    config,
    report,
    campaigns,
    sends,
    contacts,
    audiencePreview,
  })
}

export async function PATCH(req: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'marketing')
  if (deny) return deny

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (body.cooldown_days != null) {
    patch.cooldown_days = Math.min(30, Math.max(1, Math.floor(Number(body.cooldown_days))))
  }

  const db = await createClient()
  const config = await updateMarketingConfig(db, gate.ctx.storeId, patch)
  return NextResponse.json({ config })
}
