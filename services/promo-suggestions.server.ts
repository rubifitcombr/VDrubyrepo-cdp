import 'server-only'

import type { PromotionSuggestionDTO } from '@/lib/promo-suggestions'
import { presetHappyHourSp } from '@/lib/promo-guided'
import { createClient } from '@/lib/supabase/server'

const DAYS = 45
const MIN_ORDERS = 5

function isCancelled(status: string | null | undefined) {
  return status === 'cancelled'
}

function spHourFromIso(iso: string): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hour12: false,
  }).format(new Date(iso))
  return parseInt(h, 10) || 0
}

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export async function getPromotionSuggestionsForStore(
  storeId: string
): Promise<PromotionSuggestionDTO | null> {
  const supabase = await createClient()
  const since = new Date(Date.now() - DAYS * 86400000).toISOString()

  const { data: orderRows, error: oErr } = await supabase
    .from('orders')
    .select('id, created_at, total, status')
    .eq('store_id', storeId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1200)

  if (oErr || !orderRows?.length) return null

  const orders = orderRows.filter((r) => !isCancelled(r.status as string))
  if (orders.length < MIN_ORDERS) return null

  let sumTotal = 0
  let nTicket = 0
  const hourCount = new Array(24).fill(0)
  for (const o of orders) {
    const t = Number(o.total)
    if (!Number.isNaN(t) && t > 0) {
      sumTotal += t
      nTicket += 1
    }
    hourCount[spHourFromIso(String(o.created_at))] += 1
  }
  const avgTicket = nTicket > 0 ? sumTotal / nTicket : 0

  let slowHour = 15
  let minC = Number.POSITIVE_INFINITY
  for (let h = 10; h <= 22; h++) {
    if (hourCount[h] < minC) {
      minC = hourCount[h]
      slowHour = h
    }
  }

  const orderIds = orders.map((r) => String(r.id))
  const { data: lines, error: lErr } = await supabase
    .from('order_items')
    .select('product_id, quantity')
    .in('order_id', orderIds.slice(0, 800))

  if (lErr || !lines?.length) return null

  const qtyByProduct = new Map<string, number>()
  for (const row of lines) {
    const pid = row.product_id as string
    const q = Number(row.quantity) || 0
    if (!pid || q < 1) continue
    qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + q)
  }

  const sorted = [...qtyByProduct.entries()].sort((a, b) => b[1] - a[1])
  if (!sorted.length) return null

  let idA = sorted[0][0]
  let idB = sorted.length > 1 ? sorted[1][0] : ''

  if (!idB || idB === idA) {
    const { data: extras } = await supabase
      .from('products')
      .select('id')
      .eq('store_id', storeId)
      .eq('active', true)
      .neq('id', idA)
      .limit(12)

    idB = (extras ?? []).map((r) => String(r.id)).find((id) => id !== idA) ?? ''
  }

  if (!idB) return null

  const pairIds = [idA, idB]
  const { data: prodRows } = await supabase
    .from('products')
    .select('id, name')
    .in('id', pairIds)

  const nameMap = new Map(
    (prodRows ?? []).map((p) => [String(p.id), String(p.name ?? 'Produto')])
  )
  const nameA = nameMap.get(idA) ?? 'Produto A'
  const nameB = nameMap.get(idB) ?? 'Produto B'

  const endSlow = Math.min(slowHour + 2, 23)
  const timeStart = `${String(slowHour).padStart(2, '0')}:00`
  const timeEnd = `${String(endSlow).padStart(2, '0')}:00`
  const hh = presetHappyHourSp()
  const validFrom = hh.validFrom
  const validUntil = hh.validUntil

  let peakH = 12
  let maxPeak = 0
  for (let h = 10; h <= 22; h++) {
    if (hourCount[h] > maxPeak) {
      maxPeak = hourCount[h]
      peakH = h
    }
  }

  const title = `Combo ${nameA.split(/\s+/)[0]} + ${nameB.split(/\s+/)[0]}`
  const body = `Que tal criar um **combo** com **${nameA}** e **${nameB}**? São dos itens mais pedidos neste período — juntá-los costuma **aumentar o ticket médio** (o teu está cerca de **${money.format(avgTicket)}**). Sugestão: reforçar às **${slowHour}h–${endSlow}h**, quando registas **menos pedidos** que noutros horários (o pico costuma ser às **${peakH}h**).`

  const metricsSummary = `${orders.length} pedidos analisados · ticket médio ${money.format(avgTicket)} · horário mais calmo (amostra): ${slowHour}h–${endSlow}h`

  return {
    id: `combo-${idA.slice(0, 8)}-${idB.slice(0, 8)}`,
    title,
    body,
    metricsSummary,
    kind: 'combo',
    productIds: [idA, idB],
    productNames: [nameA, nameB],
    schedulePreset: 'happy_hour',
    timeStart,
    timeEnd,
    validFrom,
    validUntil,
    suggestedPromoName: `Combo ${nameA} + ${nameB}`,
  }
}
