import 'server-only'

import { createHmac, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppTextMessage } from '@/lib/whatsapp/graph-api.server'
import {
  getWhatsAppAccessTokenForStore,
  markWebhookVerified,
} from '@/services/whatsapp-config.server'

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

        // Fase 2: robô IA — por agora resposta automática simples de confirmação.
        if (bodyText && from && storeId) {
          await maybeSendAutoReply(db, storeId, from, bodyText)
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

async function maybeSendAutoReply(
  db: SupabaseClient,
  storeId: string,
  fromE164: string,
  bodyText: string
): Promise<void> {
  const { data: cfgRow } = await db
    .from('store_whatsapp_config')
    .select('ai_enabled, phone_number_id, status')
    .eq('store_id', storeId)
    .maybeSingle()

  if (!cfgRow || (cfgRow as { status?: string }).status !== 'active') return
  if ((cfgRow as { ai_enabled?: boolean }).ai_enabled === false) return

  const phoneNumberId = String((cfgRow as { phone_number_id: string }).phone_number_id)
  const token = await getWhatsAppAccessTokenForStore(db, storeId)
  if (!token) return

  const normalized = bodyText.trim().toLowerCase()
  let reply: string | null = null

  if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'].includes(normalized)) {
    reply =
      'Olá! Sou o assistente da loja. Em breve responderei com cardápio e status do pedido. Por agora, digite *menu* para receber o link ou *pedido* para consultar o último pedido.'
  } else if (normalized === 'menu' || normalized.includes('cardapio') || normalized.includes('cardápio')) {
    const { data: store } = await db
      .from('stores')
      .select('slug')
      .eq('id', storeId)
      .maybeSingle()
    const slug = (store as { slug?: string } | null)?.slug
    reply = slug
      ? `Acesse nosso cardápio: ${publicStoreUrl(slug)}`
      : 'O cardápio online estará disponível em breve.'
  } else if (normalized === 'pedido' || normalized.includes('status')) {
    reply =
      'Para consultar seu pedido, informe o número de telefone usado no pedido ou aguarde — em breve o robô consultará automaticamente.'
  } else if (
    normalized === 'pontos' ||
    normalized.includes('fidelidade') ||
    normalized.includes('cashback')
  ) {
    const { data: loyaltyCfg } = await db
      .from('store_loyalty_config')
      .select('enabled, whatsapp_balance_enabled')
      .eq('store_id', storeId)
      .maybeSingle()
    const enabled =
      (loyaltyCfg as { enabled?: boolean } | null)?.enabled === true &&
      (loyaltyCfg as { whatsapp_balance_enabled?: boolean } | null)
        ?.whatsapp_balance_enabled !== false
    if (!enabled) {
      reply = 'O programa de fidelidade desta loja ainda não está activo.'
    } else {
      const phone = fromE164.replace(/\D/g, '')
      const { data: account } = await db
        .from('loyalty_accounts')
        .select('points_balance')
        .eq('store_id', storeId)
        .eq('customer_phone', phone)
        .maybeSingle()
      const balance = Number(
        (account as { points_balance?: number } | null)?.points_balance ?? 0
      )
      reply =
        balance > 0
          ? `Você tem *${balance} pontos* de fidelidade. Use no próximo pedido pelo nosso cardápio.`
          : 'Você ainda não tem pontos. Faça um pedido para começar a acumular!'
    }
  }

  if (!reply) return

  const sent = await sendWhatsAppTextMessage({
    phoneNumberId,
    accessToken: token,
    toE164: fromE164,
    body: reply,
  })

  if (sent.ok) {
    await db.from('whatsapp_messages').insert({
      store_id: storeId,
      direction: 'outbound',
      wa_message_id: sent.messageId,
      wa_to: fromE164,
      message_type: 'text',
      body_text: reply,
      status: 'sent',
    })
  }
}

function publicStoreUrl(slug: string): string {
  const base =
    process.env.VYRIA_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_VYRIA_PUBLIC_URL?.trim() ||
    ''
  if (base) return `${base.replace(/\/$/, '')}/${slug}`
  return `/${slug}`
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
