import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { GraphWhatsAppSendFailure } from '@/lib/whatsapp/graph-send-result'
import {
  sendWhatsAppInteractiveListMessage,
  sendWhatsAppTemplateMessage,
  sendWhatsAppTextMessage,
} from '@/lib/whatsapp/graph-api.server'
import type { WhatsAppListRow } from '@/lib/whatsapp/interactive-menu'
import { normalizePhoneE164 } from '@/services/loyalty.server'
import { touchWhatsAppOutboundContact } from '@/services/whatsapp-contacts.server'
import {
  getWhatsAppAccessTokenForStore,
  getWhatsAppConfigForStore,
} from '@/services/whatsapp-config.server'
import {
  logWhatsAppSendFailure,
  logWhatsAppTemplateFallbackSuccess,
  type WhatsAppSendFailureMessageType,
  type WhatsAppSendFlow,
} from '@/services/whatsapp-send-failures.server'
import { getApprovedTemplateForFlow } from '@/services/whatsapp-templates.server'

type SendWhatsAppTextOptions = {
  /** Quando true (padrão), exige atendimento automático activo. */
  requireAutoReply?: boolean
  flow: WhatsAppSendFlow
  messageType?: WhatsAppSendFailureMessageType
}

async function recordOutboundSendFailure(
  db: SupabaseClient,
  storeId: string,
  toPhone: string,
  flow: WhatsAppSendFlow,
  messageType: WhatsAppSendFailureMessageType,
  failure: GraphWhatsAppSendFailure
): Promise<void> {
  const codeSuffix = failure.errorCode != null ? ` (code ${failure.errorCode})` : ''
  console.warn(`[whatsapp outbound] flow=${flow}`, failure.error + codeSuffix)
  await logWhatsAppSendFailure(db, {
    storeId,
    customerPhone: toPhone,
    messageType,
    flow,
    errorMessage: failure.error,
    errorCode: failure.errorCode ?? null,
    isWindowExpired: failure.isWindowExpired,
  }).catch(() => undefined)
}

async function sendStoreWhatsAppTextCore(
  db: SupabaseClient,
  storeId: string,
  toPhone: string,
  body: string,
  options: SendWhatsAppTextOptions
): Promise<boolean> {
  const phone = normalizePhoneE164(toPhone)
  if (!phone) return false

  const requireAutoReply = options.requireAutoReply !== false
  const flow = options.flow
  const messageType = options.messageType ?? 'text'

  const waConfig = await getWhatsAppConfigForStore(db, storeId)
  if (!waConfig || waConfig.status !== 'active' || !waConfig.phone_number_id) return false
  if (requireAutoReply && waConfig.auto_reply_enabled === false) return false

  const token = await getWhatsAppAccessTokenForStore(db, storeId)
  if (!token) return false

  const sent = await sendWhatsAppTextMessage({
    phoneNumberId: waConfig.phone_number_id,
    accessToken: token,
    toE164: phone,
    body,
  })

  if (sent.ok) {
    await db.from('whatsapp_messages').insert({
      store_id: storeId,
      direction: 'outbound',
      wa_message_id: sent.messageId,
      wa_to: phone,
      message_type: 'text',
      body_text: body,
      status: 'sent',
    })
    await touchWhatsAppOutboundContact(db, storeId, phone).catch(() => undefined)
    return true
  }

  await recordOutboundSendFailure(db, storeId, phone, flow, messageType, sent)
  return false
}

/** Mensagens transacionais (pedido, fidelidade) — independentes do atendimento automático. */
export async function sendStoreWhatsAppTransactionalText(
  db: SupabaseClient,
  storeId: string,
  toPhone: string,
  body: string,
  flow: Extract<WhatsAppSendFlow, 'order_notification' | 'loyalty'>
): Promise<boolean> {
  return sendStoreWhatsAppTextCore(db, storeId, toPhone, body, {
    requireAutoReply: false,
    flow,
    messageType: 'text',
  })
}

/**
 * Envia texto livre; se a Meta rejeitar por janela 24h expirada (131047), tenta
 * reenviar com o template aprovado do fluxo. Só usado em order_notification e loyalty.
 *
 * Fluxo robot: sem fallback — o atendimento automático só responde a inbound recente
 * (janela aberta). Marketing: sem fallback nesta etapa (campanhas usam image; template
 * reengajamento_atendimento é BODY-only — pendência conhecida).
 */
