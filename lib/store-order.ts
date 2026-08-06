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
  entregador_id?: string | null
  entregador_nome?: string | null
  entrega_despachada_em?: string | null
  entrega_prazo_minutos?: number | null
  garcom_id?: string | null
  garcom_nome?: string | null
  service_fee_brl?: number | string | null
}

export const ORDER_SELECT =
  'id, customer_name, total, status, created_at, source, delivery_address, delivery_fee, payment_method, payment_status, notes, customer_phone, items_summary, caixa_turno_id, entregador_id, entregador_nome, entrega_despachada_em, entrega_prazo_minutos, garcom_id, garcom_nome, service_fee_brl'

/** Janela do pull operacional no painel (poll + Realtime) — alinhado ao SSR default. */
export const OPERATIONAL_ORDERS_PULL_LIMIT = 150

/** Dias de histórico no pull automático; busca manual de pedidos antigos fica fora do poll. */
export const OPERATIONAL_ORDERS_PULL_DAYS = 7

export function operationalOrdersPullSinceIso(): string {
  return new Date(Date.now() - OPERATIONAL_ORDERS_PULL_DAYS * 86400000).toISOString()
}

export function pixPaymentStatusIsConfirmed(
  status: string | null | undefined
): boolean {
  const s = String(status ?? '').trim().toLowerCase()
  return (
    s === 'paid' ||
    s === 'confirmed' ||
    s === 'approved' ||
    s === 'completed' ||
    s === 'customer_reported'
  )
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
    entregador_id:
      typeof row.entregador_id === 'string' ? row.entregador_id : null,
    entregador_nome:
      typeof row.entregador_nome === 'string' ? row.entregador_nome : null,
    entrega_despachada_em:
      typeof row.entrega_despachada_em === 'string'
        ? row.entrega_despachada_em
        : null,
    entrega_prazo_minutos:
      row.entrega_prazo_minutos == null
        ? null
        : typeof row.entrega_prazo_minutos === 'number'
          ? row.entrega_prazo_minutos
          : Number(row.entrega_prazo_minutos) || null,
    garcom_id: typeof row.garcom_id === 'string' ? row.garcom_id : null,
    garcom_nome:
      typeof row.garcom_nome === 'string' ? row.garcom_nome : null,
    service_fee_brl:
      row.service_fee_brl == null
        ? null
        : typeof row.service_fee_brl === 'number'
          ? row.service_fee_brl
          : Number(String(row.service_fee_brl).replace(',', '.')) || null,
  }
}

/** Preserva cancelamentos locais quando o pull ainda não reflectiu a API (race Realtime). */
export function mergeOperationalOrdersPull(
  prev: StoreOrderRow[],
  pulled: StoreOrderRow[]
): StoreOrderRow[] {
  const pulledById = new Map(pulled.map((o) => [o.id, o]))
  const merged: StoreOrderRow[] = []
  const seen = new Set<string>()

  for (const o of prev) {
    if (String(o.status ?? '').trim().toLowerCase() !== 'cancelled') continue
    const remote = pulledById.get(o.id)
    if (remote && String(remote.status ?? '').trim().toLowerCase() !== 'cancelled') {
      merged.push(o)
      seen.add(o.id)
    }
  }

  for (const o of pulled) {
    if (seen.has(o.id)) continue
    merged.push(o)
    seen.add(o.id)
  }

  return merged.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}
