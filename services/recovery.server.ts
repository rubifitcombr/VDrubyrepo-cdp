import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppTextMessage } from '@/lib/whatsapp/graph-api.server'
import type {
  InactiveCustomer,
  RecoveryCampaignRow,
  RecoveryReport,
  RecoverySendRow,
  StoreRecoveryConfig,
} from '@/lib/recovery/types'
import { normalizePhoneE164 } from '@/services/loyalty.server'
import {
  getWhatsAppAccessTokenForStore,
  getWhatsAppConfigForStore,
} from '@/services/whatsapp-config.server'

function normalizeRecoveryConfig(row: Record<string, unknown>): StoreRecoveryConfig {
  return {
    store_id: String(row.store_id),
    enabled: row.enabled === true,
    default_inactive_days: Number(row.default_inactive_days ?? 30),
    default_message_template: String(
      row.default_message_template ||
        'Olá {{nome}}! Sentimos a sua falta na {{loja}}. Que tal pedir de novo? {{link}}'
    ),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

function normalizeCampaign(row: Record<string, unknown>): RecoveryCampaignRow {
  const status = String(row.status || 'draft')
  return {
    id: String(row.id),
    store_id: String(row.store_id),
    name: String(row.name),
    message_template: String(row.message_template),
    inactive_days: Number(row.inactive_days ?? 30),
    status:
      status === 'sending' || status === 'completed' || status === 'paused'
        ? status
        : 'draft',
    sent_count: Number(row.sent_count ?? 0),
    converted_count: Number(row.converted_count ?? 0),
    revenue_cents: Number(row.revenue_cents ?? 0),
    started_at: row.started_at != null ? String(row.started_at) : null,
    completed_at: row.completed_at != null ? String(row.completed_at) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

function normalizeSend(row: Record<string, unknown>): RecoverySendRow {
  return {
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    store_id: String(row.store_id),
    customer_phone: String(row.customer_phone),
    customer_name: row.customer_name != null ? String(row.customer_name) : null,
    sent_at: String(row.sent_at || ''),
    converted_at: row.converted_at != null ? String(row.converted_at) : null,
    order_id: row.order_id != null ? String(row.order_id) : null,
    order_total_cents:
      row.order_total_cents != null ? Number(row.order_total_cents) : null,
    wa_message_id: row.wa_message_id != null ? String(row.wa_message_id) : null,
    error_message: row.error_message != null ? String(row.error_message) : null,
  }
}

export function renderRecoveryMessage(
  template: string,
  vars: { nome: string; loja: string; link: string; dias: string }
): string {
  return template
    .replace(/\{\{nome\}\}/g, vars.nome)
    .replace(/\{\{loja\}\}/g, vars.loja)
    .replace(/\{\{link\}\}/g, vars.link)
    .replace(/\{\{dias\}\}/g, vars.dias)
}

export async function getOrCreateRecoveryConfig(
  db: SupabaseClient,
  storeId: string
): Promise<StoreRecoveryConfig> {
  const { data } = await db
    .from('store_recovery_config')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle()

  if (data) return normalizeRecoveryConfig(data as Record<string, unknown>)

  const { data: inserted, error } = await db
    .from('store_recovery_config')
    .insert({ store_id: storeId })
    .select('*')
    .single()

  if (error || !inserted) {
    throw new Error(error?.message || 'Falha ao criar configuração do recuperador.')
  }
  return normalizeRecoveryConfig(inserted as Record<string, unknown>)
}

export async function updateRecoveryConfig(
  db: SupabaseClient,
  storeId: string,
  patch: Partial<
    Pick<
      StoreRecoveryConfig,
      'enabled' | 'default_inactive_days' | 'default_message_template'
    >
  >
): Promise<StoreRecoveryConfig> {
  await getOrCreateRecoveryConfig(db, storeId)
  const { data, error } = await db
    .from('store_recovery_config')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('store_id', storeId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Falha ao actualizar recuperador.')
  }
  return normalizeRecoveryConfig(data as Record<string, unknown>)
}

export async function listRecoveryCampaigns(
  db: SupabaseClient,
  storeId: string
): Promise<RecoveryCampaignRow[]> {
  const { data, error } = await db
    .from('recovery_campaigns')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []).map((r) => normalizeCampaign(r as Record<string, unknown>))
}

export async function createRecoveryCampaign(
  db: SupabaseClient,
  storeId: string,
  input: { name: string; message_template: string; inactive_days: number }
): Promise<RecoveryCampaignRow> {
  const { data, error } = await db
    .from('recovery_campaigns')
    .insert({
      store_id: storeId,
      name: input.name.trim(),
      message_template: input.message_template.trim(),
      inactive_days: input.inactive_days,
      status: 'draft',
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Falha ao criar campanha.')
  }
  return normalizeCampaign(data as Record<string, unknown>)
}

export async function getRecoveryCampaign(
  db: SupabaseClient,
  storeId: string,
  campaignId: string
): Promise<RecoveryCampaignRow | null> {
  const { data, error } = await db
    .from('recovery_campaigns')
    .select('*')
    .eq('store_id', storeId)
    .eq('id', campaignId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? normalizeCampaign(data as Record<string, unknown>) : null
}

export async function listRecoverySends(
  db: SupabaseClient,
  storeId: string,
  campaignId?: string,
  limit = 100
): Promise<RecoverySendRow[]> {
  let q = db
    .from('recovery_sends')
    .select('*')
    .eq('store_id', storeId)
    .order('sent_at', { ascending: false })
    .limit(limit)

  if (campaignId) q = q.eq('campaign_id', campaignId)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data || []).map((r) => normalizeSend(r as Record<string, unknown>))
}

export async function findInactiveCustomers(
  db: SupabaseClient,
  storeId: string,
  inactiveDays: number
): Promise<InactiveCustomer[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - inactiveDays)

  const { data, error } = await db
    .from('orders')
    .select('customer_phone, customer_name, created_at, status')
    .eq('store_id', storeId)
    .not('customer_phone', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) throw new Error(error.message)

  const byPhone = new Map<
    string,
    { customer_name: string | null; last_order_at: string }
  >()

  for (const row of data || []) {
    const r = row as {
      customer_phone?: string
      customer_name?: string
      created_at?: string
      status?: string
    }
    const status = String(r.status || '').toLowerCase()
    if (status === 'cancelled' || status === 'canceled') continue
    const phone = normalizePhoneE164(String(r.customer_phone || ''))
    if (!phone) continue
    const created = String(r.created_at || '')
    const prev = byPhone.get(phone)
    if (!prev || created > prev.last_order_at) {
      byPhone.set(phone, {
        customer_name: r.customer_name?.trim() || prev?.customer_name || null,
        last_order_at: created,
      })
    }
  }

  const now = Date.now()
  const result: InactiveCustomer[] = []
  for (const [customer_phone, info] of byPhone) {
    const last = new Date(info.last_order_at).getTime()
    if (last >= cutoff.getTime()) continue
    const days_inactive = Math.floor((now - last) / (1000 * 60 * 60 * 24))
    result.push({
      customer_phone,
      customer_name: info.customer_name,
      last_order_at: info.last_order_at,
      days_inactive,
    })
  }

  result.sort((a, b) => b.days_inactive - a.days_inactive)
  return result
}

export async function getRecoveryReport(
  db: SupabaseClient,
  storeId: string
): Promise<RecoveryReport> {
  const campaigns = await listRecoveryCampaigns(db, storeId)
  let sends_total = 0
  let conversions_total = 0
  let revenue_cents_total = 0
  for (const c of campaigns) {
    sends_total += c.sent_count
    conversions_total += c.converted_count
    revenue_cents_total += c.revenue_cents
  }
  const conversion_rate_pct =
    sends_total > 0 ? Math.round((conversions_total / sends_total) * 1000) / 10 : 0

  return {
    campaigns_total: campaigns.length,
    sends_total,
    conversions_total,
    revenue_cents_total,
    conversion_rate_pct,
    recent_campaigns: campaigns.slice(0, 10),
  }
}

export async function runRecoveryCampaign(
  db: SupabaseClient,
  storeId: string,
  campaignId: string,
  storeMeta: { name: string; slug: string | null; publicUrl: string }
): Promise<{ sent: number; failed: number; eligible: number }> {
  const campaign = await getRecoveryCampaign(db, storeId, campaignId)
  if (!campaign) throw new Error('Campanha não encontrada.')
  if (campaign.status === 'sending') throw new Error('Campanha já em envio.')

  const waConfig = await getWhatsAppConfigForStore(db, storeId)
  if (!waConfig || waConfig.status !== 'active' || !waConfig.phone_number_id) {
    throw new Error('Ligue o WhatsApp da loja antes de enviar campanhas.')
  }
  const token = await getWhatsAppAccessTokenForStore(db, storeId)
  if (!token) throw new Error('Token WhatsApp indisponível.')

  const inactive = await findInactiveCustomers(db, storeId, campaign.inactive_days)

  const { data: priorSends } = await db
    .from('recovery_sends')
    .select('customer_phone')
    .eq('store_id', storeId)
    .gte('sent_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

  const recentlySent = new Set(
    (priorSends || []).map((r) =>
      normalizePhoneE164(String((r as { customer_phone: string }).customer_phone))
    )
  )

  const eligible = inactive.filter((c) => !recentlySent.has(c.customer_phone))

  const now = new Date().toISOString()
  await db
    .from('recovery_campaigns')
    .update({ status: 'sending', started_at: now, updated_at: now })
    .eq('id', campaignId)

  const storeLink = storeMeta.slug
    ? `${storeMeta.publicUrl.replace(/\/$/, '')}/${storeMeta.slug}`
    : storeMeta.publicUrl

  let sent = 0
  let failed = 0

  for (const customer of eligible.slice(0, 50)) {
    const body = renderRecoveryMessage(campaign.message_template, {
      nome: customer.customer_name || 'cliente',
      loja: storeMeta.name,
      link: storeLink,
      dias: String(customer.days_inactive),
    })

    const result = await sendWhatsAppTextMessage({
      phoneNumberId: waConfig.phone_number_id,
      accessToken: token,
      toE164: customer.customer_phone,
      body,
    })

    if (result.ok) {
      sent++
      await db.from('recovery_sends').insert({
        campaign_id: campaignId,
        store_id: storeId,
        customer_phone: customer.customer_phone,
        customer_name: customer.customer_name,
        wa_message_id: result.messageId,
      })
      await db.from('whatsapp_messages').insert({
        store_id: storeId,
        direction: 'outbound',
        wa_message_id: result.messageId,
        wa_to: customer.customer_phone,
        message_type: 'text',
        body_text: body,
        status: 'sent',
      })
    } else {
      failed++
      await db.from('recovery_sends').insert({
        campaign_id: campaignId,
        store_id: storeId,
        customer_phone: customer.customer_phone,
        customer_name: customer.customer_name,
        error_message: result.error,
      })
    }
  }

  const completedAt = new Date().toISOString()
  await db
    .from('recovery_campaigns')
    .update({
      status: 'completed',
      sent_count: campaign.sent_count + sent,
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq('id', campaignId)

  return { sent, failed, eligible: eligible.length }
}

export async function trackRecoveryConversionForOrder(
  db: SupabaseClient,
  input: {
    store_id: string
    order_id: string
    customer_phone: string | null | undefined
    order_total: number
  }
): Promise<void> {
  const phone = normalizePhoneE164(String(input.customer_phone || ''))
  if (!phone) return

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: send } = await db
    .from('recovery_sends')
    .select('id, campaign_id, converted_at')
    .eq('store_id', input.store_id)
    .eq('customer_phone', phone)
    .is('converted_at', null)
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!send) return

  const sendRow = send as { id: string; campaign_id: string }
  const totalCents = Math.round(input.order_total * 100)
  const now = new Date().toISOString()

  await db
    .from('recovery_sends')
    .update({
      converted_at: now,
      order_id: input.order_id,
      order_total_cents: totalCents,
    })
    .eq('id', sendRow.id)

  const { data: campaign } = await db
    .from('recovery_campaigns')
    .select('converted_count, revenue_cents')
    .eq('id', sendRow.campaign_id)
    .maybeSingle()

  if (campaign) {
    await db
      .from('recovery_campaigns')
      .update({
        converted_count:
          Number((campaign as { converted_count?: number }).converted_count ?? 0) + 1,
        revenue_cents:
          Number((campaign as { revenue_cents?: number }).revenue_cents ?? 0) +
          totalCents,
        updated_at: now,
      })
      .eq('id', sendRow.campaign_id)
  }
}
