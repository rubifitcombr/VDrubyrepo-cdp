import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { isWhatsAppNewSession } from '@/lib/whatsapp/session'
import { normalizePhoneE164 } from '@/services/loyalty.server'

export type WhatsAppContactRow = {
  store_id: string
  customer_phone: string
  customer_name: string | null
  first_seen_at: string
  last_inbound_at: string | null
  last_outbound_at: string | null
  last_order_at: string | null
  marketing_opt_out: boolean
  conversation_status: 'auto' | 'humano'
  source: string
  inbound_count: number
  created_at: string
  updated_at: string
}

export type WhatsAppInboundRegistration = {
  isNewSession: boolean
}

function normalizeConversationStatus(value: unknown): 'auto' | 'humano' {
  return value === 'humano' ? 'humano' : 'auto'
}

function normalizeRow(row: Record<string, unknown>): WhatsAppContactRow {
  return {
    store_id: String(row.store_id),
    customer_phone: String(row.customer_phone),
    customer_name: row.customer_name != null ? String(row.customer_name) : null,
    first_seen_at: String(row.first_seen_at || ''),
    last_inbound_at: row.last_inbound_at != null ? String(row.last_inbound_at) : null,
    last_outbound_at: row.last_outbound_at != null ? String(row.last_outbound_at) : null,
    last_order_at: row.last_order_at != null ? String(row.last_order_at) : null,
    marketing_opt_out: row.marketing_opt_out === true,
    conversation_status: normalizeConversationStatus(row.conversation_status),
    source: String(row.source || 'whatsapp'),
    inbound_count: Number(row.inbound_count ?? 0),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

/** Regista ou actualiza contacto quando o cliente envia mensagem no WhatsApp. */
export async function registerWhatsAppInboundContact(
  db: SupabaseClient,
  input: {
    store_id: string
    customer_phone: string
    customer_name?: string | null
  }
): Promise<WhatsAppInboundRegistration> {
  const phone = normalizePhoneE164(input.customer_phone)
  if (!phone) return { isNewSession: false }

  const now = new Date().toISOString()
  const name = input.customer_name?.trim() || null

  const { data: existing } = await db
    .from('store_whatsapp_contacts')
    .select('customer_name, inbound_count, first_seen_at, last_inbound_at')
    .eq('store_id', input.store_id)
    .eq('customer_phone', phone)
    .maybeSingle()

  const prev = existing as {
    customer_name?: string | null
    inbound_count?: number
    first_seen_at?: string
    last_inbound_at?: string | null
  } | null

  const isNewSession = !prev || isWhatsAppNewSession(prev.last_inbound_at)

  await db.from('store_whatsapp_contacts').upsert(
    {
      store_id: input.store_id,
      customer_phone: phone,
      customer_name: name || prev?.customer_name || null,
      first_seen_at: prev?.first_seen_at || now,
      last_inbound_at: now,
      inbound_count: Number(prev?.inbound_count ?? 0) + 1,
      source: 'whatsapp',
      updated_at: now,
    },
    { onConflict: 'store_id,customer_phone' }
  )

  return { isNewSession }
}

/** Actualiza último envio outbound (marketing, robô, notificações). */
export async function touchWhatsAppOutboundContact(
  db: SupabaseClient,
  storeId: string,
  customerPhone: string,
  customerName?: string | null
): Promise<void> {
  const phone = normalizePhoneE164(customerPhone)
  if (!phone) return

  const now = new Date().toISOString()
  const { data: existing } = await db
    .from('store_whatsapp_contacts')
    .select('customer_name, first_seen_at, inbound_count')
    .eq('store_id', storeId)
    .eq('customer_phone', phone)
    .maybeSingle()

  const prev = existing as {
    customer_name?: string | null
    first_seen_at?: string
    inbound_count?: number
  } | null

  await db.from('store_whatsapp_contacts').upsert(
    {
      store_id: storeId,
      customer_phone: phone,
      customer_name: customerName?.trim() || prev?.customer_name || null,
      first_seen_at: prev?.first_seen_at || now,
      last_outbound_at: now,
      inbound_count: Number(prev?.inbound_count ?? 0),
      source: prev ? 'whatsapp' : 'outbound',
      updated_at: now,
    },
    { onConflict: 'store_id,customer_phone' }
  )
}

/** Sincroniza nome/telefone a partir de pedidos (enriquece CRM). */
export async function syncWhatsAppContactFromOrder(
  db: SupabaseClient,
  input: {
    store_id: string
    customer_phone: string
    customer_name?: string | null
    order_at: string
  }
): Promise<void> {
  const phone = normalizePhoneE164(input.customer_phone)
  if (!phone) return

  const now = new Date().toISOString()
  const { data: existing } = await db
    .from('store_whatsapp_contacts')
    .select('customer_name, first_seen_at, last_inbound_at, inbound_count')
    .eq('store_id', input.store_id)
    .eq('customer_phone', phone)
    .maybeSingle()

  const prev = existing as {
    customer_name?: string | null
    first_seen_at?: string
    last_inbound_at?: string | null
    inbound_count?: number
  } | null

  const orderAt = input.order_at || now

  await db.from('store_whatsapp_contacts').upsert(
    {
      store_id: input.store_id,
      customer_phone: phone,
      customer_name: input.customer_name?.trim() || prev?.customer_name || null,
      first_seen_at: prev?.first_seen_at || orderAt,
      last_inbound_at: prev?.last_inbound_at ?? null,
      last_order_at: orderAt,
      inbound_count: Number(prev?.inbound_count ?? 0),
      source: prev?.last_inbound_at ? 'whatsapp' : 'order',
      updated_at: now,
    },
    { onConflict: 'store_id,customer_phone' }
  )
}

export async function listWhatsAppContacts(
  db: SupabaseClient,
  storeId: string,
  limit = 100
): Promise<WhatsAppContactRow[]> {
  const { data, error } = await db
    .from('store_whatsapp_contacts')
    .select('*')
    .eq('store_id', storeId)
    .order('last_inbound_at', { ascending: false, nullsFirst: false })
    .limit(Math.min(500, Math.max(1, limit)))

  if (error) {
    if (error.code === '42P01' || /store_whatsapp_contacts/i.test(error.message)) {
      return []
    }
    throw new Error(error.message)
  }

  return (data || []).map((r) => normalizeRow(r as Record<string, unknown>))
}

export async function countWhatsAppContacts(
  db: SupabaseClient,
  storeId: string
): Promise<number> {
  const { count, error } = await db
    .from('store_whatsapp_contacts')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId)

  if (error) {
    if (error.code === '42P01') return 0
    throw new Error(error.message)
  }
  return count ?? 0
}

export type WhatsAppContactState = {
  marketing_opt_out: boolean
  conversation_status: 'auto' | 'humano'
  customer_name: string | null
}

export async function getWhatsAppContactState(
  db: SupabaseClient,
  storeId: string,
  customerPhone: string
): Promise<WhatsAppContactState | null> {
  const phone = normalizePhoneE164(customerPhone)
  if (!phone) return null

  const { data, error } = await db
    .from('store_whatsapp_contacts')
    .select('marketing_opt_out, conversation_status, customer_name')
    .eq('store_id', storeId)
    .eq('customer_phone', phone)
    .maybeSingle()

  if (error || !data) return null

  const row = data as Record<string, unknown>
  return {
    marketing_opt_out: row.marketing_opt_out === true,
    conversation_status: normalizeConversationStatus(row.conversation_status),
    customer_name: row.customer_name != null ? String(row.customer_name) : null,
  }
}

export async function pauseWhatsAppConversationForHuman(
  db: SupabaseClient,
  storeId: string,
  customerPhone: string
): Promise<void> {
  const phone = normalizePhoneE164(customerPhone)
  if (!phone) return

  await db
    .from('store_whatsapp_contacts')
    .update({
      conversation_status: 'humano',
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', storeId)
    .eq('customer_phone', phone)
}
