import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createWhatsAppMessageTemplate } from '@/lib/whatsapp/graph-api.server'
import type { WhatsAppSendFlow } from '@/services/whatsapp-send-failures.server'
import { getTemplateFallbackCounts7d } from '@/services/whatsapp-send-failures.server'

export type WhatsAppTemplateCategory = 'utility' | 'marketing'
export type WhatsAppTemplateStatus = 'pending' | 'approved' | 'rejected'

export type StoreWhatsAppTemplateRow = {
  id: string
  store_id: string
  template_name: string
  template_label: string
  category: WhatsAppTemplateCategory
  language: string
  status: WhatsAppTemplateStatus
  meta_template_id: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  fallback_count_7d: number
}

type DefaultTemplateDef = {
  template_name: string
  category: WhatsAppTemplateCategory
  apiCategory: 'UTILITY' | 'MARKETING'
  body: string
  example: string[]
}

export const DEFAULT_WHATSAPP_TEMPLATES: DefaultTemplateDef[] = [
  {
    template_name: 'notificacao_pedido_status',
    category: 'utility',
    apiCategory: 'UTILITY',
    body: 'Olá {{1}}! Seu pedido #{{2}} está: {{3}}. Acompanhe pelo cardápio: {{4}}',
    example: ['Maria', 'A1B2C3D4', 'Em preparação', 'https://minhaloja.vyria.app'],
  },
  {
    template_name: 'fidelidade_pontos_creditados',
    category: 'utility',
    apiCategory: 'UTILITY',
    body: 'Olá {{1}}! Você ganhou {{2}} pontos no pedido #{{3}}. Seu saldo total: {{4}} pontos.',
    example: ['João', '25', 'B2C3D4E5', '120'],
  },
  {
    template_name: 'reengajamento_atendimento',
    category: 'marketing',
    apiCategory: 'MARKETING',
    body: 'Olá {{1}}! Faz um tempo que não conversamos. Confira nosso cardápio: {{2}}',
    example: ['Ana', 'https://minhaloja.vyria.app'],
  },
]

const TEMPLATE_LABELS_PT: Record<string, string> = {
  notificacao_pedido_status: 'Notificação de pedido',
  fidelidade_pontos_creditados: 'Fidelidade — pontos creditados',
  reengajamento_atendimento: 'Reengajamento',
}

export function whatsAppTemplateLabel(templateName: string): string {
  return TEMPLATE_LABELS_PT[templateName] ?? templateName
}

export function whatsAppTemplateStatusLabel(status: WhatsAppTemplateStatus): string {
  switch (status) {
    case 'approved':
      return 'Aprovado'
    case 'rejected':
      return 'Rejeitado'
    default:
      return 'Em análise (Meta)'
  }
}

function normalizeCategory(value: unknown): WhatsAppTemplateCategory {
  return value === 'marketing' ? 'marketing' : 'utility'
}

function normalizeStatus(value: unknown): WhatsAppTemplateStatus {
  if (value === 'approved' || value === 'rejected') return value
  return 'pending'
}

function normalizeRow(
  row: Record<string, unknown>,
  fallbackCounts: Record<string, number>
): StoreWhatsAppTemplateRow {
  const templateName = String(row.template_name || '')
  return {
    id: String(row.id),
    store_id: String(row.store_id),
    template_name: templateName,
    template_label: whatsAppTemplateLabel(templateName),
    category: normalizeCategory(row.category),
    language: String(row.language || 'pt_BR'),
    status: normalizeStatus(row.status),
    meta_template_id: row.meta_template_id != null ? String(row.meta_template_id) : null,
    rejection_reason: row.rejection_reason != null ? String(row.rejection_reason) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    fallback_count_7d: fallbackCounts[templateName] ?? 0,
  }
}

/** Mapeamento fluxo de envio → template Meta padrão (BODY-only). */
export const WHATSAPP_FLOW_TEMPLATE_NAMES: Partial<
  Record<WhatsAppSendFlow, (typeof DEFAULT_WHATSAPP_TEMPLATES)[number]['template_name']>
> = {
  order_notification: 'notificacao_pedido_status',
  loyalty: 'fidelidade_pontos_creditados',
  robot: 'reengajamento_atendimento',
  // marketing: pendência — campanhas usam image; template atual é BODY-only.
  // test: mensagem de teste de ligação, sem fallback.
}

