import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhoneE164 } from '@/services/loyalty.server'

function extractTextBody(msg: Record<string, unknown>): string | null {
  const type = msg.type != null ? String(msg.type) : 'text'
  if (type === 'text') {
    const text = msg.text as { body?: string } | undefined
    return text?.body != null ? String(text.body) : null
  }
  if (type === 'interactive') {
    const interactive = msg.interactive as
      | { list_reply?: { title?: string }; button_reply?: { title?: string } }
      | undefined
    return (
      interactive?.list_reply?.title?.trim() ||
      interactive?.button_reply?.title?.trim() ||
      null
    )
  }
  return null
}

async function resolveStoreIdByPhoneNumberId(
  db: SupabaseClient,
  phoneNumberId: string | null
): Promise<string | null> {
  if (!phoneNumberId) return null
  const { data } = await db
    .from('store_whatsapp_config')
    .select('store_id')
    .eq('phone_number_id', phoneNumberId)
    .eq('status', 'active')
    .maybeSingle()
  return data ? String((data as { store_id: string }).store_id) : null
}

async function insertWhatsAppMessage(
  db: SupabaseClient,
  input: {
    store_id: string
    direction: 'inbound' | 'outbound'
    wa_message_id: string
    wa_from: string | null
    wa_to: string | null
    message_type: string
    body_text: string | null
    status: string
    payload: Record<string, unknown>
  }
): Promise<void> {
  const { error } = await db.from('whatsapp_messages').insert({
    store_id: input.store_id,
    direction: input.direction,
    wa_message_id: input.wa_message_id,
    wa_from: input.wa_from,
    wa_to: input.wa_to,
    message_type: input.message_type,
    body_text: input.body_text,
    payload: input.payload,
    status: input.status,
  })
  if (error && !error.message.includes('duplicate')) {
    console.warn('[whatsapp-coexistence] insert message:', error.message)
  }
}

export async function handleCoexistenceWebhookField(
  db: SupabaseClient,
  field: string,
  val: Record<string, unknown>,
  phoneNumberId: string | null,
  storeId: string | null
): Promise<string | null> {
  let resolvedStoreId = storeId
  if (!resolvedStoreId) {
    resolvedStoreId = await resolveStoreIdByPhoneNumberId(db, phoneNumberId)
  }
  if (!resolvedStoreId) return null

  if (field === 'smb_message_echoes') {
    const echoes = Array.isArray(val.message_echoes) ? val.message_echoes : []
    for (const echo of echoes) {
      if (!echo || typeof echo !== 'object') continue
      const m = echo as Record<string, unknown>
      const waMessageId = m.id != null ? String(m.id) : null
      if (!waMessageId) continue
      const type = m.type != null ? String(m.type) : 'text'
      await insertWhatsAppMessage(db, {
        store_id: resolvedStoreId,
        direction: 'outbound',
        wa_message_id: waMessageId,
        wa_from: m.from != null ? String(m.from) : null,
        wa_to: m.to != null ? String(m.to) : null,
        message_type: type,
        body_text: extractTextBody(m),
        status: 'echo',
        payload: m,
      })
    }
    return resolvedStoreId
  }

  if (field === 'smb_app_state_sync') {
    const syncRows = Array.isArray(val.state_sync) ? val.state_sync : []
    for (const row of syncRows) {
      if (!row || typeof row !== 'object') continue
      const sync = row as Record<string, unknown>
      if (sync.type !== 'contact') continue
      const action = sync.action != null ? String(sync.action) : 'add'
      const contact = sync.contact as
        | { phone_number?: string; full_name?: string; first_name?: string }
        | undefined
      const phone = contact?.phone_number?.trim()
      if (!phone || action === 'remove') continue

      const name =
        contact?.full_name?.trim() || contact?.first_name?.trim() || null
      const e164 = normalizePhoneE164(phone)

      await db
        .from('store_whatsapp_contacts')
        .upsert(
          {
            store_id: resolvedStoreId,
            customer_phone: e164,
            customer_name: name,
            source: 'whatsapp',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'store_id,customer_phone' }
        )
        .then(({ error }) => {
          if (error) console.warn('[whatsapp-coexistence] contact sync:', error.message)
        })
    }
    return resolvedStoreId
  }

  if (field === 'history') {
    const historyChunks = Array.isArray(val.history) ? val.history : []
    const metadata = val.metadata as { display_phone_number?: string } | undefined
    const businessDigits = metadata?.display_phone_number?.replace(/\D/g, '') || null

    for (const chunk of historyChunks) {
      if (!chunk || typeof chunk !== 'object') continue
      const threads = Array.isArray((chunk as { threads?: unknown }).threads)
        ? ((chunk as { threads: unknown[] }).threads ?? [])
        : []

      for (const thread of threads) {
        if (!thread || typeof thread !== 'object') continue
        const threadId =
          (thread as { id?: string }).id != null
            ? String((thread as { id: string }).id)
            : null
        const messages = Array.isArray((thread as { messages?: unknown }).messages)
          ? ((thread as { messages: unknown[] }).messages ?? [])
          : []

        for (const msg of messages) {
          if (!msg || typeof msg !== 'object') continue
          const m = msg as Record<string, unknown>
          const waMessageId = m.id != null ? String(m.id) : null
          if (!waMessageId) continue

          const fromDigits = m.from != null ? String(m.from).replace(/\D/g, '') : null
          const isOutbound =
            businessDigits && fromDigits
              ? fromDigits === businessDigits ||
                fromDigits.endsWith(businessDigits) ||
                businessDigits.endsWith(fromDigits)
              : false

          const type = m.type != null ? String(m.type) : 'text'
          if (type === 'media_placeholder') continue

          await insertWhatsAppMessage(db, {
            store_id: resolvedStoreId,
            direction: isOutbound ? 'outbound' : 'inbound',
            wa_message_id: waMessageId,
            wa_from: m.from != null ? String(m.from) : null,
            wa_to: m.to != null ? String(m.to) : threadId,
            message_type: type,
            body_text: extractTextBody(m),
            status: 'history',
            payload: m,
          })
        }
      }
    }
    return resolvedStoreId
  }

  return resolvedStoreId
}
