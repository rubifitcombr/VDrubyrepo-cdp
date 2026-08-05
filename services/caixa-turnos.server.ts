import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  aggregateTurnClosedOrders,
  type CaixaPaymentBreakdown,
} from '@/lib/caixa-payments'
import { isPaidInCaixaTurno } from '@/lib/cashier-comanda-close'
import { mapStoreOrderRow, type StoreOrderRow } from '@/lib/store-order'
import { getOrderPaymentsForStore } from '@/services/order-payments.server'

export type CaixaTurnoRow = {
  id: string
  store_id: string
  operador: string
  fundo_inicial: number
  aberto_em: string
  fechado_em: string | null
  status: 'aberto' | 'fechado'
  total_dinheiro: number
  total_pix: number
  total_cartao: number
  total_credito: number
  total_geral: number
  total_informado_dinheiro: number | null
  total_informado_pix: number | null
  total_informado_cartao: number | null
  total_informado_credito: number | null
  pedidos_fechados_count: number
  diferenca: number
  fundo_proximo_turno: number | null
}

export type CaixaMovimentacaoRow = {
  id: string
  store_id: string
  turno_id: string
  tipo: 'suprimento' | 'sangria' | 'acerto_entregador'
  valor: number
  motivo: string | null
  operador: string | null
  criado_em: string
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

function mapTurno(row: Record<string, unknown>): CaixaTurnoRow {
  return {
    id: String(row.id ?? ''),
    store_id: String(row.store_id ?? ''),
    operador: String(row.operador ?? ''),
    fundo_inicial: num(row.fundo_inicial),
    aberto_em:
      typeof row.aberto_em === 'string' ? row.aberto_em : new Date().toISOString(),
    fechado_em: typeof row.fechado_em === 'string' ? row.fechado_em : null,
    status: row.status === 'fechado' ? 'fechado' : 'aberto',
    total_dinheiro: num(row.total_dinheiro),
    total_pix: num(row.total_pix),
    total_cartao: num(row.total_cartao),
    total_credito: num(row.total_credito),
    total_geral: num(row.total_geral),
    total_informado_dinheiro:
      row.total_informado_dinheiro == null ? null : num(row.total_informado_dinheiro),
    total_informado_pix:
      row.total_informado_pix == null ? null : num(row.total_informado_pix),
    total_informado_cartao:
      row.total_informado_cartao == null ? null : num(row.total_informado_cartao),
    total_informado_credito:
      row.total_informado_credito == null ? null : num(row.total_informado_credito),
    pedidos_fechados_count: Math.round(num(row.pedidos_fechados_count)),
    diferenca: num(row.diferenca),
    fundo_proximo_turno:
      row.fundo_proximo_turno == null ? null : num(row.fundo_proximo_turno),
  }
}

function mapMovTipo(raw: string): CaixaMovimentacaoRow['tipo'] {
  const t = raw.trim().toLowerCase()
  if (t === 'sangria') return 'sangria'
  if (t === 'acerto_entregador') return 'acerto_entregador'
  return 'suprimento'
}

function mapMov(row: Record<string, unknown>): CaixaMovimentacaoRow {
  const tipo = String(row.tipo ?? '')
  return {
    id: String(row.id ?? ''),
    store_id: String(row.store_id ?? ''),
    turno_id: String(row.turno_id ?? ''),
    tipo: mapMovTipo(tipo),
    valor: num(row.valor),
    motivo: typeof row.motivo === 'string' ? row.motivo : null,
    operador: typeof row.operador === 'string' ? row.operador : null,
    criado_em:
      typeof row.criado_em === 'string' ? row.criado_em : new Date().toISOString(),
  }
}

export async function getOpenCaixaTurno(
  supabase: SupabaseClient,
  storeId: string
): Promise<CaixaTurnoRow | null> {
  const { data, error } = await supabase
    .from('caixas_turnos')
    .select('*')
    .eq('store_id', storeId)
    .eq('status', 'aberto')
    .maybeSingle()

  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message)) return null
    console.error('[caixa] getOpenCaixaTurno:', error.message)
    return null
  }
  if (!data || typeof data !== 'object') return null
  return mapTurno(data as Record<string, unknown>)
}

export async function getCaixaTurnosHistorico(
  supabase: SupabaseClient,
  storeId: string,
  limit = 10
): Promise<CaixaTurnoRow[]> {
  const { data, error } = await supabase
    .from('caixas_turnos')
    .select('*')
    .eq('store_id', storeId)
    .eq('status', 'fechado')
    .order('fechado_em', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message)) return []
    console.error('[caixa] getCaixaTurnosHistorico:', error.message)
    return []
  }
  return (data ?? []).map((r) => mapTurno(r as Record<string, unknown>))
}

