import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlatformBillingConfigRow } from '@/lib/subscription-billing-types'

const CONFIG_ID = 1

function mapRow(raw: Record<string, unknown> | null): PlatformBillingConfigRow | null {
  if (!raw) return null
  return {
    id: Number(raw.id ?? CONFIG_ID),
    mp_access_token:
      typeof raw.mp_access_token === 'string' ? raw.mp_access_token : null,
    mp_webhook_secret:
      typeof raw.mp_webhook_secret === 'string' ? raw.mp_webhook_secret : null,
    receiver_name:
      typeof raw.receiver_name === 'string' ? raw.receiver_name : null,
    receiver_document:
      typeof raw.receiver_document === 'string' ? raw.receiver_document : null,
    enabled: raw.enabled === true,
    updated_at: String(raw.updated_at ?? ''),
    updated_by: raw.updated_by ? String(raw.updated_by) : null,
  }
}

export async function getPlatformBillingConfig(
  svc: SupabaseClient
): Promise<PlatformBillingConfigRow | null> {
  const { data, error } = await svc
    .from('platform_billing_config')
    .select('*')
    .eq('id', CONFIG_ID)
    .maybeSingle()

  if (error) {
    if (/relation|does not exist|42P01/i.test(error.message ?? '')) return null
    throw new Error(error.message)
  }
  return mapRow(data as Record<string, unknown> | null)
}

export function resolveMercadoPagoAccessToken(
  config: PlatformBillingConfigRow | null
): string | null {
  const fromDb = config?.mp_access_token?.trim()
  if (fromDb) return fromDb
  const fromEnv = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()
  return fromEnv || null
}

export function isPlatformBillingEnabled(
  config: PlatformBillingConfigRow | null
): boolean {
  if (!config?.enabled) return false
  return !!resolveMercadoPagoAccessToken(config)
}

export async function upsertPlatformBillingConfig(
  svc: SupabaseClient,
  input: {
    mp_access_token?: string | null
    mp_webhook_secret?: string | null
    receiver_name?: string | null
    receiver_document?: string | null
    enabled?: boolean
    updated_by?: string | null
  }
): Promise<PlatformBillingConfigRow> {
  const patch: Record<string, unknown> = {
    id: CONFIG_ID,
    updated_at: new Date().toISOString(),
  }
  if (input.mp_access_token !== undefined) {
    patch.mp_access_token = input.mp_access_token?.trim() || null
  }
  if (input.mp_webhook_secret !== undefined) {
    patch.mp_webhook_secret = input.mp_webhook_secret?.trim() || null
  }
  if (input.receiver_name !== undefined) {
    patch.receiver_name = input.receiver_name?.trim() || null
  }
  if (input.receiver_document !== undefined) {
    patch.receiver_document = input.receiver_document?.trim() || null
  }
  if (input.enabled !== undefined) patch.enabled = input.enabled
  if (input.updated_by !== undefined) patch.updated_by = input.updated_by

  const { data, error } = await svc
    .from('platform_billing_config')
    .upsert(patch, { onConflict: 'id' })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapRow(data as Record<string, unknown>)!
}

export function maskAccessToken(token: string | null | undefined): string | null {
  if (!token?.trim()) return null
  const t = token.trim()
  if (t.length <= 8) return '••••••••'
  return `${t.slice(0, 4)}••••${t.slice(-4)}`
}
