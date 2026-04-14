export type StoreOrderRow = {
  id: string
  customer_name: string | null
  total: number | string | null
  status: string | null
  created_at: string
  delivery_address?: string | null
  payment_method?: string | null
  notes?: string | null
  customer_phone?: string | null
  items_summary?: string | null
}

export const ORDER_SELECT =
  'id, customer_name, total, status, created_at, delivery_address, payment_method, notes, customer_phone, items_summary'

/** Mapeia linha Supabase / payload Realtime para o tipo do painel. */
export function mapStoreOrderRow(row: Record<string, unknown>): StoreOrderRow {
  return {
    id: String(row.id ?? ''),
    customer_name:
      typeof row.customer_name === 'string' ? row.customer_name : null,
    total:
      typeof row.total === 'number'
        ? row.total
        : typeof row.total === 'string'
          ? row.total
          : null,
    status: typeof row.status === 'string' ? row.status : null,
    created_at:
      typeof row.created_at === 'string'
        ? row.created_at
        : new Date().toISOString(),
    delivery_address:
      typeof row.delivery_address === 'string'
        ? row.delivery_address
        : null,
    payment_method:
      typeof row.payment_method === 'string' ? row.payment_method : null,
    notes: typeof row.notes === 'string' ? row.notes : null,
    customer_phone:
      typeof row.customer_phone === 'string' ? row.customer_phone : null,
    items_summary:
      typeof row.items_summary === 'string' ? row.items_summary : null,
  }
}
