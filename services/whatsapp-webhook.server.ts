import 'server-only'

import { createHmac, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppTextMessage } from '@/lib/whatsapp/graph-api.server'
import {
  getWhatsAppAccessTokenForStore,
  markWebhookVerified,
} from '@/services/whatsapp-config.server'
import { handleInboundWhatsAppCustomerMessage } from '@/services/whatsapp-inbound.server'

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
    const changes = Array.isArray((entry as { changes?: unknown }).changes)
      ? (entry as { changes: unknown[] }).changes
      : []

    for (const change of changes) {
      if (!change || typeof change !== 'object') continue
      const value = (change as { value?: unknown }).value
      if (!value || typeof value !== 'object') continue
      const val = value as Record<string, unknown>

      const metadata = val.metadata as Record<string, unknown> | undefined
      const phoneNumberId =
        metadata?.phone_number_id != null
          ? String(metadata.phone_number_id)
          : null

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
        if (type === 'text') {
          const text = m.text as { body?: string } | undefined
          bodyText = text?.body != null ? String(text.body) : null
        }

        if (!storeId || !waMessageId) continue

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

        // Assistente virtual (IA) — atendimento profissional; pedidos só pelo cardápio.
        if (bodyText && from && storeId) {
          await handleInboundWhatsAppCustomerMessage(db, storeId, from, bodyText)
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

  if (!sent.ok) return sent

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
