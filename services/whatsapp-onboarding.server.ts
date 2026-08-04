import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { initiateCoexistenceDataSync } from '@/lib/whatsapp/coexistence.server'
import type { CoexistenceSyncResult } from '@/lib/whatsapp/coexistence.server'
import { subscribeMerchantWabaToVyriaApp } from '@/lib/whatsapp/embedded-signup.server'
import {
  connectWhatsAppForStore,
  disconnectWhatsAppForStore,
  getVerifiedWhatsAppSenderForStore,
  getWhatsAppConfigForStore,
  toPublicWhatsAppConfig,
} from '@/services/whatsapp-config.server'
import { listStoreWhatsAppTemplates } from '@/services/whatsapp-templates.server'
import type { AdminWhatsAppSummary, StoreWhatsAppConfigPublic } from '@/lib/whatsapp/types'

export type WhatsAppConnectInput = {
  waba_id: string
  phone_number_id: string
  access_token: string
  display_phone_e164?: string | null
  coexistence?: boolean
}

export type FinalizeWhatsAppConnectionResult =
  | {
      ok: true
      config: StoreWhatsAppConfigPublic
      webhook_subscribed: boolean
      templates_scheduled: boolean
      coexistence_sync?: CoexistenceSyncResult
    }
  | { ok: false; error: string }

/** Liga WABA à loja: valida token, subscreve webhook Vyria e cria templates padrão. */
export async function finalizeWhatsAppConnection(
  db: SupabaseClient,
  storeId: string,
  input: WhatsAppConnectInput
): Promise<FinalizeWhatsAppConnectionResult> {
  const connected = await connectWhatsAppForStore(db, storeId, input)
  if (!connected.ok) {
    return connected
  }

  const subscribed = await subscribeMerchantWabaToVyriaApp(
    input.waba_id.trim(),
    input.access_token.trim()
  )
  if (!subscribed.ok) {
    console.warn('[whatsapp onboarding] subscribed_apps:', subscribed.error)
  }

  let templatesScheduled = false
  try {
    const { createDefaultWhatsAppTemplates } = await import(
      '@/services/whatsapp-templates.server'
    )
    await createDefaultWhatsAppTemplates(
      db,
      storeId,
      input.waba_id.trim(),
      input.access_token.trim()
    )
    templatesScheduled = true
  } catch (e) {
    console.warn('[whatsapp onboarding] default templates:', e)
  }

  let coexistenceSync: CoexistenceSyncResult | undefined

  if (input.coexistence) {
    const phoneNumberId = connected.config.phone_number_id
    if (phoneNumberId) {
      const sync = await initiateCoexistenceDataSync(
        phoneNumberId,
        input.access_token.trim()
      )
      coexistenceSync = sync
      if (sync.errors.length > 0) {
        console.warn('[whatsapp onboarding] coexistence sync:', sync.errors.join('; '))
      }
    }
  }

  return {
    ok: true,
    config: connected.config,
    webhook_subscribed: subscribed.ok,
    templates_scheduled: templatesScheduled,
    ...(coexistenceSync ? { coexistence_sync: coexistenceSync } : {}),
  }
}

export async function requestWhatsAppActivation(
  db: SupabaseClient,
  storeId: string,
  input: { contact_phone?: string; notes?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await getWhatsAppConfigForStore(db, storeId)
  if (existing?.status === 'active') {
    return { ok: false, error: 'O WhatsApp desta loja já está activo.' }
  }

  const contactPhone = input.contact_phone?.trim().slice(0, 32) || null
  const notes = input.notes?.trim().slice(0, 500) || null
  const now = new Date().toISOString()

  const { error } = await db.from('store_whatsapp_config').upsert(
    {
      store_id: storeId,
      status: 'pending',
      onboarding_contact_phone: contactPhone,
      onboarding_notes: notes,
      onboarding_requested_at: now,
      updated_at: now,
    },
    { onConflict: 'store_id' }
  )

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

export function publicWhatsAppWebhookUrl(): string {
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

export async function getAdminWhatsAppSummary(
  db: SupabaseClient,
  storeId: string
): Promise<AdminWhatsAppSummary> {
  const row = await getWhatsAppConfigForStore(db, storeId)
  const webhookUrl = publicWhatsAppWebhookUrl()

  if (!row) {
    return {
      status: 'nao_configurado',
      configured: false,
      waba_id: null,
      phone_number_id: null,
      display_phone_e164: null,
      has_token: false,
      webhook_verified_at: null,
      last_error: null,
      onboarding_contact_phone: null,
      onboarding_notes: null,
      onboarding_requested_at: null,
      verified_name: null,
      verified_phone_formatted: null,
      templates_total: 0,
      templates_approved: 0,
      webhook_url: webhookUrl,
    }
  }

  let templatesTotal = 0
  let templatesApproved = 0
  try {
    const templates = await listStoreWhatsAppTemplates(db, storeId)
    templatesTotal = templates.length
    templatesApproved = templates.filter((t) => t.status === 'approved').length
  } catch {
    /* tabela pode não existir ainda */
  }

  let verifiedName: string | null = null
  let verifiedPhoneFormatted: string | null = null
  if (row.status === 'active') {
    try {
      const verified = await getVerifiedWhatsAppSenderForStore(db, storeId)
      verifiedName = verified?.verified_name ?? null
      verifiedPhoneFormatted =
        verified?.display_phone_formatted ?? verified?.display_phone_e164 ?? null
    } catch {
      /* ignore */
    }
  }

  const { data: tokenRow } = await db
    .from('store_whatsapp_config')
    .select('access_token_enc')
    .eq('store_id', storeId)
    .maybeSingle()

  const publicConfig = toPublicWhatsAppConfig(
    row,
    (tokenRow as { access_token_enc?: string } | null)?.access_token_enc
  )

  return {
    status: row.status,
    configured: true,
    waba_id: row.waba_id,
    phone_number_id: row.phone_number_id,
    display_phone_e164: row.display_phone_e164,
    has_token: publicConfig.has_token,
    webhook_verified_at: row.webhook_verified_at,
    last_error: row.last_error,
    onboarding_contact_phone: row.onboarding_contact_phone,
    onboarding_notes: row.onboarding_notes,
    onboarding_requested_at: row.onboarding_requested_at,
    verified_name: verifiedName,
    verified_phone_formatted: verifiedPhoneFormatted,
    templates_total: templatesTotal,
    templates_approved: templatesApproved,
    webhook_url: webhookUrl,
  }
}

export async function adminDisconnectWhatsApp(
  db: SupabaseClient,
  storeId: string
): Promise<void> {
  await disconnectWhatsAppForStore(db, storeId)
}
