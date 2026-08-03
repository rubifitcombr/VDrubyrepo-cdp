import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  encryptWhatsAppToken,
  tryDecryptWhatsAppToken,
} from '@/lib/whatsapp/token-crypto.server'
import {
  fetchWhatsAppPhoneNumber,
  resolvePhoneNumberIdFromWaba,
} from '@/lib/whatsapp/graph-api.server'
import {
  digitsOnly,
  formatWhatsAppConnectError,
  looksLikePhoneE164,
  phonesMatchE164,
} from '@/lib/whatsapp/meta-id.utils'
import type {
  StoreWhatsAppConfig,
  StoreWhatsAppConfigPublic,
  WhatsAppAiTone,
  WhatsAppConnectionStatus,
  WhatsAppMessageRow,
} from '@/lib/whatsapp/types'

function normalizeTone(v: unknown): WhatsAppAiTone {
  return v === 'formal' ? 'formal' : 'casual'
}

function normalizeStatus(v: unknown): WhatsAppConnectionStatus {
  const s = String(v || '').trim()
  if (
    s === 'pending' ||
    s === 'active' ||
    s === 'disconnected' ||
    s === 'error'
  ) {
    return s
  }
  return 'pending'
}

export function normalizeWhatsAppConfigRow(
  row: Record<string, unknown>
): StoreWhatsAppConfig {
  return {
    store_id: String(row.store_id),
    status: normalizeStatus(row.status),
    waba_id: row.waba_id != null ? String(row.waba_id) : null,
    phone_number_id:
      row.phone_number_id != null ? String(row.phone_number_id) : null,
    display_phone_e164:
      row.display_phone_e164 != null ? String(row.display_phone_e164) : null,
    webhook_verified_at:
      row.webhook_verified_at != null ? String(row.webhook_verified_at) : null,
    auto_reply_enabled:
      row.auto_reply_enabled !== false && (row as { ai_enabled?: boolean }).ai_enabled !== false,
    ai_tone: normalizeTone(row.ai_tone),
    notify_order_received: row.notify_order_received === true,
    notify_order_preparing: row.notify_order_preparing === true,
    notify_order_ready: row.notify_order_ready === true,
    notify_order_delivered: row.notify_order_delivered === true,
    last_error: row.last_error != null ? String(row.last_error) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

export function toPublicWhatsAppConfig(
  config: StoreWhatsAppConfig,
  accessTokenEnc: string | null | undefined
): StoreWhatsAppConfigPublic {
  return {
    ...config,
    has_token: !!accessTokenEnc?.trim(),
  }
}

export async function getWhatsAppConfigForStore(
  db: SupabaseClient,
  storeId: string
): Promise<StoreWhatsAppConfig | null> {
  const { data, error } = await db
    .from('store_whatsapp_config')
    .select(
      'store_id, status, waba_id, phone_number_id, display_phone_e164, webhook_verified_at, auto_reply_enabled, ai_tone, notify_order_received, notify_order_preparing, notify_order_ready, notify_order_delivered, last_error, created_at, updated_at, access_token_enc'
    )
    .eq('store_id', storeId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }
  if (!data) return null
  return normalizeWhatsAppConfigRow(data as Record<string, unknown>)
}

export async function getWhatsAppAccessTokenForStore(
  db: SupabaseClient,
  storeId: string
): Promise<string | null> {
  const { data, error } = await db
    .from('store_whatsapp_config')
    .select('access_token_enc')
    .eq('store_id', storeId)
    .maybeSingle()

  if (error || !data) return null
  const enc = (data as { access_token_enc?: string | null }).access_token_enc
  return tryDecryptWhatsAppToken(enc)
}

export async function listRecentWhatsAppMessages(
  db: SupabaseClient,
  storeId: string,
  limit = 30
): Promise<WhatsAppMessageRow[]> {
  const { data, error } = await db
    .from('whatsapp_messages')
    .select(
      'id, store_id, direction, wa_message_id, wa_from, wa_to, message_type, body_text, status, created_at'
    )
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  return ((data as Record<string, unknown>[]) ?? []).map((row) => ({
    id: String(row.id),
    store_id: String(row.store_id),
    direction: row.direction === 'outbound' ? 'outbound' : 'inbound',
    wa_message_id: row.wa_message_id != null ? String(row.wa_message_id) : null,
    wa_from: row.wa_from != null ? String(row.wa_from) : null,
    wa_to: row.wa_to != null ? String(row.wa_to) : null,
    message_type: String(row.message_type || 'text'),
    body_text: row.body_text != null ? String(row.body_text) : null,
    status: row.status != null ? String(row.status) : null,
    created_at: String(row.created_at || ''),
  }))
}

export type VerifiedWhatsAppSender = {
  phone_number_id: string
  display_phone_e164: string | null
  display_phone_formatted: string | null
  verified_name: string | null
}

export async function getVerifiedWhatsAppSenderForStore(
  db: SupabaseClient,
  storeId: string
): Promise<VerifiedWhatsAppSender | null> {
  const config = await getWhatsAppConfigForStore(db, storeId)
  if (!config?.phone_number_id || config.status !== 'active') return null

  const token = await getWhatsAppAccessTokenForStore(db, storeId)
  if (!token) return null

  const verified = await fetchWhatsAppPhoneNumber(config.phone_number_id, token)
  if (!verified.ok) return null

  const displayE164 =
    verified.data.display_phone_number?.replace(/\D/g, '') || null

  if (displayE164 && displayE164 !== config.display_phone_e164) {
    await db
      .from('store_whatsapp_config')
      .update({
        display_phone_e164: displayE164,
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)
  }

  return {
    phone_number_id: config.phone_number_id,
    display_phone_e164: displayE164,
    display_phone_formatted: verified.data.display_phone_number || null,
    verified_name: verified.data.verified_name || null,
  }
}

export type ConnectWhatsAppInput = {
  waba_id: string
  phone_number_id: string
  access_token: string
  display_phone_e164?: string | null
}

export async function connectWhatsAppForStore(
  db: SupabaseClient,
  storeId: string,
  input: ConnectWhatsAppInput
): Promise<
  | { ok: true; config: StoreWhatsAppConfigPublic }
  | { ok: false; error: string }
> {
  const wabaId = input.waba_id.trim()
  const phoneNumberId = input.phone_number_id.trim()
  const token = input.access_token.trim()

  if (!wabaId || !phoneNumberId || !token) {
    return { ok: false, error: 'Preencha WABA ID, Phone Number ID e token.' }
  }

  let resolvedPhoneNumberId = phoneNumberId
  let verified = await fetchWhatsAppPhoneNumber(resolvedPhoneNumberId, token)

  if (!verified.ok) {
    const phoneToResolve =
      looksLikePhoneE164(phoneNumberId) ? phoneNumberId : input.display_phone_e164?.trim()

    if (phoneToResolve) {
      const resolved = await resolvePhoneNumberIdFromWaba(wabaId, token, phoneToResolve)
      if (resolved.ok) {
        resolvedPhoneNumberId = resolved.phoneNumberId
        verified = { ok: true, data: resolved.data }
      }
    }
  }

  if (!verified.ok) {
    return {
      ok: false,
      error: formatWhatsAppConnectError(verified.error, {
        phoneNumberId,
        wabaId,
      }),
    }
  }

  const metaDisplayDigits =
    verified.data.display_phone_number?.replace(/\D/g, '') || null
  const userDisplayDigits = input.display_phone_e164?.trim()
    ? digitsOnly(input.display_phone_e164)
    : null

  if (
    userDisplayDigits &&
    metaDisplayDigits &&
    !phonesMatchE164(userDisplayDigits, metaDisplayDigits)
  ) {
    const metaLabel = verified.data.display_phone_number || metaDisplayDigits
    const name = verified.data.verified_name
      ? ` (${verified.data.verified_name})`
      : ''
    return {
      ok: false,
      error:
        `O Phone Number ID seleccionado pertence ao número ${metaLabel}${name}, não ao telefone da loja que informou. ` +
        'No WhatsApp Manager → API Setup, copie o Phone Number ID do número correcto da loja.',
    }
  }

  const display = metaDisplayDigits

  const now = new Date().toISOString()
  const patch = {
    store_id: storeId,
    status: 'active' as const,
    waba_id: wabaId,
    phone_number_id: resolvedPhoneNumberId,
    display_phone_e164: display,
    access_token_enc: encryptWhatsAppToken(token),
    last_error: null,
    updated_at: now,
  }

  const { data, error } = await db
    .from('store_whatsapp_config')
    .upsert(patch, { onConflict: 'store_id' })
    .select(
      'store_id, status, waba_id, phone_number_id, display_phone_e164, webhook_verified_at, auto_reply_enabled, ai_tone, notify_order_received, notify_order_preparing, notify_order_ready, notify_order_delivered, last_error, created_at, updated_at, access_token_enc'
    )
    .single()

  if (error) {
    return { ok: false, error: error.message }
  }

  const row = data as Record<string, unknown>
  const config = normalizeWhatsAppConfigRow(row)
  return {
    ok: true,
    config: toPublicWhatsAppConfig(
      config,
      row.access_token_enc as string | undefined
    ),
  }
}

export type UpdateWhatsAppSettingsInput = {
  auto_reply_enabled?: boolean
  ai_tone?: WhatsAppAiTone
  notify_order_received?: boolean
  notify_order_preparing?: boolean
  notify_order_ready?: boolean
  notify_order_delivered?: boolean
}

export async function updateWhatsAppSettingsForStore(
  db: SupabaseClient,
  storeId: string,
  input: UpdateWhatsAppSettingsInput
): Promise<StoreWhatsAppConfigPublic> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (input.auto_reply_enabled !== undefined) patch.auto_reply_enabled = input.auto_reply_enabled
  if (input.ai_tone !== undefined) patch.ai_tone = input.ai_tone
  if (input.notify_order_received !== undefined) {
    patch.notify_order_received = input.notify_order_received
  }
  if (input.notify_order_preparing !== undefined) {
    patch.notify_order_preparing = input.notify_order_preparing
  }
  if (input.notify_order_ready !== undefined) {
    patch.notify_order_ready = input.notify_order_ready
  }
  if (input.notify_order_delivered !== undefined) {
    patch.notify_order_delivered = input.notify_order_delivered
  }

  const { data, error } = await db
    .from('store_whatsapp_config')
    .update(patch)
    .eq('store_id', storeId)
    .select(
      'store_id, status, waba_id, phone_number_id, display_phone_e164, webhook_verified_at, auto_reply_enabled, ai_tone, notify_order_received, notify_order_preparing, notify_order_ready, notify_order_delivered, last_error, created_at, updated_at, access_token_enc'
    )
    .single()

  if (error) {
    throw new Error(error.message)
  }

  const row = data as Record<string, unknown>
  const config = normalizeWhatsAppConfigRow(row)
  return toPublicWhatsAppConfig(config, row.access_token_enc as string | undefined)
}

export async function disconnectWhatsAppForStore(
  db: SupabaseClient,
  storeId: string
): Promise<void> {
  const { error } = await db
    .from('store_whatsapp_config')
    .update({
      status: 'disconnected',
      waba_id: null,
      phone_number_id: null,
      display_phone_e164: null,
      access_token_enc: null,
      webhook_verified_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', storeId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function markWebhookVerified(
  db: SupabaseClient,
  storeId: string
): Promise<void> {
  await db
    .from('store_whatsapp_config')
    .update({
      webhook_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', storeId)
}

export async function findStoreIdByPhoneNumberId(
  db: SupabaseClient,
  phoneNumberId: string
): Promise<string | null> {
  const { data, error } = await db
    .from('store_whatsapp_config')
    .select('store_id')
    .eq('phone_number_id', phoneNumberId)
    .eq('status', 'active')
    .maybeSingle()

  if (error || !data) return null
  return String((data as { store_id: string }).store_id)
}
