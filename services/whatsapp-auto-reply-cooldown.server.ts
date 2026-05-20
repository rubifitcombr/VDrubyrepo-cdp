import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { shouldSkipAutoReply } from '@/services/whatsapp-sender.server'

/** Resposta automática com link do cardápio: no máximo 1x a cada 3 horas por número. */
export const WHATSAPP_MENU_AUTO_REPLY_COOLDOWN_MS = 3 * 60 * 60 * 1000

function normalizePhone(input: string): string {
  return input.replace(/\D/g, '')
}

function isMissingCooldownTable(message: string | undefined): boolean {
  const m = message ?? ''
  return (
    /whatsapp_auto_reply_cooldowns/i.test(m) &&
    (/does not exist|relation|42P01|PGRST205/i.test(m))
  )
}

/**
 * Devolve true se já respondeu a este número dentro do cooldown (não deve enviar de novo).
 */
export async function isWhatsAppMenuAutoReplyOnCooldown(
  supabase: SupabaseClient,
  storeId: string,
  phone: string,
  cooldownMs: number = WHATSAPP_MENU_AUTO_REPLY_COOLDOWN_MS
): Promise<boolean> {
  const phoneNorm = normalizePhone(phone)
  if (!phoneNorm) return true

  const { data, error } = await supabase
    .from('whatsapp_auto_reply_cooldowns')
    .select('last_replied_at')
    .eq('store_id', storeId)
    .eq('phone', phoneNorm)
    .maybeSingle()

  if (error) {
    if (isMissingCooldownTable(error.message)) {
      console.warn(
        '[whatsapp] Tabela whatsapp_auto_reply_cooldowns em falta; usa cooldown em memória (não persiste no Vercel).'
      )
      return shouldSkipAutoReply(`${storeId}:${phoneNorm}`, cooldownMs)
    }
    console.error('[whatsapp] cooldown read:', error.message)
    return shouldSkipAutoReply(`${storeId}:${phoneNorm}`, cooldownMs)
  }

  if (!data?.last_replied_at) return false

  const last = new Date(String(data.last_replied_at)).getTime()
  if (!Number.isFinite(last)) return false

  return Date.now() - last < cooldownMs
}

/** Regista envio da resposta automática (chamar após envio bem-sucedido). */
export async function recordWhatsAppMenuAutoReply(
  supabase: SupabaseClient,
  storeId: string,
  phone: string
): Promise<void> {
  const phoneNorm = normalizePhone(phone)
  if (!phoneNorm) return

  const now = new Date().toISOString()
  const { error } = await supabase.from('whatsapp_auto_reply_cooldowns').upsert(
    {
      store_id: storeId,
      phone: phoneNorm,
      last_replied_at: now,
    },
    { onConflict: 'store_id,phone' }
  )

  if (error && !isMissingCooldownTable(error.message)) {
    console.error('[whatsapp] cooldown write:', error.message)
  }
}

/**
 * Reserva o slot antes do envio (evita duplicar se o webhook chegar em rajada).
 * Devolve true se pode enviar agora.
 */
export async function tryAcquireWhatsAppMenuAutoReplySlot(
  supabase: SupabaseClient,
  storeId: string,
  phone: string,
  cooldownMs: number = WHATSAPP_MENU_AUTO_REPLY_COOLDOWN_MS
): Promise<boolean> {
  if (await isWhatsAppMenuAutoReplyOnCooldown(supabase, storeId, phone, cooldownMs)) {
    return false
  }

  const phoneNorm = normalizePhone(phone)
  const now = new Date().toISOString()
  const { error } = await supabase.from('whatsapp_auto_reply_cooldowns').upsert(
    {
      store_id: storeId,
      phone: phoneNorm,
      last_replied_at: now,
    },
    { onConflict: 'store_id,phone' }
  )

  if (error) {
    if (isMissingCooldownTable(error.message)) {
      return !shouldSkipAutoReply(`${storeId}:${phoneNorm}`, cooldownMs)
    }
    console.error('[whatsapp] cooldown acquire:', error.message)
    return !shouldSkipAutoReply(`${storeId}:${phoneNorm}`, cooldownMs)
  }

  return true
}
