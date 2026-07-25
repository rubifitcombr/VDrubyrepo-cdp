import type { SupabaseClient } from '@supabase/supabase-js'
import { ORDER_SELECT, type StoreOrderRow } from '@/lib/store-order'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export type AdminStoreOrdersResult = {
  orders: StoreOrderRow[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export async function fetchStoreOrdersForAdmin(
  svc: SupabaseClient,
  storeId: string,
  opts?: { page?: number; limit?: number }
): Promise<AdminStoreOrdersResult> {
  const page = Math.max(1, opts?.page ?? 1)
  const limit = Math.min(MAX_LIMIT, Math.max(1, opts?.limit ?? DEFAULT_LIMIT))
  const from = (page - 1) * limit
  const to = from + limit - 1

  const { count, error: countError } = await svc
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)

  if (countError) {
    throw new Error(countError.message || 'Erro ao contar pedidos.')
  }

  const { data, error } = await svc
    .from('orders')
    .select(ORDER_SELECT)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    throw new Error(error.message || 'Erro ao carregar pedidos.')
  }

  const total = count ?? 0
  return {
    orders: (data ?? []) as StoreOrderRow[],
    total,
    page,
    limit,
    hasMore: from + (data?.length ?? 0) < total,
  }
}
