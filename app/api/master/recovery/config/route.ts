import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createClient } from '@/lib/supabase/server'
import {
  buildRecoveryPreviewMessage,
  findInactiveCustomers,
  getOrCreateRecoveryConfig,
  getRecoveryReport,
  listRecoveryCampaigns,
  listRecoveryPromotionOptions,
  listRecoverySends,
  resolveRecoveryOfferText,
  updateRecoveryConfig,
} from '@/services/recovery.server'
import { listWhatsAppContacts } from '@/services/whatsapp-contacts.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

function publicStoreUrl(): string {
  return (
    process.env.VYRIA_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_VYRIA_PUBLIC_URL?.trim() ||
    'https://vyria.com.br'
  )
}

export async function GET(req: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'recovery')
  if (deny) return deny

  const url = new URL(req.url)
  const previewDays = Number(url.searchParams.get('preview_days') || '0')
  const contactsLimit = Math.min(
    200,
    Math.max(10, Math.floor(Number(url.searchParams.get('contacts_limit') || '50')))
  )

  const db = await createClient()
  const config = await getOrCreateRecoveryConfig(db, gate.ctx.storeId)
  const report = await getRecoveryReport(db, gate.ctx.storeId)
  const campaigns = await listRecoveryCampaigns(db, gate.ctx.storeId)
  const sends = await listRecoverySends(db, gate.ctx.storeId, undefined, 50)
  const promotions = await listRecoveryPromotionOptions(db, gate.ctx.storeId)
  const contacts = await listWhatsAppContacts(db, gate.ctx.storeId, contactsLimit)

  const storeName =
    typeof gate.ctx.store.name === 'string' && gate.ctx.store.name.trim()
      ? gate.ctx.store.name.trim()
      : 'sua loja'
  const storeSlug =
    typeof gate.ctx.store.slug === 'string' ? gate.ctx.store.slug : null
  const base = publicStoreUrl().replace(/\/$/, '')
  const storeLink = storeSlug ? `${base}/${storeSlug}` : base

  const offerText = await resolveRecoveryOfferText(db, gate.ctx.storeId, config)
  const messagePreview = buildRecoveryPreviewMessage(config, storeName, storeLink, offerText)

  let inactivePreview = null
  if (previewDays >= 7) {
    inactivePreview = await findInactiveCustomers(
      db,
      gate.ctx.storeId,
      Math.min(365, Math.floor(previewDays))
    )
  }

  return NextResponse.json({
    config,
    report,
    campaigns,
    sends,
    promotions,
    contacts,
    messagePreview,
    inactivePreview,
  })
}

export async function PATCH(req: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'recovery')
  if (deny) return deny

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (typeof body.auto_send_enabled === 'boolean') {
    patch.auto_send_enabled = body.auto_send_enabled
  }
  if (body.default_inactive_days != null) {
    patch.default_inactive_days = Math.min(
      365,
      Math.max(7, Math.floor(Number(body.default_inactive_days)))
    )
  }
  if (body.cooldown_days != null) {
    patch.cooldown_days = Math.min(90, Math.max(1, Math.floor(Number(body.cooldown_days))))
  }
  if (body.max_sends_per_run != null) {
    patch.max_sends_per_run = Math.min(
      200,
      Math.max(1, Math.floor(Number(body.max_sends_per_run)))
    )
  }
  if (body.default_message_template != null) {
    patch.default_message_template = String(body.default_message_template).trim()
  }
  if (body.promotion_id !== undefined) {
    patch.promotion_id =
      body.promotion_id == null || body.promotion_id === ''
        ? null
        : String(body.promotion_id)
  }
  if (body.offer_title !== undefined) {
    patch.offer_title =
      body.offer_title == null ? null : String(body.offer_title).trim() || null
  }
  if (body.offer_description !== undefined) {
    patch.offer_description =
      body.offer_description == null
        ? null
        : String(body.offer_description).trim() || null
  }

  const db = await createClient()
  const config = await updateRecoveryConfig(db, gate.ctx.storeId, patch)
  return NextResponse.json({ config })
}
