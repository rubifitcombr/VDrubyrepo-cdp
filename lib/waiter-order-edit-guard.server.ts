import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  GARCOM_PAYMENT_CLOSE_MARKER,
  isSalonMapOrderSource,
  notesIndicateWaiterReleasedToCaixa,
  WAITER_PENDING_CAIXA_MARKER,
} from '@/lib/waiter-order-notes'

export const WAITER_SALON_EDITABLE_STATUSES = [
  'pending',
  'preparing',
  'ready',
  'confirmed',
] as const

const EDITABLE_SET = new Set<string>(WAITER_SALON_EDITABLE_STATUSES)

/** Comanda de salão ainda editável pelo garçom (sem handoff ao caixa / fecho). */
export function isWaiterSalonOrderEditable(order: {
  status?: string | null
  notes?: string | null
  source?: string | null
}): boolean {
  if (!isSalonMapOrderSource(order.source)) return true
  const st = String(order.status ?? '').trim().toLowerCase()
  if (!EDITABLE_SET.has(st)) return false
  if (notesIndicateWaiterReleasedToCaixa(order.notes)) return false
  if (String(order.notes ?? '').includes(GARCOM_PAYMENT_CLOSE_MARKER)) return false
  return true
}

/**
 * Claim atómico antes de alterar order_items / stock.
 * Mesmas condições do PATCH final (handoff, cancelado, entregue).
 */
export async function claimWaiterSalonOrderForEdit(
  db: SupabaseClient,
  orderId: string,
  storeId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data, error } = await db
    .from('orders')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('store_id', storeId)
    .in('status', [...WAITER_SALON_EDITABLE_STATUSES])
    .neq('status', 'cancelled')
    .neq('status', 'delivered')
    .not('notes', 'ilike', `%${WAITER_PENDING_CAIXA_MARKER}%`)
    .not('notes', 'ilike', `%${GARCOM_PAYMENT_CLOSE_MARKER}%`)
    .select('id')
    .maybeSingle()

  if (error) {
    return { ok: false, status: 500, error: error.message || 'Erro ao reservar comanda.' }
  }
  if (!data) {
    return {
      ok: false,
      status: 409,
      error:
        'Esta comanda já foi encaminhada ao Caixa ou encerrada e não pode ser editada.',
    }
  }
  return { ok: true }
}