export async function getMovimentacoesForTurno(
  supabase: SupabaseClient,
  turnoId: string
): Promise<CaixaMovimentacaoRow[]> {
  const { data, error } = await supabase
    .from('caixa_movimentacoes')
    .select('*')
    .eq('turno_id', turnoId)
    .order('criado_em', { ascending: true })

  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message)) return []
    console.error('[caixa] getMovimentacoesForTurno:', error.message)
    return []
  }
  return (data ?? []).map((r) => mapMov(r as Record<string, unknown>))
}

export async function getMovimentacoesForTurnos(
  supabase: SupabaseClient,
  turnoIds: string[]
): Promise<Record<string, CaixaMovimentacaoRow[]>> {
  if (!turnoIds.length) return {}
  const { data, error } = await supabase
    .from('caixa_movimentacoes')
    .select('*')
    .in('turno_id', turnoIds)
    .order('criado_em', { ascending: true })

  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message)) return {}
    console.error('[caixa] getMovimentacoesForTurnos:', error.message)
    return {}
  }
  const out: Record<string, CaixaMovimentacaoRow[]> = {}
  for (const r of data ?? []) {
    const m = mapMov(r as Record<string, unknown>)
    if (!out[m.turno_id]) out[m.turno_id] = []
    out[m.turno_id].push(m)
  }
  return out
}

function isPaidInCaixaTurnoOrder(order: {
  status?: string | null
  notes?: string | null
}): boolean {
  return isPaidInCaixaTurno(order)
}

/** Pedidos do turno já pagos/fechados (para totais em tempo real). */
export async function getClosedOrdersForTurno(
  supabase: SupabaseClient,
  storeId: string,
  turnoId: string
): Promise<StoreOrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, customer_name, total, status, created_at, source, delivery_address, payment_method, notes, customer_phone, items_summary, caixa_turno_id'
    )
    .eq('store_id', storeId)
    .eq('caixa_turno_id', turnoId)
    .neq('status', 'cancelled')

  if (error) {
    console.error('[caixa] getClosedOrdersForTurno:', error.message)
    return []
  }
  return (data ?? [])
    .filter((row) => isPaidInCaixaTurnoOrder(row as { status?: string; notes?: string }))
    .map((row) => mapStoreOrderRow(row as Record<string, unknown>))
}

export function breakdownFromOrderRows(
  rows: Array<{ id?: string; total: unknown; payment_method?: string | null }>,
  splitPayments: Array<{
    order_id: string
    payment_method: string
    amount_brl: number
  }> = []
) {
  return aggregateTurnClosedOrders(rows, splitPayments)
}

/** Totais do turno: pedidos entregues ou com pagamento registado + splits. */
export async function breakdownForTurno(
  supabase: SupabaseClient,
  storeId: string,
  turnoId: string
): Promise<CaixaPaymentBreakdown> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, total, payment_method, notes, status')
    .eq('store_id', storeId)
    .eq('caixa_turno_id', turnoId)
    .neq('status', 'cancelled')

  if (error) {
    console.error('[caixa] breakdownForTurno:', error.message)
    return aggregateTurnClosedOrders([])
  }

  const rows = (data ?? []).filter((row) =>
    isPaidInCaixaTurno(row as { status?: string; notes?: string })
  )
  const splits = await getOrderPaymentsForStore(supabase, storeId, { turnoId })
  return aggregateTurnClosedOrders(rows, splits)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Saldo em dinheiro físico estimado (fundo + vendas dinheiro + suprimentos − sangrias). */
export async function computeSaldoDinheiroDisponivel(
  supabase: SupabaseClient,
  storeId: string,
  turno: CaixaTurnoRow
): Promise<number> {
  const breakdown = await breakdownForTurno(supabase, storeId, turno.id)
  const cashSales = breakdown.dinheiro.total

  const movs = await getMovimentacoesForTurno(supabase, turno.id)
  let sup = 0
  let san = 0
  for (const m of movs) {
    if (m.tipo === 'acerto_entregador') continue
    if (m.tipo === 'suprimento') sup += m.valor
    else if (m.tipo === 'sangria') san += m.valor
  }

  return round2(turno.fundo_inicial + cashSales + sup - san)
}
