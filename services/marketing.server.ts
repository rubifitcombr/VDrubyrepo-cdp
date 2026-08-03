import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  MarketingAudienceContact,
  MarketingCampaignRow,
  MarketingReport,
  MarketingSendRow,
  StoreMarketingConfig,
} from '@/lib/marketing/types'
import { sendWhatsAppImageMessage } from '@/lib/whatsapp/graph-api.server'
import { normalizePhoneE164 } from '@/services/loyalty.server'
import {
  countWhatsAppContacts,
  touchWhatsAppOutboundContact,
} from '@/services/whatsapp-contacts.server'
import {
  getWhatsAppAccessTokenForStore,
  getWhatsAppConfigForStore,
} from '@/services/whatsapp-config.server'
import { logWhatsAppSendFailure } from '@/services/whatsapp-send-failures.server'

export const MARKETING_MAX_RECIPIENTS_PER_CAMPAIGN = 50

function currentYearMonthUtc(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function normalizeConfig(row: Record<string, unknown>): StoreMarketingConfig {
  return {
    store_id: String(row.store_id),
    enabled: row.enabled !== false,
    max_recipients_per_campaign: Math.min(
      MARKETING_MAX_RECIPIENTS_PER_CAMPAIGN,
      Number(row.max_recipients_per_campaign ?? MARKETING_MAX_RECIPIENTS_PER_CAMPAIGN)
    ),
    cooldown_days: Number(row.cooldown_days ?? 7),
    max_campaigns_per_month: Number(row.max_campaigns_per_month ?? 12),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

function normalizeCampaign(row: Record<string, unknown>): MarketingCampaignRow {
  const status = String(row.status || 'draft')
  return {
    id: String(row.id),
    store_id: String(row.store_id),
    name: String(row.name),
    body_text: String(row.body_text),
    image_url: String(row.image_url),
    audience: 'all_contacts',
    status:
      status === 'scheduled' ||
      status === 'sending' ||
      status === 'completed' ||
      status === 'cancelled' ||
      status === 'failed'
        ? status
        : 'draft',
    scheduled_at: row.scheduled_at != null ? String(row.scheduled_at) : null,
    recipient_count: Number(row.recipient_count ?? 0),
    sent_count: Number(row.sent_count ?? 0),
    failed_count: Number(row.failed_count ?? 0),
    started_at: row.started_at != null ? String(row.started_at) : null,
    completed_at: row.completed_at != null ? String(row.completed_at) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

function normalizeSend(row: Record<string, unknown>): MarketingSendRow {
  return {
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    store_id: String(row.store_id),
    customer_phone: String(row.customer_phone),
    customer_name: row.customer_name != null ? String(row.customer_name) : null,
    sent_at: String(row.sent_at || ''),
    wa_message_id: row.wa_message_id != null ? String(row.wa_message_id) : null,
    error_message: row.error_message != null ? String(row.error_message) : null,
  }
}

export async function getOrCreateMarketingConfig(
  db: SupabaseClient,
  storeId: string
): Promise<StoreMarketingConfig> {
  const { data } = await db
    .from('store_marketing_config')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle()

  if (data) return normalizeConfig(data as Record<string, unknown>)

  const { data: inserted, error } = await db
    .from('store_marketing_config')
    .insert({ store_id: storeId })
    .select('*')
    .single()

  if (error || !inserted) {
    throw new Error(error?.message || 'Falha ao criar configuração de marketing.')
  }
  return normalizeConfig(inserted as Record<string, unknown>)
}

export async function updateMarketingConfig(
  db: SupabaseClient,
  storeId: string,
  patch: Partial<Pick<StoreMarketingConfig, 'enabled' | 'cooldown_days'>>
): Promise<StoreMarketingConfig> {
  await getOrCreateMarketingConfig(db, storeId)
  const { data, error } = await db
    .from('store_marketing_config')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('store_id', storeId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Falha ao actualizar marketing.')
  }
  return normalizeConfig(data as Record<string, unknown>)
}

export async function countMarketingCampaignsThisMonth(
  db: SupabaseClient,
  storeId: string
): Promise<number> {
  const ym = currentYearMonthUtc()
  const start = `${ym}-01T00:00:00.000Z`
  const { count, error } = await db
    .from('marketing_campaigns')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .gte('created_at', start)
    .neq('status', 'cancelled')

  if (error) {
    if (error.code === '42P01') return 0
    throw new Error(error.message)
  }
  return count ?? 0
}

async function getRecentlySentPhones(
  db: SupabaseClient,
  storeId: string,
  cooldownDays: number
): Promise<Set<string>> {
  const since = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await db
    .from('marketing_sends')
    .select('customer_phone')
    .eq('store_id', storeId)
    .gte('sent_at', since)

  return new Set(
    (data || []).map((r) =>
      normalizePhoneE164(String((r as { customer_phone: string }).customer_phone))
    )
  )
}

export async function listMarketingAudience(
  db: SupabaseClient,
  storeId: string,
  cooldownDays: number,
  limit: number
): Promise<MarketingAudienceContact[]> {
  const max = Math.min(MARKETING_MAX_RECIPIENTS_PER_CAMPAIGN, Math.max(1, limit))
  const recentlySent = await getRecentlySentPhones(db, storeId, cooldownDays)

  const { data, error } = await db
    .from('store_whatsapp_contacts')
    .select('customer_phone, customer_name, first_seen_at, last_inbound_at')
    .eq('store_id', storeId)
    .eq('marketing_opt_out', false)
    .not('last_inbound_at', 'is', null)
    .order('last_inbound_at', { ascending: false, nullsFirst: false })
    .limit(500)

  if (error) {
    if (error.code === '42P01') return []
    throw new Error(error.message)
  }

  const result: MarketingAudienceContact[] = []
  for (const row of data || []) {
    const r = row as {
      customer_phone: string
      customer_name?: string | null
      first_seen_at?: string
      last_inbound_at?: string | null
    }
    const phone = normalizePhoneE164(String(r.customer_phone || ''))
    if (!phone || recentlySent.has(phone)) continue
    result.push({
      customer_phone: phone,
      customer_name: r.customer_name?.trim() || null,
      first_seen_at: String(r.first_seen_at || ''),
      last_inbound_at: r.last_inbound_at != null ? String(r.last_inbound_at) : null,
    })
    if (result.length >= max) break
  }
  return result
}

export async function getMarketingReport(
  db: SupabaseClient,
  storeId: string
): Promise<MarketingReport> {
  const config = await getOrCreateMarketingConfig(db, storeId)
  const { data: campaigns } = await db
    .from('marketing_campaigns')
    .select('sent_count, failed_count')
    .eq('store_id', storeId)

  let sends_total = 0
  let failed_total = 0
  for (const c of campaigns || []) {
    sends_total += Number((c as { sent_count?: number }).sent_count ?? 0)
    failed_total += Number((c as { failed_count?: number }).failed_count ?? 0)
  }

  const whatsapp_contacts_total = await countWhatsAppContacts(db, storeId)
  const campaigns_this_month = await countMarketingCampaignsThisMonth(db, storeId)

  return {
    campaigns_total: (campaigns || []).length,
    sends_total,
    failed_total,
    whatsapp_contacts_total,
    campaigns_this_month,
    max_campaigns_per_month: config.max_campaigns_per_month,
    max_recipients_per_campaign: config.max_recipients_per_campaign,
  }
}

export async function listMarketingCampaigns(
  db: SupabaseClient,
  storeId: string
): Promise<MarketingCampaignRow[]> {
  const { data, error } = await db
    .from('marketing_campaigns')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []).map((r) => normalizeCampaign(r as Record<string, unknown>))
}

export async function listMarketingSends(
  db: SupabaseClient,
  storeId: string,
  limit = 50
): Promise<MarketingSendRow[]> {
  const { data, error } = await db
    .from('marketing_sends')
    .select('*')
    .eq('store_id', storeId)
    .order('sent_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data || []).map((r) => normalizeSend(r as Record<string, unknown>))
}

export async function getMarketingCampaign(
  db: SupabaseClient,
  storeId: string,
  campaignId: string
): Promise<MarketingCampaignRow | null> {
  const { data, error } = await db
    .from('marketing_campaigns')
    .select('*')
    .eq('store_id', storeId)
    .eq('id', campaignId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? normalizeCampaign(data as Record<string, unknown>) : null
}

export async function createMarketingCampaign(
  db: SupabaseClient,
  storeId: string,
  input: {
    name: string
    body_text: string
    image_url: string
    scheduled_at?: string | null
  }
): Promise<MarketingCampaignRow> {
  const config = await getOrCreateMarketingConfig(db, storeId)
  if (!config.enabled) {
    throw new Error('Active o marketing nas configurações antes de criar campanhas.')
  }

  const campaignsThisMonth = await countMarketingCampaignsThisMonth(db, storeId)
  if (campaignsThisMonth >= config.max_campaigns_per_month) {
    throw new Error(
      `Limite de ${config.max_campaigns_per_month} campanhas por mês atingido.`
    )
  }

  const audience = await listMarketingAudience(
    db,
    storeId,
    config.cooldown_days,
    config.max_recipients_per_campaign
  )
  if (audience.length === 0) {
    throw new Error(
      'Nenhum contacto elegível. Os clientes precisam ter falado no WhatsApp e não ter recebido campanha recentemente.'
    )
  }

  const waConfig = await getWhatsAppConfigForStore(db, storeId)
  if (!waConfig || waConfig.status !== 'active' || !waConfig.phone_number_id) {
    throw new Error('Ligue o WhatsApp da loja antes de criar campanhas.')
  }

  const name = input.name.trim()
  const body_text = input.body_text.trim()
  const image_url = input.image_url.trim()
  if (!name) throw new Error('Informe o nome da campanha.')
  if (!body_text) throw new Error('Informe o texto da mensagem.')
  if (!image_url.startsWith('https://')) {
    throw new Error('URL da imagem inválida. Envie a imagem novamente.')
  }

  const scheduledAt = input.scheduled_at?.trim() || null
  const now = Date.now()
  const scheduledMs = scheduledAt ? new Date(scheduledAt).getTime() : now
  const status = scheduledMs > now + 30_000 ? 'scheduled' : 'scheduled'
  const effectiveScheduledAt = new Date(scheduledMs).toISOString()

  const { data, error } = await db
    .from('marketing_campaigns')
    .insert({
      store_id: storeId,
      name,
      body_text,
      image_url,
      audience: 'all_contacts',
      status,
      scheduled_at: effectiveScheduledAt,
      recipient_count: audience.length,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Falha ao criar campanha.')
  }
  return normalizeCampaign(data as Record<string, unknown>)
}

export async function cancelMarketingCampaign(
  db: SupabaseClient,
  storeId: string,
  campaignId: string
): Promise<MarketingCampaignRow> {
  const campaign = await getMarketingCampaign(db, storeId, campaignId)
  if (!campaign) throw new Error('Campanha não encontrada.')
  if (campaign.status !== 'scheduled') {
    throw new Error('Só é possível cancelar campanhas agendadas.')
  }

  const { data, error } = await db
    .from('marketing_campaigns')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId)
    .eq('store_id', storeId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Falha ao cancelar campanha.')
  }
  return normalizeCampaign(data as Record<string, unknown>)
}

function personalizeMessage(template: string, name: string | null): string {
  const nome = name?.trim() || 'cliente'
  return template.replace(/\{\{nome\}\}/g, nome)
}

export async function dispatchMarketingCampaign(
  db: SupabaseClient,
  storeId: string,
  campaignId: string
): Promise<{ sent: number; failed: number; eligible: number }> {
  const config = await getOrCreateMarketingConfig(db, storeId)
  if (!config.enabled) {
    throw new Error('Marketing desactivado para esta loja.')
  }

  const campaign = await getMarketingCampaign(db, storeId, campaignId)
  if (!campaign) throw new Error('Campanha não encontrada.')
  if (campaign.status === 'sending') throw new Error('Campanha já em envio.')
  if (campaign.status === 'completed' || campaign.status === 'cancelled') {
    throw new Error('Campanha já finalizada.')
  }

  const waConfig = await getWhatsAppConfigForStore(db, storeId)
  if (!waConfig || waConfig.status !== 'active' || !waConfig.phone_number_id) {
    throw new Error('WhatsApp não está activo para esta loja.')
  }
  const token = await getWhatsAppAccessTokenForStore(db, storeId)
  if (!token) throw new Error('Token WhatsApp indisponível.')

  const audience = await listMarketingAudience(
    db,
    storeId,
    config.cooldown_days,
    config.max_recipients_per_campaign
  )

  const now = new Date().toISOString()
  await db
    .from('marketing_campaigns')
    .update({
      status: 'sending',
      started_at: now,
      recipient_count: audience.length,
      updated_at: now,
    })
    .eq('id', campaignId)

  let sent = 0
  let failed = 0

  for (const contact of audience) {
    const caption = personalizeMessage(campaign.body_text, contact.customer_name)
    const result = await sendWhatsAppImageMessage({
      phoneNumberId: waConfig.phone_number_id,
      accessToken: token,
      toE164: contact.customer_phone,
      imageUrl: campaign.image_url,
      caption,
    })

    if (result.ok) {
      sent++
      await db.from('marketing_sends').insert({
        campaign_id: campaignId,
        store_id: storeId,
        customer_phone: contact.customer_phone,
        customer_name: contact.customer_name,
        wa_message_id: result.messageId,
      })
      await db.from('whatsapp_messages').insert({
        store_id: storeId,
        direction: 'outbound',
        wa_message_id: result.messageId,
        wa_to: contact.customer_phone,
        message_type: 'image',
        body_text: caption,
        status: 'sent',
      })
      await touchWhatsAppOutboundContact(
        db,
        storeId,
        contact.customer_phone,
        contact.customer_name
      )
    } else {
      failed++
      // marketing_sends mantém o relatório por campanha; whatsapp_send_failures unifica visibilidade no painel WhatsApp.
      await logWhatsAppSendFailure(db, {
        storeId,
        customerPhone: contact.customer_phone,
        messageType: 'image',
        flow: 'marketing',
        errorMessage: result.error,
        errorCode: result.errorCode ?? null,
        isWindowExpired: result.isWindowExpired,
      }).catch(() => undefined)
      const codeSuffix = result.errorCode != null ? ` (code ${result.errorCode})` : ''
      console.warn('[marketing whatsapp]', result.error + codeSuffix)
      await db.from('marketing_sends').insert({
        campaign_id: campaignId,
        store_id: storeId,
        customer_phone: contact.customer_phone,
        customer_name: contact.customer_name,
        error_message: result.error,
      })
    }
  }

  const completedAt = new Date().toISOString()
  await db
    .from('marketing_campaigns')
    .update({
      status: failed > 0 && sent === 0 ? 'failed' : 'completed',
      sent_count: sent,
      failed_count: failed,
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq('id', campaignId)

  return { sent, failed, eligible: audience.length }
}

export async function runDueMarketingCampaigns(
  db: SupabaseClient
): Promise<{ processed: number; sent: number; failed: number }> {
  const now = new Date().toISOString()
  const { data: due, error } = await db
    .from('marketing_campaigns')
    .select('id, store_id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(20)

  if (error) throw new Error(error.message)

  let processed = 0
  let sent = 0
  let failed = 0

  for (const row of due || []) {
    const storeId = String((row as { store_id: string }).store_id)
    const campaignId = String((row as { id: string }).id)
    try {
      const result = await dispatchMarketingCampaign(db, storeId, campaignId)
      processed++
      sent += result.sent
      failed += result.failed
    } catch (e) {
      console.warn('[marketing dispatch]', storeId, campaignId, e)
      await db
        .from('marketing_campaigns')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId)
    }
  }

  return { processed, sent, failed }
}

const OPT_OUT_PATTERN =
  /\b(sair|parar|stop|cancelar|remover|unsubscribe|opt\s*out)\b/i

export async function handleMarketingOptOutFromInbound(
  db: SupabaseClient,
  storeId: string,
  customerPhone: string,
  bodyText: string
): Promise<boolean> {
  if (!OPT_OUT_PATTERN.test(bodyText.trim())) return false
  const phone = normalizePhoneE164(customerPhone)
  if (!phone) return false

  await db
    .from('store_whatsapp_contacts')
    .update({
      marketing_opt_out: true,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', storeId)
    .eq('customer_phone', phone)

  return true
}
