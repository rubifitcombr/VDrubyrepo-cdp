import 'server-only'

import { createHmac, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppTextMessage } from '@/lib/whatsapp/graph-api.server'
import {
  getWhatsAppAccessTokenForStore,
  markWebhookVerified,
} from '@/services/whatsapp-config.server'
import { logWhatsAppSendFailure } from '@/services/whatsapp-send-failures.server'
import { handleInboundWhatsAppCustomerMessage } from '@/services/whatsapp-inbound.server'
import { registerWhatsAppInboundContact } from '@/services/whatsapp-contacts.server'
import { handleMarketingOptOutFromInbound } from '@/services/marketing.server'
import { handleCoexistenceWebhookField } from '@/services/whatsapp-coexistence-webhook.server'
import { handleWhatsAppTemplateStatusWebhook } from '@/services/whatsapp-templates.server'
import { normalizePhoneE164 } from '@/services/loyalty.server'

export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.META_APP_SECRET?.trim()
  if (!secret || !signatureHeader?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const received = signatureHeader.slice('sha256='.length)
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  } catch {
    return false
  }
}

export function parseMetaWebhookPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {}
  return raw as Record<string, unknown>
}

export async function processWhatsAppWebhook(
  db: SupabaseClient,
  payload: Record<string, unknown>
): Promise<void> {
  const entries = Array.isArray(payload.entry) ? payload.entry : []
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const wabaId = (entry as { id?: unknown }).id != null ? String((entry as { id: unknown }).id) : null
    const changes = Array.isArray((entry as { changes?: unknown }).changes)
      ? (entry as { changes: unknown[] }).changes
      : []

    for (const change of changes) {
      if (!change || typeof change !== 'object') continue
      const field = String((change as { field?: unknown }).field || '')
      const value = (change as { value?: unknown }).value
      if (!value || typeof value !== 'object') continue
      const val = value as Record<string, unknown>

      if (field === 'message_template_status_update') {
        await db.from('whatsapp_webhook_events').insert({
          store_id: null,
          event_type: field,
          payload: val,
        })
        await handleWhatsAppTemplateStatusWebhook(db, wabaId, val)
        continue
      }

      const metadata = val.metadata as Record<string, unknown> | undefined
      const phoneNumberId =
        metadata?.phone_number_id != null
          ? String(metadata.phone_number_id)
          : null

      if (
        field === 'smb_message_echoes' ||
        field === 'smb_app_state_sync' ||
        field === 'history'
      ) {
        const coexistenceStoreId = await handleCoexistenceWebhookField(
          db,
          field,
          val,
          phoneNumberId,
          null
        )

        await db.from('whatsapp_webhook_events').insert({
          store_id: coexistenceStoreId,
          event_type: field,
          payload: val,
        })

        if (coexistenceStoreId) {
          await markWebhookVerified(db, coexistenceStoreId)
        }
        continue
      }

      let storeId: string | null = null
      if (phoneNumberId) {
        const { data } = await db
          .from('store_whatsapp_config')
          .select('store_id')
          .eq('phone_number_id', phoneNumberId)
          .eq('status', 'active')
          .maybeSingle()
        storeId = data ? String((data as { store_id: string }).store_id) : null
      }

      await db.from('whatsapp_webhook_events').insert({
        store_id: storeId,
        event_type: String((change as { field?: unknown }).field || 'unknown'),
        payload: val,
      })

      if (storeId) {
        await markWebhookVerified(db, storeId)
      }

      const messages = Array.isArray(val.messages) ? val.messages : []
      for (const msg of messages) {
        if (!msg || typeof msg !== 'object') continue
        const m = msg as Record<string, unknown>
        const waMessageId = m.id != null ? String(m.id) : null
        const from = m.from != null ? String(m.from) : null
        const type = m.type != null ? String(m.type) : 'text'
        let bodyText: string | null = null
        let listReplyId: string | null = null
        if (type === 'text') {
          const text = m.text as { body?: string } | undefined
          bodyText = text?.body != null ? String(text.body) : null
        } else if (type === 'interactive') {
          const interactive = m.interactive as
            | {
                type?: string
                list_reply?: { id?: string; title?: string }
              }
            | undefined
          if (interactive?.type === 'list_reply' && interactive.list_reply) {
            listReplyId =
              interactive.list_reply.id != null
                ? String(interactive.list_reply.id)
                : null
            bodyText =
              interactive.list_reply.title != null
                ? String(interactive.list_reply.title)
                : listReplyId
          }
        }

        if (!storeId || !waMessageId) continue

        const contacts = Array.isArray(val.contacts) ? val.contacts : []
        let contactName: string | null = null
        for (const c of contacts) {
          if (!c || typeof c !== 'object') continue
          const profile = (c as { profile?: { name?: string } }).profile
          const waId = (c as { wa_id?: string }).wa_id
          if (from && waId && normalizePhoneE164(String(waId)) === normalizePhoneE164(from)) {
            contactName = profile?.name?.trim() || contactName
          }
          if (!contactName && profile?.name) {
            contactName = profile.name.trim()
          }
        }

        const { error } = await db.from('whatsapp_messages').insert({
          store_id: storeId,
          direction: 'inbound',
          wa_message_id: waMessageId,
          wa_from: from,
          message_type: type,
          body_text: bodyText,
          payload: m,
          status: 'received',
        })

        if (error && !error.message.includes('duplicate')) {
          console.warn('[whatsapp-webhook] insert message:', error.message)
        }

        // Regista todo contacto inbound; atendimento automático responde a texto e listas.
        if (from && storeId) {
          const registration = await registerWhatsAppInboundContact(db, {
            store_id: storeId,
            customer_phone: from,
            customer_name: contactName,
          }).catch((e) => {
            console.warn('[whatsapp contact]', e)
            return { isNewSession: false }
          })

          const hasPayload = !!(bodyText?.trim() || listReplyId)
          if (hasPayload) {
            const optedOut = bodyText
              ? await handleMarketingOptOutFromInbound(db, storeId, from, bodyText).catch(
                  () => false
                )
              : false
            if (!optedOut) {
              await handleInboundWhatsAppCustomerMessage(db, storeId, from, {
                bodyText,
                listReplyId,
                isNewSession: registration.isNewSession,
                customerName: contactName,
              })
            }
          }
        }
      }

      const statuses = Array.isArray(val.statuses) ? val.statuses : []
      for (const st of statuses) {
        if (!st || typeof st !== 'object') continue
        const s = st as Record<string, unknown>
        const waMessageId = s.id != null ? String(s.id) : null
        const status = s.status != null ? String(s.status) : null
        if (!storeId || !waMessageId) continue
        await db
          .from('whatsapp_messages')
          .update({ status })
          .eq('store_id', storeId)
          .eq('wa_message_id', waMessageId)
      }
    }
  }
}