export type ApprovedWhatsAppTemplate = {
  template_name: string
  language: string
  meta_template_id: string | null
}

export async function getApprovedTemplateForFlow(
  db: SupabaseClient,
  storeId: string,
  flow: WhatsAppSendFlow
): Promise<ApprovedWhatsAppTemplate | null> {
  const templateName = WHATSAPP_FLOW_TEMPLATE_NAMES[flow]
  if (!templateName) return null

  const { data, error } = await db
    .from('store_whatsapp_templates')
    .select('template_name, language, status, meta_template_id')
    .eq('store_id', storeId)
    .eq('template_name', templateName)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01') return null
    console.warn('[whatsapp templates] getApprovedTemplateForFlow:', error.message)
    return null
  }

  if (!data || normalizeStatus((data as { status?: unknown }).status) !== 'approved') {
    return null
  }

  return {
    template_name: String((data as { template_name: string }).template_name),
    language: String((data as { language?: string }).language || 'pt_BR'),
    meta_template_id:
      (data as { meta_template_id?: string | null }).meta_template_id != null
        ? String((data as { meta_template_id: string }).meta_template_id)
        : null,
  }
}

async function upsertStoreWhatsAppTemplate(
  db: SupabaseClient,
  input: {
    storeId: string
    templateName: string
    category: WhatsAppTemplateCategory
    language: string
    status: WhatsAppTemplateStatus
    metaTemplateId?: string | null
    rejectionReason?: string | null
  }
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db.from('store_whatsapp_templates').upsert(
    {
      store_id: input.storeId,
      template_name: input.templateName,
      category: input.category,
      language: input.language,
      status: input.status,
      meta_template_id: input.metaTemplateId ?? null,
      rejection_reason: input.rejectionReason ?? null,
      updated_at: now,
    },
    { onConflict: 'store_id,template_name' }
  )
  if (error && error.code !== '42P01') {
    console.warn('[whatsapp templates] upsert:', error.message)
  }
}

/**
 * Cria os 3 templates padrão na Meta e regista em store_whatsapp_templates.
 * Best-effort — falhas não devem bloquear a conexão WhatsApp da loja.
 */
