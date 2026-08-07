import type { SupabaseClient } from '@supabase/supabase-js'
import { CAIXA_PAYMENT_CLOSE_MARKER } from '@/lib/cashier-comanda-close'
import { GARCOM_PAYMENT_CLOSE_MARKER } from '@/lib/waiter-order-notes'

export type OrderCloseRollbackPatch = {
  status: string | null
  payment_method: string | null
  notes: string | null
  caixa_turno_id: string | null
}

/** Reverte fecho de comanda no caixa só se o claim de pagamento ainda estiver activo. */
export async function rollbackCashierOrderCloseClaim(
  db: SupabaseClient,
  storeId: string,
  orderId: string,
  patch: OrderCloseRollbackPatch
): Promise<boolean> {
  const { data, error } = await db
    .from('orders')
    .update({
      status: patch.status,
      payment_method: patch.payment_method,
      notes: patch.notes,
      caixa_turno_id: patch.caixa_turno_id,
    })
    .eq('store_id', storeId)
    .eq('id', orderId)
    .eq('status', 'delivered')
    .ilike('notes', `%${CAIXA_PAYMENT_CLOSE_MARKER}%`)
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(error.message || 'Erro ao reverter fecho da comanda.')
  }

  return Boolean(data?.id)
}

/** Reverte recebimento imediato do garçom só se o marcador de pagamento ainda existir. */
export async function rollbackWaiterOrderCloseClaim(
  db: SupabaseClient,
  storeId: string,
  orderId: string,
  patch: OrderCloseRollbackPatch
): Promise<boolean> {
  const { data, error } = await db
    .from('orders')
    .update({
      status: patch.status,
      payment_method: patch.payment_method,
      notes: patch.notes,
      caixa_turno_id: patch.caixa_turno_id,
    })
    .eq('store_id', storeId)
    .eq('id', orderId)
    .eq('status', 'delivered')
    .ilike('notes', `%${GARCOM_PAYMENT_CLOSE_MARKER}%`)
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(error.message || 'Erro ao reverter pagamento do garçom.')
  }

  return Boolean(data?.id)
}
