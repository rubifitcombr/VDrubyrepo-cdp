import 'server-only'

import type {
  CourierBalanceGroup,
  DeliveryOpsPayload,
  OrderOnRouteDTO,
} from '@/lib/delivery-ops-types'
import {
  entregaPendenteAcerto,
  saldoEntregaLinha,
  type StoreEntregadorDTO,
} from '@/lib/entregas-types'
import { slugChannelSourcesForSupabaseIn } from '@/lib/slug-channel-orders'
import { mapStoreOrderRow, ORDER_SELECT } from '@/lib/store-order'
import { listEntregasForStore } from '@/services/entregas.server'
import { listEntregadoresForStore } from '@/services/store-entregadores.server'
import type { SupabaseClient } from '@supabase/supabase-js'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function enrichOnRouteOrder(
  row: Record<string, unknown>,
  displayRef?: string
): OrderOnRouteDTO {
  const base = mapStoreOrderRow(row)
  const prazo =
    typeof row.entrega_prazo_minutos === 'number'
      ? row.entrega_prazo_minutos
      : Number(row.entrega_prazo_minutos) || 45
  const dispatched =
    typeof row.entrega_despachada_em === 'string' ? row.entrega_despachada_em : null
  let minutesOnRoute = 0
  let isDelayed = false
  if (dispatched) {
    minutesOnRoute = Math.max(
      0,
      Math.floor((Date.now() - new Date(dispatched).getTime()) / 60000)
    )
    isDelayed = minutesOnRoute > prazo
  }
  return {
    ...base,
    entregador_id:
      typeof row.entregador_id === 'string' ? row.entregador_id : null,
    entregador_nome:
      typeof row.entregador_nome === 'string' ? row.entregador_nome : null,
    entrega_despachada_em: dispatched,
    entrega_prazo_minutos: prazo,
    display_ref: displayRef,
    minutes_on_route: minutesOnRoute,
    is_delayed: isDelayed,
  }
}

function groupBalances(
  entregas: Awaited<ReturnType<typeof listEntregasForStore>>,
  entregadores: StoreEntregadorDTO[]
): CourierBalanceGroup[] {
  const map = new Map<string, CourierBalanceGroup>()

  for (const e of entregas) {
    if (!entregaPendenteAcerto(e)) continue
    const key = e.entregador_id ?? `avulso:${e.entregador_nome}`
    const existing = map.get(key)
    const saldo = saldoEntregaLinha(e)
    if (existing) {
      existing.entregas.push(e)
      existing.total_corrida = round2(existing.total_corrida + e.valor_corrida)
      existing.total_recebido = round2(
        existing.total_recebido + e.valor_recebido_cliente
      )
      existing.saldo = round2(existing.saldo + saldo)
      existing.pending_settlement = true
    } else {
      map.set(key, {
        key,
        entregador_id: e.entregador_id,
        nome: e.entregador_nome,
        entregas: [e],
        total_corrida: round2(e.valor_corrida),
        total_recebido: round2(e.valor_recebido_cliente),
        saldo: round2(saldo),
        pending_settlement: true,
      })
    }
  }

  for (const c of entregadores.filter((e) => e.ativo)) {
    const key = c.id
    if (!map.has(key)) {
      map.set(key, {
        key,
        entregador_id: c.id,
        nome: c.nome,
        entregas: [],
        total_corrida: 0,
        total_recebido: 0,
        saldo: 0,
        pending_settlement: false,
      })
    }
  }

  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
}

async function filterEntregasFromSlugOrders(
  svc: SupabaseClient,
  storeId: string,
  entregas: Awaited<ReturnType<typeof listEntregasForStore>>
) {
  const orderIds = [...new Set(entregas.map((e) => e.order_id).filter(Boolean))]
  if (orderIds.length === 0) return []

  const { data, error } = await svc
    .from('orders')
    .select('id')
    .eq('store_id', storeId)
    .in('id', orderIds)
    .in('source', slugChannelSourcesForSupabaseIn())

  if (error || !data) return []
  const allowed = new Set(data.map((row) => String(row.id)))
  return entregas.filter((e) => allowed.has(e.order_id))
}

export async function getDeliveryOpsPayload(
  svc: SupabaseClient,
  storeId: string
): Promise<DeliveryOpsPayload> {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const fromMs = d.getTime()

  const [entregadores, entregasHoje] = await Promise.all([
    listEntregadoresForStore(svc, storeId),
    listEntregasForStore(svc, storeId, { fromMs }),
  ])
  const entregasSlugHoje = await filterEntregasFromSlugOrders(
    svc,
    storeId,
    entregasHoje
  )

  const { data: onRouteRows, error: onRouteErr } = await svc
    .from('orders')
    .select(ORDER_SELECT)
    .eq('store_id', storeId)
    .eq('status', 'confirmed')
    .in('source', slugChannelSourcesForSupabaseIn())
    .order('entrega_despachada_em', { ascending: true, nullsFirst: false })

  let missingColumns = false
  if (onRouteErr && /column.*does not exist/i.test(onRouteErr.message)) {
    missingColumns = true
  }

  const onRouteRaw = onRouteErr ? [] : onRouteRows ?? []
  const sortedForRef = [...onRouteRaw].sort(
    (a, b) =>
      new Date(String(a.created_at)).getTime() -
      new Date(String(b.created_at)).getTime()
  )
  const refMap = new Map<string, string>()
  sortedForRef.forEach((r, i) => {
    refMap.set(String(r.id), String(i + 1).padStart(3, '0'))
  })

  const on_route: OrderOnRouteDTO[] = onRouteRaw.map((r) =>
    enrichOnRouteOrder(r as Record<string, unknown>, refMap.get(String(r.id)))
  )

  const delayed = on_route.filter((o) => o.is_delayed)

  const activeCourierIds = new Set(
    on_route.map((o) => o.entregador_id).filter(Boolean) as string[]
  )

  const couriers = entregadores.map((c) => ({
    ...c,
    status_operacional: c.status_operacional ?? 'disponivel',
    ultimo_status_em: c.ultimo_status_em ?? c.criado_em,
    valor_padrao_corrida: c.valor_padrao_corrida ?? 0,
  }))

  const disponiveis = couriers.filter(
    (c) =>
      c.ativo &&
      (c.status_operacional === 'disponivel' || c.status_operacional === 'pausado') &&
      !activeCourierIds.has(c.id)
  ).length

  const balances = groupBalances(entregasSlugHoje, entregadores)
  let saldo_loja_deve = 0
  let saldo_entregador_deve = 0
  for (const g of balances) {
    if (g.saldo > 0) saldo_loja_deve = round2(saldo_loja_deve + g.saldo)
    if (g.saldo < 0) saldo_entregador_deve = round2(saldo_entregador_deve + Math.abs(g.saldo))
  }

  return {
    summary: {
      disponiveis,
      na_rua: on_route.length,
      atrasados: delayed.length,
      saldo_loja_deve,
      saldo_entregador_deve,
    },
    on_route,
    delayed,
    couriers,
    balances: balances.filter((b) => b.pending_settlement || b.entregas.length > 0),
    missingColumns,
  }
}
