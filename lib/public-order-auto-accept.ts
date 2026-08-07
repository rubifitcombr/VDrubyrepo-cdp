import type { SupabaseClient } from '@supabase/supabase-js'

/** Aceita pedido público pendente (pending → preparing). Idempotente sob concorrência. */
export async function acceptPublicOrderIfPending(
  db: SupabaseClient,
  storeId: string,
  orderId: string
): Promise<boolean> {
  const { data: rows, error } = await db
    .from('orders')
    .update({ status: 'preparing' })
    .eq('id', orderId)
    .eq('store_id', storeId)
    .eq('status', 'pending')
    .select('id')

  if (error) {
    throw new Error(error.message || 'Erro ao aceitar pedido.')
  }

  return (rows?.length ?? 0) > 0
}