export async function createDefaultWhatsAppTemplates(
  db: SupabaseClient,
  storeId: string,
  wabaId: string,
  accessToken: string
): Promise<void> {
  const language = 'pt_BR'

  for (const def of DEFAULT_WHATSAPP_TEMPLATES) {
    try {
      const created = await createWhatsAppMessageTemplate({
        wabaId,
        accessToken,
        name: def.template_name,
        language,
        category: def.apiCategory,
        bodyText: def.body,
        bodyExample: def.example,
      })

      if (created.ok) {
        await upsertStoreWhatsAppTemplate(db, {
          storeId,
          templateName: def.template_name,
          category: def.category,
          language,
          status: 'pending',
          metaTemplateId: created.templateId,
          rejectionReason: null,
        })
        continue
      }

      if (created.alreadyExists) {
        console.warn(
          `[whatsapp templates] ${def.template_name} já existe no WABA ${wabaId} — mantendo registo local.`
        )
        await upsertStoreWhatsAppTemplate(db, {
          storeId,
          templateName: def.template_name,
          category: def.category,
          language,
          status: 'pending',
          metaTemplateId: null,
          rejectionReason: null,
        })
        continue
      }

      console.warn(
        `[whatsapp templates] falha ao criar ${def.template_name}:`,
        created.error
      )
      await upsertStoreWhatsAppTemplate(db, {
        storeId,
        templateName: def.template_name,
        category: def.category,
        language,
        status: 'rejected',
        metaTemplateId: null,
        rejectionReason: created.error,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[whatsapp templates] erro em ${def.template_name}:`, msg)
      await upsertStoreWhatsAppTemplate(db, {
        storeId,
        templateName: def.template_name,
        category: def.category,
        language,
        status: 'rejected',
        metaTemplateId: null,
        rejectionReason: msg,
      })
    }
  }
}

export async function listStoreWhatsAppTemplates(
  db: SupabaseClient,
  storeId: string
): Promise<StoreWhatsAppTemplateRow[]> {
  const { data, error } = await db
    .from('store_whatsapp_templates')
    .select(
      'id, store_id, template_name, category, language, status, meta_template_id, rejection_reason, created_at, updated_at'
    )
    .eq('store_id', storeId)
    .order('template_name', { ascending: true })

  if (error) {
    if (error.code === '42P01') return []
    throw new Error(error.message)
  }

  const fallbackCounts = await getTemplateFallbackCounts7d(db, storeId)
  return (data || []).map((row) =>
    normalizeRow(row as Record<string, unknown>, fallbackCounts)
  )
}

function mapMetaTemplateEventToStatus(event: string): WhatsAppTemplateStatus {
  const normalized = event.trim().toUpperCase()
  if (normalized === 'APPROVED') return 'approved'
  if (normalized === 'REJECTED') return 'rejected'
  return 'pending'
}

function buildRejectionReason(value: Record<string, unknown>): string | null {
  const parts: string[] = []
  const reason = value.reason != null ? String(value.reason).trim() : ''
  if (reason) parts.push(reason)

  const rejectionInfo = value.rejection_info as Record<string, unknown> | undefined
  if (rejectionInfo) {
    const detail = rejectionInfo.reason != null ? String(rejectionInfo.reason).trim() : ''
    const recommendation =
      rejectionInfo.recommendation != null ? String(rejectionInfo.recommendation).trim() : ''
    if (detail) parts.push(detail)
    if (recommendation) parts.push(recommendation)
  }

  const otherInfo = value.other_info as Record<string, unknown> | undefined
  if (otherInfo) {
    const title = otherInfo.title != null ? String(otherInfo.title).trim() : ''
    const description =
      otherInfo.description != null ? String(otherInfo.description).trim() : ''
    if (title) parts.push(title)
    if (description) parts.push(description)
  }

  const unique = [...new Set(parts.filter(Boolean))]
  return unique.length > 0 ? unique.join(' — ') : null
}

/**
 * Webhook message_template_status_update — actualiza status local por WABA + nome.
 */
export async function handleWhatsAppTemplateStatusWebhook(
  db: SupabaseClient,
  wabaId: string | null,
  value: Record<string, unknown>
): Promise<void> {
  if (!wabaId) return

  const templateName =
    value.message_template_name != null ? String(value.message_template_name).trim() : ''
  if (!templateName) return

  const event = value.event != null ? String(value.event) : ''
  const status = mapMetaTemplateEventToStatus(event)
  const metaTemplateId =
    value.message_template_id != null ? String(value.message_template_id) : null
  const rejectionReason = buildRejectionReason(value)

  const { data: stores, error } = await db
    .from('store_whatsapp_config')
    .select('store_id')
    .eq('waba_id', wabaId)
    .eq('status', 'active')

  if (error) {
    if (error.code !== '42P01') {
      console.warn('[whatsapp template webhook] lookup store:', error.message)
    }
    return
  }

  const now = new Date().toISOString()
  for (const row of stores || []) {
    const storeId = String((row as { store_id: string }).store_id)
    const categoryRaw =
      value.message_template_category != null
        ? String(value.message_template_category).toLowerCase()
        : 'utility'

    const { data: existing, error: lookupError } = await db
      .from('store_whatsapp_templates')
      .select('id, category')
      .eq('store_id', storeId)
      .eq('template_name', templateName)
      .maybeSingle()

    if (lookupError?.code === '42P01') return

    if (existing) {
      const patch: Record<string, unknown> = {
        status,
        updated_at: now,
      }
      if (metaTemplateId) patch.meta_template_id = metaTemplateId
      if (status === 'rejected' && rejectionReason) {
        patch.rejection_reason = rejectionReason
      } else if (status === 'approved') {
        patch.rejection_reason = null
      }

      const { error: updateError } = await db
        .from('store_whatsapp_templates')
        .update(patch)
        .eq('store_id', storeId)
        .eq('template_name', templateName)

      if (updateError) {
        console.warn('[whatsapp template webhook] update:', updateError.message)
      }
      continue
    }

    await upsertStoreWhatsAppTemplate(db, {
      storeId,
      templateName,
      category: categoryRaw === 'marketing' ? 'marketing' : 'utility',
      language:
        value.message_template_language != null
          ? String(value.message_template_language)
          : 'pt_BR',
      status,
      metaTemplateId,
      rejectionReason: status === 'rejected' ? rejectionReason : null,
    })
  }
}
