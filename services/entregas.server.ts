import 'server-only'

import type { EntregaDTO } from '@/lib/entregas-types'
import type { SupabaseClient } from '@supabase/supabase-js'

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function mapEntrega(row: Record<string, unknown>): EntregaDTO {
  return {
    id: String(row.id ?? ''),
    store_id: String(row.store_id ?? ''),
    order_id: String(row.order_id ?? ''),
    entregador_id:
      typeof row.entregador_id === 'string' && row.entregador_id
        ? row.entregador_id
        : null,
    entregador_nome: String(row.entregador_nome ?? '').trim() || '—',
    valor_corrida: num(row.valor_corrida),
    valor_recebido_cliente: num(row.valor_recebido_cliente),
    forma_pagamento_entrega:
      typeof row.forma_pagamento_entrega === 'string'
        ? row.forma_pagamento_entrega
        : null,
    turno_id:
      typeof row.turno_id === 'string' && row.turno_id ? row.turno_id : null,
    observacao: typeof row.observacao === 'string' ? row.observacao : null,
    criado_em:
      typeof row.criado_em === 'string' ? row.criado_em : new Date().toISOString(),
    acerto_movimentacao_id:
      typeof row.acerto_movimentacao_id === 'string' ? row.acerto_movimentacao_id : null,
    acertado_em: typeof row.acertado_em === 'string' ? row.acertado_em : null,
  }
}

export async function getEntregaByOrderId(
  svc: SupabaseClient,
  storeId: string,
  orderId: string
): Promise<EntregaDTO | null> {
  const { data, error } = await svc
    .from('entregas')
    .select('*')
    .eq('store_id', storeId)
    .eq('order_id', orderId)
    .maybeSingle()

  if (error) {
    if (/relation|does not exist|42P01/i.test(error.message)) return null
    console.error('[entregas] by order:', error.message)
    return null
  }
  if (!data) return null
  return mapEntrega(data as Record<string, unknown>)
}

export async function listEntregasForTurno(
  svc: SupabaseClient,
  storeId: string,
  turnoId: string
): Promise<EntregaDTO[]> {
  const { data, error } = await svc
    .from('entregas')
    .select('*')
    .eq('store_id', storeId)
    .eq('turno_id', turnoId)
    .order('criado_em', { ascending: true })

  if (error) {
    if (/relation|does not exist|42P01/i.test(error.message)) return []
    console.error('[entregas] list turno:', error.message)
    return []
  }
  return (data ?? []).map((r) => mapEntrega(r as Record<string, unknown>))
}

export type EntregasListFilter = {
  turnoId?: string | null
  /** ms desde epoch */
  fromMs?: number | null
  entregadorId?: string | null
  /** saldo linha != 0 */
  pendenteSaldo?: boolean
}

export async function listEntregasForStore(
  svc: SupabaseClient,
  storeId: string,
  filter: EntregasListFilter
): Promise<EntregaDTO[]> {
  let q = svc.from('entregas').select('*').eq('store_id', storeId)

  if (filter.turnoId) {
    q = q.eq('turno_id', filter.turnoId)
  }
  if (filter.fromMs != null && filter.fromMs > 0) {
    q = q.gte('criado_em', new Date(filter.fromMs).toISOString())
  }
  if (filter.entregadorId) {
    q = q.eq('entregador_id', filter.entregadorId)
  }

  const { data, error } = await q.order('criado_em', { ascending: false })

  if (error) {
    if (/relation|does not exist|42P01/i.test(error.message)) return []
    console.error('[entregas] list store:', error.message)
    return []
  }
  let rows = (data ?? []).map((r) => mapEntrega(r as Record<string, unknown>))
  if (filter.pendenteSaldo) {
    rows = rows.filter(
      (e) =>
        !e.acertado_em &&
        Math.abs(e.valor_recebido_cliente - e.valor_corrida) >= 0.005
    )
  }
  return rows
}

export type InsertEntregaInput = {
  order_id: string
  entregador_id: string | null
  entregador_nome: string
  valor_corrida: number
  valor_recebido_cliente: number
  forma_pagamento_entrega: string | null
  turno_id: string | null
  observacao: string | null
}

export async function insertEntrega(
  svc: SupabaseClient,
  storeId: string,
  input: InsertEntregaInput
): Promise<EntregaDTO> {
  const { data, error } = await svc
    .from('entregas')
    .insert({
      store_id: storeId,
      order_id: input.order_id,
      entregador_id: input.entregador_id,
      entregador_nome: input.entregador_nome.trim(),
      valor_corrida: input.valor_corrida,
      valor_recebido_cliente: input.valor_recebido_cliente,
      forma_pagamento_entrega: input.forma_pagamento_entrega,
      turno_id: input.turno_id,
      observacao: input.observacao?.trim() || null,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Erro ao registar entrega.')
  return mapEntrega(data as Record<string, unknown>)
}

export async function deleteEntregaById(
  svc: SupabaseClient,
  storeId: string,
  id: string
): Promise<void> {
  const { error } = await svc.from('entregas').delete().eq('id', id).eq('store_id', storeId)
  if (error) throw new Error(error.message)
}

export async function getEntregasByIds(
  svc: SupabaseClient,
  storeId: string,
  ids: string[]
): Promise<EntregaDTO[]> {
  const unique = [...new Set(ids.filter((id) => id.trim()))]
  if (unique.length === 0) return []

  const { data, error } = await svc
    .from('entregas')
    .select('*')
    .eq('store_id', storeId)
    .in('id', unique)

  if (error) {
    if (/relation|does not exist|42P01/i.test(error.message)) return []
    throw new Error(error.message)
  }
  return (data ?? []).map((r) => mapEntrega(r as Record<string, unknown>))
}

export async function markEntregasAsSettled(
  svc: SupabaseClient,
  storeId: string,
  entregaIds: string[],
  movimentacaoId: string
): Promise<void> {
  if (entregaIds.length === 0) return
  const now = new Date().toISOString()
  const { error } = await svc
    .from('entregas')
    .update({
      acerto_movimentacao_id: movimentacaoId,
      acertado_em: now,
    })
    .eq('store_id', storeId)
    .in('id', entregaIds)

  if (error && !/column.*does not exist/i.test(error.message)) {
    throw new Error(error.message)
  }
}
