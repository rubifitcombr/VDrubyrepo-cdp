export type StoreOrderRow = {
  id: string
  customer_name: string | null
  total: number | string | null
  status: string | null
  created_at: string
  source?: string | null
  delivery_address?: string | null
  /** Taxa de entrega cobrada no pedido (checkout), quando existir coluna. */
  delivery_fee?: number | string | null
  payment_method?: string | null
  payment_status?: string | null
  notes?: string | null
  customer_phone?: string | null
  items_summary?: string | null
  /** Pedido contabilizado neste turno de caixa (após «Receber e fechar»). */
  caixa_turno_id?: string | null
}

export const ORDER_SELECT =
  'id, customer_name, total, status, created_at, source, delivery_address, delivery_fee, payment_method, payment_status, notes, customer_phone, items_summary, caixa_turno_id'

export function pixPaymentStatusIsConfirmed(
  status: string | null | undefined
): boolean {
  const s = String(status ?? '').trim().toLowerCase()
  return s === 'paid' || s === 'confirmed' || s === 'approved' || s === 'completed'
}

export function orderIsVisibleAfterPixConfirmation(
  order: Pick<StoreOrderRow, 'payment_method' | 'payment_status'>
): boolean {
  const method = String(order.payment_method ?? '').trim().toLowerCase()
  return method !== 'pix' || pixPaymentStatusIsConfirmed(order.payment_status)
}

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
    source: typeof row.source === 'string' ? row.source : null,
    delivery_address:
      typeof row.delivery_address === 'string'
        ? row.delivery_address
        : null,
    delivery_fee:
      row.delivery_fee == null
        ? null
        : typeof row.delivery_fee === 'number'
          ? row.delivery_fee
          : Number(String(row.delivery_fee).replace(',', '.')) || null,
    payment_method:
      typeof row.payment_method === 'string' ? row.payment_method : null,
    payment_status:
      typeof row.payment_status === 'string' ? row.payment_status : null,
    notes: typeof row.notes === 'string' ? row.notes : null,
    customer_phone:
      typeof row.customer_phone === 'string' ? row.customer_phone : null,
    items_summary:
      typeof row.items_summary === 'string' ? row.items_summary : null,
    caixa_turno_id:
      typeof row.caixa_turno_id === 'string' ? row.caixa_turno_id : null,
  }
}