export async function sendWhatsAppTestMessage(
  db: SupabaseClient,
  storeId: string,
  toE164: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: cfg } = await db
    .from('store_whatsapp_config')
    .select('phone_number_id, status')
    .eq('store_id', storeId)
    .maybeSingle()

  if (!cfg || (cfg as { status?: string }).status !== 'active') {
    return { ok: false, error: 'WhatsApp não está activo para esta loja.' }
  }

  const token = await getWhatsAppAccessTokenForStore(db, storeId)
  if (!token) {
    return { ok: false, error: 'Token de acesso não encontrado.' }
  }

  const sent = await sendWhatsAppTextMessage({
    phoneNumberId: String((cfg as { phone_number_id: string }).phone_number_id),
    accessToken: token,
    toE164,
    body: 'Teste Vyria Master — a ligação WhatsApp está activa.',
  })

  if (!sent.ok) {
    const codeSuffix = sent.errorCode != null ? ` (code ${sent.errorCode})` : ''
    console.warn('[whatsapp test]', sent.error + codeSuffix)
    await logWhatsAppSendFailure(db, {
      storeId,
      customerPhone: toE164,
      messageType: 'text',
      flow: 'test',
      errorMessage: sent.error,
      errorCode: sent.errorCode ?? null,
      isWindowExpired: sent.isWindowExpired,
    }).catch(() => undefined)
    return sent
  }

  await db.from('whatsapp_messages').insert({
    store_id: storeId,
    direction: 'outbound',
    wa_message_id: sent.messageId,
    wa_to: toE164.replace(/\D/g, ''),
    message_type: 'text',
    body_text: 'Teste Vyria Master — a ligação WhatsApp está activa.',
    status: 'sent',
  })

  await markWebhookVerified(db, storeId)

  return { ok: true }
}
