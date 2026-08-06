import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { ORDER_SELECT, mapStoreOrderRow } from '@/lib/store-order'

function normalizeKey(raw: unknown): string | null {
  const key = String(raw ?? '').trim()
  if (!key || key.length > 120) return null
  return key
}

export async function findWaiterOrderByIdempotencyKey(
  db: SupabaseClient,
  storeId: string,
  rawKey: unknown
): Promise<{ orderId: string } | null> {
  const idempotencyKey = normalizeKey(rawKey)
  if (!idempotencyKey) return null

  const { data, error } = await db
    .from('waiter_order_idempotency')
    .select('order_id')
    .eq('store_id', storeId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  if (error) {
    if (/waiter_order_idempotency|does not exist|42P01/i.test(error.message ?? '')) {
      return null
    }
    throw new Error(error.message || 'Erro ao verificar idempotência.')
  }

  const orderId = data?.order_id != null ? String(data.order_id) : ''
  return orderId ? { orderId } : null
}

export async function recordWaiterOrderIdempotency(
  db: SupabaseClient,
  storeId: string,
  rawKey: unknown,
  orderId: string
): Promise<void> {
  const idempotencyKey = normalizeKey(rawKey)
  if (!idempotencyKey) return

  const { error } = await db.from('waiter_order_idempotency').insert({
    store_id: storeId,
    idempotency_key: idempotencyKey,
    order_id: orderId,
  })

  if (error && !/duplicate|unique/i.test(error.message ?? '')) {
    console.warn('[waiter idempotency] insert:', error.message)
  }
}

export async function loadWaiterOrderForStore(
  db: SupabaseClient,
  storeId: string,
  orderId: string
) {
  const { data, error } = await db
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (error || !data) return null
  return mapStoreOrderRow(data as Record<string, unknown>)
}