export async function sendWithWindowFallback(
  db: SupabaseClient,
  storeId: string,
  toPhone: string,
  freeTextBody: string,
  flow: Extract<WhatsAppSendFlow, 'order_notification' | 'loyalty'>,
  bodyParamsForTemplate: string[]
): Promise<boolean> {
  const phone = normalizePhoneE164(toPhone)
  if (!phone) return false

  const waConfig = await getWhatsAppConfigForStore(db, storeId)
  if (!waConfig || waConfig.status !== 'active' || !waConfig.phone_number_id) return false

  const token = await getWhatsAppAccessTokenForStore(db, storeId)
  if (!token) return false

  const sent = await sendWhatsAppTextMessage({
    phoneNumberId: waConfig.phone_number_id,
    accessToken: token,
    toE164: phone,
    body: freeTextBody,
  })

  if (sent.ok) {
    await db.from('whatsapp_messages').insert({
      store_id: storeId,
      direction: 'outbound',
      wa_message_id: sent.messageId,
      wa_to: phone,
      message_type: 'text',
      body_text: freeTextBody,
      status: 'sent',
    })
    await touchWhatsAppOutboundContact(db, storeId, phone).catch(() => undefined)
    return true
  }

  await recordOutboundSendFailure(db, storeId, phone, flow, 'text', sent)

  if (!sent.isWindowExpired) return false

  const template = await getApprovedTemplateForFlow(db, storeId, flow)
  if (!template) return false

  const templateSent = await sendWhatsAppTemplateMessage({
    phoneNumberId: waConfig.phone_number_id,
    accessToken: token,
    toE164: phone,
    templateName: template.template_name,
    language: template.language,
    bodyParams: bodyParamsForTemplate,
  })

  if (!templateSent.ok) {
    await recordOutboundSendFailure(db, storeId, phone, flow, 'text', templateSent)
    return false
  }

  await db.from('whatsapp_messages').insert({
    store_id: storeId,
    direction: 'outbound',
    wa_message_id: templateSent.messageId,
    wa_to: phone,
    message_type: 'template',
    body_text: `[template:${template.template_name}] ${bodyParamsForTemplate.join(' | ')}`,
    status: 'sent',
  })
  await logWhatsAppTemplateFallbackSuccess(db, {
    storeId,
    customerPhone: phone,
    flow,
    templateName: template.template_name,
  }).catch(() => undefined)
  await touchWhatsAppOutboundContact(db, storeId, phone).catch(() => undefined)
  return true
}

/** Respostas do atendimento automático — exige WhatsApp activo e `auto_reply_enabled`. */
export async function sendStoreWhatsAppText(
  db: SupabaseClient,
  storeId: string,
  toPhone: string,
  body: string
): Promise<boolean> {
  return sendStoreWhatsAppTextCore(db, storeId, toPhone, body, {
    requireAutoReply: true,
    flow: 'robot',
    messageType: 'text',
  })
}

export async function sendStoreWhatsAppInteractiveList(
  db: SupabaseClient,
  storeId: string,
  toPhone: string,
  input: {
    bodyText: string
    buttonLabel: string
    rows: WhatsAppListRow[]
  }
): Promise<boolean> {
  const phone = normalizePhoneE164(toPhone)
  if (!phone) return false

  const waConfig = await getWhatsAppConfigForStore(db, storeId)
  if (!waConfig || waConfig.status !== 'active' || !waConfig.phone_number_id) return false
  if (waConfig.auto_reply_enabled === false) return false

  const token = await getWhatsAppAccessTokenForStore(db, storeId)
  if (!token) return false

  const sent = await sendWhatsAppInteractiveListMessage({
    phoneNumberId: waConfig.phone_number_id,
    accessToken: token,
    toE164: phone,
    bodyText: input.bodyText,
    buttonLabel: input.buttonLabel,
    sections: [{ title: 'Atendimento', rows: input.rows }],
  })

  if (sent.ok) {
    await db.from('whatsapp_messages').insert({
      store_id: storeId,
      direction: 'outbound',
      wa_message_id: sent.messageId,
      wa_to: phone,
      message_type: 'interactive',
      body_text: input.bodyText,
      status: 'sent',
    })
    await touchWhatsAppOutboundContact(db, storeId, phone).catch(() => undefined)
    return true
  }

  await recordOutboundSendFailure(db, storeId, phone, 'robot', 'interactive', sent)
  return false
}

export async function canSendStoreWhatsApp(db: SupabaseClient, storeId: string): Promise<boolean> {
  const waConfig = await getWhatsAppConfigForStore(db, storeId)
  if (!waConfig || waConfig.status !== 'active' || !waConfig.phone_number_id) return false
  if (waConfig.auto_reply_enabled === false) return false
  const token = await getWhatsAppAccessTokenForStore(db, storeId)
  return !!token
}

export async function canSendStoreWhatsAppTransactional(
  db: SupabaseClient,
  storeId: string
): Promise<boolean> {
  const waConfig = await getWhatsAppConfigForStore(db, storeId)
  if (!waConfig || waConfig.status !== 'active' || !waConfig.phone_number_id) return false
  const token = await getWhatsAppAccessTokenForStore(db, storeId)
  return !!token
}
