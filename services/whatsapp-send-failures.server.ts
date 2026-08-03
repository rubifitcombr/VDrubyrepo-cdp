import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhoneE164 } from '@/services/loyalty.server'

export type WhatsAppSendFlow =
  | 'order_notification'
  | 'loyalty'
  | 'robot'
  | 'marketing'
  | 'test'

export type WhatsAppSendFailureMessageType = 'text' | 'image' | 'interactive'

export type WhatsAppSendFailureRow = {
  id: string
  store_id: string
  customer_phone: string
  customer_phone_display: string
  message_type: WhatsAppSendFailureMessageType
  flow: WhatsAppSendFlow
  error_code: number | null
  error_message: string
  is_window_expired: boolean
  created_at: string
  flow_label: string
}

export type WhatsAppSendFailureStats = {
  window_expired_24h: number
  other_errors_24h: number
}

/**
 * Auditoria de fallback bem-sucedido (reenvio via template Meta após janela 24h).
 * Reutilizamos whatsapp_send_failures com prefixo no error_message — evita migration
 * e permite contagem simples no painel (não é uma falha real).
 */
export const TEMPLATE_FALLBACK_SUCCESS_PREFIX = 'template_fallback_success:'

export function templateFallbackSuccessMessage(templateName: string): string {
  return `${TEMPLATE_FALLBACK_SUCCESS_PREFIX}${templateName}`
}

/** Mascara telefone para listagens do painel (últimos 4 dígitos visíveis). */
export function formatWhatsAppPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 4) return digits
  return `••••${digits.slice(-4)}`
}

const FLOW_LABELS_PT: Record<WhatsAppSendFlow, string> = {
  order_notification: 'Notificação de pedido',
  loyalty: 'Fidelidade pós-entrega',
  robot: 'Atendimento automático',
  marketing: 'Marketing',
  test: 'Teste de ligação',
}

export function whatsAppSendFlowLabel(flow: WhatsAppSendFlow): string {
  return FLOW_LABELS_PT[flow] ?? flow
}

function normalizeRow(row: Record<string, unknown>): WhatsAppSendFailureRow {
  const phone = String(row.customer_phone || '')
  const flow = String(row.flow || 'robot') as WhatsAppSendFlow
  const messageType = String(row.message_type || 'text') as WhatsAppSendFailureMessageType
  return {
    id: String(row.id),
    store_id: String(row.store_id),
    customer_phone: phone,
    customer_phone_display: formatWhatsAppPhoneForDisplay(phone),
    message_type:
      messageType === 'image' || messageType === 'interactive' ? messageType : 'text',
    flow:
      flow === 'order_notification' ||
      flow === 'loyalty' ||
      flow === 'robot' ||
      flow === 'marketing' ||
      flow === 'test'
        ? flow
        : 'robot',
    error_code: row.error_code != null ? Number(row.error_code) : null,
    error_message: String(row.error_message || ''),
    is_window_expired: row.is_window_expired === true,
    created_at: String(row.created_at || ''),
    flow_label: whatsAppSendFlowLabel(flow),
  }
}

export async function logWhatsAppSendFailure(
  db: SupabaseClient,
  input: {
    storeId: string
    customerPhone: string
    messageType: WhatsAppSendFailureMessageType
    flow: WhatsAppSendFlow
    errorMessage: string
    errorCode?: number | null
    isWindowExpired: boolean
  }
): Promise<void> {
  const phone = normalizePhoneE164(input.customerPhone)
  if (!phone) return

  const { error } = await db.from('whatsapp_send_failures').insert({
    store_id: input.storeId,
    customer_phone: phone,
    message_type: input.messageType,
    flow: input.flow,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage.slice(0, 2000),
    is_window_expired: input.isWindowExpired,
  })

  if (error && error.code !== '42P01') {
    console.warn('[whatsapp send failure log]', error.message)
  }
}

/** Regista envio bem-sucedido via template de fallback (auditoria, não é falha). */
export async function logWhatsAppTemplateFallbackSuccess(
  db: SupabaseClient,
  input: {
    storeId: string
    customerPhone: string
    flow: WhatsAppSendFlow
    templateName: string
  }
): Promise<void> {
  const phone = normalizePhoneE164(input.customerPhone)
  if (!phone) return

  const { error } = await db.from('whatsapp_send_failures').insert({
    store_id: input.storeId,
    customer_phone: phone,
    message_type: 'text',
    flow: input.flow,
    error_code: null,
    error_message: templateFallbackSuccessMessage(input.templateName),
    is_window_expired: false,
  })

  if (error && error.code !== '42P01') {
    console.warn('[whatsapp template fallback log]', error.message)
  }
}

/** Contagem de fallbacks bem-sucedidos por template_name nos últimos N dias. */
export async function getTemplateFallbackCounts7d(
  db: SupabaseClient,
  storeId: string
): Promise<Record<string, number>> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await db
    .from('whatsapp_send_failures')
    .select('error_message')
    .eq('store_id', storeId)
    .gte('created_at', since)
    .like('error_message', `${TEMPLATE_FALLBACK_SUCCESS_PREFIX}%`)

  if (error) {
    if (error.code === '42P01') return {}
    throw new Error(error.message)
  }

  const counts: Record<string, number> = {}
  for (const row of data || []) {
    const msg = String((row as { error_message?: string }).error_message || '')
    if (!msg.startsWith(TEMPLATE_FALLBACK_SUCCESS_PREFIX)) continue
    const templateName = msg.slice(TEMPLATE_FALLBACK_SUCCESS_PREFIX.length).trim()
    if (!templateName) continue
    counts[templateName] = (counts[templateName] ?? 0) + 1
  }
  return counts
}

export async function getWhatsAppSendFailureStats(
  db: SupabaseClient,
  storeId: string
): Promise<WhatsAppSendFailureStats> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await db
    .from('whatsapp_send_failures')
    .select('is_window_expired')
    .eq('store_id', storeId)
    .gte('created_at', since)

  if (error) {
    if (error.code === '42P01') {
      return { window_expired_24h: 0, other_errors_24h: 0 }
    }
    throw new Error(error.message)
  }

  let window_expired_24h = 0
  let other_errors_24h = 0
  for (const row of data || []) {
    if ((row as { is_window_expired?: boolean }).is_window_expired === true) {
      window_expired_24h += 1
    } else {
      other_errors_24h += 1
    }
  }

  return { window_expired_24h, other_errors_24h }
}

export async function listRecentWhatsAppSendFailures(
  db: SupabaseClient,
  storeId: string,
  limit = 20
): Promise<WhatsAppSendFailureRow[]> {
  const { data, error } = await db
    .from('whatsapp_send_failures')
    .select(
      'id, store_id, customer_phone, message_type, flow, error_code, error_message, is_window_expired, created_at'
    )
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(Math.min(50, Math.max(1, limit)))

  if (error) {
    if (error.code === '42P01') return []
    throw new Error(error.message)
  }

  return (data || []).map((row) => normalizeRow(row as Record<string, unknown>))
}
