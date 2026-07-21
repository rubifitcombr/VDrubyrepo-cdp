import 'server-only'

import type { OrderPaymentLine, OrderPaymentRow } from '@/lib/order-payments'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function insertOrderPayments(
  supabase: SupabaseClient,
  opts: {
    storeId: string
    orderId: string
    turnoId: string
    lines: OrderPaymentLine[]
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = opts.lines.map((line) => ({
    store_id: opts.storeId,
    order_id: opts.orderId,
    payment_method: line.method,
    amount_brl: line.amount,
    caixa_turno_id: opts.turnoId,
  }))

  const { error } = await supabase.from('order_payments').insert(rows)
  if (error) {
    const msg = error.message ?? ''
    if (/order_payments|relation|does not exist/i.test(msg)) {
      return {
        ok: false,
        error:
          'Tabela order_payments em falta. Aplica a migração 20260720140000_order_split_payments.sql no Supabase.',
      }
    }
    return { ok: false, error: msg || 'Não foi possível gravar os pagamentos.' }
  }
  return { ok: true }
}

export async function getOrderPaymentsForStore(
  supabase: SupabaseClient,
  storeId: string,
  opts?: { turnoId?: string; orderIds?: string[] }
): Promise<OrderPaymentRow[]> {
  let q = supabase
    .from('order_payments')
    .select('id, order_id, payment_method, amount_brl, caixa_turno_id')
    .eq('store_id', storeId)

  if (opts?.turnoId) q = q.eq('caixa_turno_id', opts.turnoId)
  if (opts?.orderIds?.length) q = q.in('order_id', opts.orderIds)

  const { data, error } = await q
  if (error) {
    if (/order_payments|relation|does not exist/i.test(error.message ?? '')) return []
    console.error('[order-payments] list:', error.message)
    return []
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    order_id: String(row.order_id),
    payment_method: String(row.payment_method),
    amount_brl: Number(row.amount_brl) || 0,
    caixa_turno_id:
      typeof row.caixa_turno_id === 'string' ? row.caixa_turno_id : null,
  }))
}

export async function deleteOrderPaymentsForOrder(
  supabase: SupabaseClient,
  storeId: string,
  orderId: string
): Promise<void> {
  await supabase
    .from('order_payments')
    .delete()
    .eq('store_id', storeId)
    .eq('order_id', orderId)
}
