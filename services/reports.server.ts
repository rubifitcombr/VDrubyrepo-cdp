import 'server-only'

import type {
  ReportHourRow,
  ReportPaymentMix,
  ReportFinanceData,
  ReportProductRow,
  ReportPromoSnapshot,
  ReportSeriesPoint,
  ReportsAdvancedSummary,
  ReportWeighableSummary,
  ReportsDashboardData,
} from '@/lib/reports-data'
import { roundWeightKg } from '@/lib/scale/price'
import { slugChannelSourcesForSupabaseIn } from '@/lib/slug-channel-orders'
import { createClient } from '@/lib/supabase/server'
import { getPromotionSuggestionsForStore } from '@/services/promo-suggestions.server'

function isCancelled(status: string | null | undefined) {
  return status === 'cancelled'
}

function spDateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso))
}

function spHour(iso: string): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hour12: false,
  }).format(new Date(iso))
  return parseInt(h, 10) || 0
}

function spYmdToStartUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 3, 0, 0, 0)
}

function addCalendarDaysSp(ymd: string, delta: number): string {
  const t = spYmdToStartUtcMs(ymd) + delta * 86400000
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(t))
}

function spTodayYmd(): string {
  return spDateKey(new Date().toISOString())
}

function normPay(raw: string | null | undefined): 'pix' | 'card' | 'cash' | 'other' | null {
  const v = raw?.trim().toLowerCase()
  if (!v) return null
  if (v === 'pix') return 'pix'
  if (v === 'cartao' || v === 'card' || v === 'cartão') return 'card'
  if (v === 'dinheiro' || v === 'cash') return 'cash'
  return 'other'
}

function pctDelta(cur: number, prev: number): number | null {
  if (prev <= 0) return cur > 0 ? 100 : null
  return Math.round(((cur - prev) / prev) * 100)
}

function sumDayRange(
  byDay: Map<string, { rev: number; n: number }>,
  fromKey: string,
  toKey: string
): { rev: number; n: number } {
  let rev = 0
  let n = 0
  let k = fromKey
  for (let i = 0; i < 400; i++) {
    const b = byDay.get(k)
    if (b) {
      rev += b.rev
      n += b.n
    }
    if (k === toKey) break
    k = addCalendarDaysSp(k, 1)
  }
  return { rev, n }
}

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function emptyFinanceData(missingTable = false): ReportFinanceData {
  const zero = { receitas: 0, despesas: 0, saldo: 0, contasPendentes: 0 }
  return {
    hasData: false,
    missingTable,
    today: zero,
    d7: zero,
    d30: zero,
    allPending: 0,
    recentEntries: [],
    topPendingSuppliers: [],
  }
}

function reportMoney(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return round2(v)
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? round2(n) : 0
  }
  return 0
}

function isMissingFinanceTable(message: string): boolean {
  return /financial_entries|suppliers|relation|does not exist|schema cache|42P01/i.test(message)
}

async function fetchFinanceDataForReports(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storeId: string
): Promise<ReportFinanceData> {
  const [{ data: suppliers, error: suppliersErr }, { data: entries, error: entriesErr }] =
    await Promise.all([
      supabase.from('suppliers').select('id, nome, categoria').eq('store_id', storeId),
      supabase
        .from('financial_entries')
        .select('tipo, categoria, supplier_id, descricao, valor, status, created_at')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(3000),
    ])

  const errMsg = suppliersErr?.message || entriesErr?.message
  if (errMsg) {
    if (isMissingFinanceTable(errMsg)) return emptyFinanceData(true)
    console.error('[reports] finance:', errMsg)
    return emptyFinanceData()
  }

  const supplierRows = (suppliers ?? []) as Record<string, unknown>[]
  const supplierNames = new Map<string, { nome: string; categoria: string | null }>()
  for (const s of supplierRows) {
    const id = String(s.id ?? '')
    if (!id) continue
    supplierNames.set(id, {
      nome: String(s.nome ?? '').trim() || '—',
      categoria: typeof s.categoria === 'string' && s.categoria.trim() ? s.categoria.trim() : null,
    })
  }

  type Entry = {
    tipo: 'receita' | 'despesa'
    categoria: string
    supplierId: string | null
    descricao: string
    valor: number
    status: 'pendente' | 'pago'
    dateKey: string
  }

  const mapped: Entry[] = []
  for (const row of (entries ?? []) as Record<string, unknown>[]) {
    const tipo = String(row.tipo ?? '').trim().toLowerCase() === 'receita' ? 'receita' : 'despesa'
    const status = String(row.status ?? '').trim().toLowerCase() === 'pago' ? 'pago' : 'pendente'
    const created =
      typeof row.created_at === 'string' && row.created_at
        ? row.created_at
        : new Date().toISOString()
    mapped.push({
      tipo,
      categoria: String(row.categoria ?? '').trim() || 'Sem categoria',
      supplierId:
        typeof row.supplier_id === 'string' && row.supplier_id.trim()
          ? row.supplier_id.trim()
          : null,
      descricao: String(row.descricao ?? '').trim() || '—',
      valor: reportMoney(row.valor),
      status,
      dateKey: spDateKey(created),
    })
  }

  if (mapped.length === 0) return emptyFinanceData()

  const today = spTodayYmd()
  const summarize = (fromKey: string) => {
    let receitas = 0
    let despesas = 0
    let contasPendentes = 0
    for (const entry of mapped) {
      if (entry.dateKey < fromKey || entry.dateKey > today) continue
      if (entry.tipo === 'receita') receitas += entry.valor
      else {
        despesas += entry.valor
        if (entry.status === 'pendente') contasPendentes += entry.valor
      }
    }
    return {
      receitas: round2(receitas),
      despesas: round2(despesas),
      saldo: round2(receitas - despesas),
      contasPendentes: round2(contasPendentes),
    }
  }

  const pendingBySupplier = new Map<string, number>()
  let allPending = 0
  for (const entry of mapped) {
    if (entry.tipo !== 'despesa' || entry.status !== 'pendente') continue
    allPending += entry.valor
    const key = entry.supplierId ?? '__sem_fornecedor__'
    pendingBySupplier.set(key, round2((pendingBySupplier.get(key) ?? 0) + entry.valor))
  }

  const topPendingSuppliers = [...pendingBySupplier.entries()]
    .map(([supplierId, contasPendentes]) => {
      const supplier = supplierNames.get(supplierId)
      return {
        nome: supplier?.nome ?? 'Sem fornecedor',
        categoria: supplier?.categoria ?? null,
        contasPendentes,
      }
    })
    .sort((a, b) => b.contasPendentes - a.contasPendentes)
    .slice(0, 6)

  const recentEntries = mapped.slice(0, 8).map((entry) => ({
    tipo: entry.tipo,
    categoria: entry.categoria,
    fornecedor: entry.supplierId ? supplierNames.get(entry.supplierId)?.nome ?? null : null,
    descricao: entry.descricao,
    valor: entry.valor,
    status: entry.status,
    dateKey: entry.dateKey,
  }))

  return {
    hasData: true,
    missingTable: false,
    today: summarize(today),
    d7: summarize(addCalendarDaysSp(today, -6)),
    d30: summarize(addCalendarDaysSp(today, -29)),
    allPending: round2(allPending),
    recentEntries,
    topPendingSuppliers,
  }
}

async function fetchOrderLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderIds: string[]
): Promise<
  {
    order_id: string
    product_id: string
    quantity: number
    unit_price: number
    unit_type: 'unit' | 'weight'
    weight_kg: number | null
  }[]
> {
  const out: {
    order_id: string
    product_id: string
    quantity: number
    unit_price: number
    unit_type: 'unit' | 'weight'
    weight_kg: number | null
  }[] = []
  const CHUNK = 400
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const slice = orderIds.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from('order_items')
      .select('order_id, product_id, quantity, unit_price, price, unit_type, weight_kg')
      .in('order_id', slice)
    if (error) {
      if (
        error.message.includes('order_items') ||
        error.message.includes('does not exist')
      ) {
        return []
      }
      console.error('[reports] order_items:', error.message)
      return []
    }
    for (const row of data ?? []) {
      const oid = String(row.order_id ?? '')
      const pid = String(row.product_id ?? '')
      const unitType = row.unit_type === 'weight' ? 'weight' : 'unit'
      const q = Number(row.quantity) || 0
      const up =
        Number(
          (row as { unit_price?: unknown; price?: unknown }).unit_price ??
            (row as { price?: unknown }).price
        ) || 0
      if (!oid || !pid || q <= 0) continue
      if (unitType === 'unit' && q < 1) continue
      out.push({
        order_id: oid,
        product_id: pid,
        quantity: q,
        unit_price: up,
        unit_type: unitType,
        weight_kg:
          unitType === 'weight'
            ? roundWeightKg(Number(row.weight_kg ?? q) || q)
            : null,
      })
    }
  }
  return out
}

function isMissingOrdersSchema(message: string): boolean {
  return /relation|does not exist|schema cache|42P01|orders\.|order_items\./i.test(
    message
  )
}

function emptyData(missingOrdersSchema = false): ReportsDashboardData {
  return {
    hasEnoughData: false,
    missingOrdersSchema,
    insights: [],
    recommendations: [],
    performance: { today: [], d7: [], d30: [] },
    ticket: {
      avgCurrent7d: 0,
      avgPrev7d: 0,
      pctChangeVsPrev7d: null,
      ordersLast7d: 0,
      projectedMonthlyGainIfTicketPlus5: 0,
    },
    hours: [],
    peakRangeLabel: '—',
    deadHourLabel: null,
    products: { topByQty: [], topByRevenue: [], slowMovers: [] },
    payment: { pix: 0, card: 0, cash: 0, other: 0, pixPct: 0 },
    promo: null,
    finance: emptyFinanceData(),
    conversionAvailable: false,
    advanced: undefined,
    weighable: null,
  }
}

export async function getReportsDashboardData(
  storeId: string | null,
  options?: {
    advanced?: boolean
    slugChannelSourcesOnly?: boolean
    weighable?: boolean
  }
): Promise<ReportsDashboardData> {
  if (!storeId) return emptyData()

  const supabase = await createClient()
  const financePromise = fetchFinanceDataForReports(supabase, storeId)
  const lookbackDays = options?.advanced === true ? 70 : 42
  const since = new Date(Date.now() - lookbackDays * 86400000).toISOString()

  let ordQ = supabase
    .from('orders')
    .select('id, created_at, total, status, payment_method')
    .eq('store_id', storeId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(4500)
  if (options?.slugChannelSourcesOnly) {
    ordQ = ordQ.in('source', slugChannelSourcesForSupabaseIn())
  }
  const { data: ordRaw, error } = await ordQ

  if (error) {
    console.error('[reports] orders:', error.message)
    const missingOrders = isMissingOrdersSchema(error.message ?? '')
    return {
      ...emptyData(missingOrders),
      finance: await financePromise,
    }
  }

  const orders = (ordRaw ?? []).filter((r) => !isCancelled(r.status as string))
  const finance = await financePromise
  if (orders.length < 3) {
    return { ...emptyData(), finance, hasEnoughData: false }
  }

  const todayKey = spTodayYmd()
  const yesterdayKey = addCalendarDaysSp(todayKey, -1)

  const byDay = new Map<string, { rev: number; n: number }>()
  const hourCount = new Array(24).fill(0)
  const todayHourRev = new Array(24).fill(0)
  const todayHourN = new Array(24).fill(0)

  const pay30 = { pix: 0, card: 0, cash: 0, other: 0, tagged: 0 }
  const start30 = addCalendarDaysSp(todayKey, -29)

  for (const o of orders) {
    const iso = String(o.created_at)
    const key = spDateKey(iso)
    const t = Number(o.total)
    const rev = !Number.isNaN(t) && t > 0 ? t : 0
    const slot = byDay.get(key) ?? { rev: 0, n: 0 }
    slot.rev += rev
    slot.n += 1
    byDay.set(key, slot)

    const h = spHour(iso)
    hourCount[h] += 1
    if (key === todayKey) {
      todayHourRev[h] += rev
      todayHourN[h] += 1
    }

    if (key >= start30 && key <= todayKey) {
      const p = normPay(o.payment_method as string)
      if (p) pay30.tagged += 1
      if (p === 'pix') pay30.pix += rev
      else if (p === 'card') pay30.card += rev
      else if (p === 'cash') pay30.cash += rev
      else if (rev > 0) pay30.other += rev
    }
  }

  const revToday = byDay.get(todayKey)?.rev ?? 0
  const revYest = byDay.get(yesterdayKey)?.rev ?? 0
  const ordToday = byDay.get(todayKey)?.n ?? 0
  const ordYest = byDay.get(yesterdayKey)?.n ?? 0

  const start7 = addCalendarDaysSp(todayKey, -6)
  const startPrev7 = addCalendarDaysSp(todayKey, -13)
  const endPrev7 = addCalendarDaysSp(todayKey, -7)

  const cur7 = sumDayRange(byDay, start7, todayKey)
  const prev7 = sumDayRange(byDay, startPrev7, endPrev7)

  const avgTicket7 =
    cur7.n > 0 ? Math.round((cur7.rev / cur7.n) * 100) / 100 : 0
  const avgTicketPrev7 =
    prev7.n > 0 ? Math.round((prev7.rev / prev7.n) * 100) / 100 : 0
  const ticketPct = pctDelta(avgTicket7, avgTicketPrev7)

  const last30 = sumDayRange(byDay, start30, todayKey)
  const dailyOrd = last30.n / 30
  const projectedMonthlyGainIfTicketPlus5 = Math.round(dailyOrd * 30 * 5 * 100) / 100

  let peakA = 19
  let peakB = 20
  let bestPair = 0
  for (let h = 10; h <= 21; h++) {
    const s = hourCount[h] + hourCount[h + 1]
    if (s >= bestPair) {
      bestPair = s
      peakA = h
      peakB = h + 1
    }
  }
  const peakRangeLabel = `${peakA}h–${peakB}h`

  let deadH = 15
  let minC = Number.POSITIVE_INFINITY
  for (let h = 10; h <= 22; h++) {
    if (hourCount[h] < minC) {
      minC = hourCount[h]
      deadH = h
    }
  }
  const deadHourLabel = `${deadH}h`

  const payTotal = pay30.pix + pay30.card + pay30.cash + pay30.other
  const pixPct =
    payTotal > 0 ? Math.round((pay30.pix / payTotal) * 1000) / 10 : 0

  const payment: ReportPaymentMix = {
    pix: pay30.pix,
    card: pay30.card,
    cash: pay30.cash,
    other: pay30.other,
    pixPct,
  }

  const insights: string[] = []
  const dRev = pctDelta(revToday, revYest)
  if (dRev != null) {
    if (dRev <= -8) {
      insights.push(`O teu faturamento hoje está ${Math.abs(dRev)}% abaixo de ontem.`)
    } else if (dRev >= 12) {
      insights.push(`O teu faturamento hoje subiu ${dRev}% face a ontem.`)
    }
  }
  const dOrd = pctDelta(ordToday, ordYest)
  if (dOrd != null && insights.length < 5 && Math.abs(dOrd) >= 20) {
    insights.push(
      dOrd < 0
        ? `Menos ${Math.abs(dOrd)}% pedidos hoje vs ontem.`
        : `Mais ${dOrd}% pedidos hoje vs ontem.`
    )
  }

  insights.push(`O horário mais forte é ${peakRangeLabel} (pedidos nos últimos ~40 dias).`)

  if (avgTicket7 > 0 && avgTicketPrev7 > 0) {
    const diff = Math.round((avgTicket7 - avgTicketPrev7) * 100) / 100
    if (Math.abs(diff) >= 1) {
      insights.push(
        diff < 0
          ? `O ticket médio desta semana caiu cerca de ${money.format(Math.abs(diff))} vs semana anterior.`
          : `O ticket médio desta semana subiu cerca de ${money.format(diff)} vs semana anterior.`
    )
    }
  } else if (ticketPct != null && Math.abs(ticketPct) >= 5) {
    insights.push(
      ticketPct < 0
        ? `O ticket médio (7 dias) caiu ${Math.abs(ticketPct)}% vs semana anterior.`
        : `O ticket médio (7 dias) subiu ${ticketPct}% vs semana anterior.`
    )
  }

  if (pixPct > 0) {
    insights.push(`PIX representa cerca de ${pixPct}% do faturamento (últimos 30 dias, por método registado).`)
  }

  if (finance.hasData) {
    if (finance.d30.saldo < 0) {
      insights.push(
        `O financeiro dos últimos 30 dias está negativo em ${money.format(Math.abs(finance.d30.saldo))}.`
      )
    } else if (finance.d30.saldo > 0) {
      insights.push(
        `O resultado operacional dos últimos 30 dias está positivo em ${money.format(finance.d30.saldo)}.`
      )
    }
    if (finance.allPending > 0) {
      insights.push(`Há ${money.format(finance.allPending)} em contas pendentes no Financeiro do Caixa.`)
    }
  }

  if (minC <= 2 && orders.length >= 15) {
    insights.push(`Há pouco movimento às ${deadHourLabel} — pode ser boa janela para promoção.`)
  }

  const orderIds = orders.map((o) => String(o.id))
  const lines = await fetchOrderLines(supabase, orderIds)

  const { data: prodRows } = await supabase
    .from('products')
    .select('id, name, price, promotion_active')
    .eq('store_id', storeId)

  const prodMap = new Map<
    string,
    { name: string; price: number; promotion_active: boolean }
  >()
  for (const p of prodRows ?? []) {
    const id = String(p.id ?? '')
    if (!id) continue
    prodMap.set(id, {
      name: String(p.name ?? 'Produto'),
      price: Number(p.price) || 0,
      promotion_active: p.promotion_active === true,
    })
  }

  type Agg = { qty: number; rev: number }
  const agg = new Map<string, Agg>()
  type WeighAgg = { weightKg: number; rev: number; lines: number }
  const weighAgg = new Map<string, WeighAgg>()
  let promoLines = 0
  const ordersWithPromo = new Set<string>()

  for (const ln of lines) {
    if (ln.unit_type === 'weight') {
      const w = ln.weight_kg ?? ln.quantity
      const a = weighAgg.get(ln.product_id) ?? { weightKg: 0, rev: 0, lines: 0 }
      a.weightKg = roundWeightKg(a.weightKg + w)
      a.rev += ln.unit_price * w
      a.lines += 1
      weighAgg.set(ln.product_id, a)
    } else {
      const a = agg.get(ln.product_id) ?? { qty: 0, rev: 0 }
      a.qty += ln.quantity
      a.rev += ln.unit_price * ln.quantity
      agg.set(ln.product_id, a)
    }

    const meta = prodMap.get(ln.product_id)
    if (meta?.promotion_active && ln.unit_type !== 'weight') {
      promoLines += ln.quantity
      ordersWithPromo.add(ln.order_id)
    }
  }

  const totalLineQty = lines
    .filter((l) => l.unit_type !== 'weight')
    .reduce((s, l) => s + l.quantity, 0)
  let promo: ReportPromoSnapshot | null = null
  if (lines.length > 0) {
    promo = {
      promoLines,
      totalLines: totalLineQty,
      promoSharePct:
        totalLineQty > 0
          ? Math.round((promoLines / totalLineQty) * 1000) / 10
          : 0,
      ordersWithPromoLine: ordersWithPromo.size,
    }
  }

  const merged: ReportProductRow[] = []
  for (const [pid, a] of agg) {
    const meta = prodMap.get(pid)
    merged.push({
      name: meta?.name ?? 'Produto',
      quantity: a.qty,
      revenue: Math.round(a.rev * 100) / 100,
      price: meta?.price,
    })
  }

  const topByQty = [...merged].sort((a, b) => b.quantity - a.quantity).slice(0, 8)
  const topByRevenue = [...merged]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)

  const withSales = [...merged].filter((p) => p.quantity > 0)
  const slowPool = [...withSales].sort((a, b) => a.quantity - b.quantity || (b.price ?? 0) - (a.price ?? 0))
  const slowMovers = slowPool
    .filter((p) => (p.price ?? 0) >= 8)
    .slice(0, 5)

  let weighable: ReportWeighableSummary | null = null
  if (options?.weighable === true && weighAgg.size > 0) {
    const topByWeight = [...weighAgg.entries()]
      .map(([pid, a]) => ({
        name: prodMap.get(pid)?.name ?? 'Produto',
        weightKg: roundWeightKg(a.weightKg),
        revenue: Math.round(a.rev * 100) / 100,
        lines: a.lines,
      }))
      .sort((a, b) => b.weightKg - a.weightKg)
      .slice(0, 8)

    const totalWeighableRevenue = round2(
      [...weighAgg.values()].reduce((s, a) => s + a.rev, 0)
    )
    const weighableLines = [...weighAgg.values()].reduce((s, a) => s + a.lines, 0)

    weighable = {
      totalWeightKg: roundWeightKg(
        [...weighAgg.values()].reduce((s, a) => s + a.weightKg, 0)
      ),
      totalRevenue: totalWeighableRevenue,
      weighableLines,
      topByWeight,
    }

    if (weighable.totalWeightKg > 0) {
      insights.push(
        `Produtos pesáveis: ${weighable.totalWeightKg.toFixed(3).replace('.', ',')} kg vendidos no período (${money.format(weighable.totalRevenue)}).`
      )
    }
  }

  const hours: ReportHourRow[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}h`,
    orders: hourCount[hour],
  }))

  const buildSeries = (daysBack: number): ReportSeriesPoint[] => {
    const pts: ReportSeriesPoint[] = []
    for (let i = daysBack - 1; i >= 0; i--) {
      const key = addCalendarDaysSp(todayKey, -i)
      const b = byDay.get(key) ?? { rev: 0, n: 0 }
      const [, m, d] = key.split('-')
      pts.push({
        label: daysBack <= 7 ? `${d}/${m}` : i % 3 === 0 || i === 0 ? `${d}/${m}` : '',
        revenue: Math.round(b.rev * 100) / 100,
        orders: b.n,
        dateKey: key,
      })
    }
    return pts
  }

  const todaySeries: ReportSeriesPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    label: `${String(hour).padStart(2, '0')}h`,
    revenue: Math.round(todayHourRev[hour] * 100) / 100,
    orders: todayHourN[hour],
  }))

  const recommendations: string[] = []

  if (slowMovers.length > 0) {
    const p = slowMovers[0]
    recommendations.push(
      `“${p.name}” vende pouco neste período — com preço ${money.format(p.price ?? 0)}, vale destacá-lo nas Promoções ou no cardápio.`
    )
  }
  recommendations.push(
    `Baixo movimento típico às ${deadHourLabel} — experimenta desconto pontual ou post nesse horário.`
  )
  if (avgTicket7 > 0 && avgTicket7 < 35) {
    recommendations.push(
      'Cria um combo com os dois produtos mais vendidos para subir o ticket médio sem subir o preço de cada item à vista.'
    )
  }
  if (pixPct >= 60) {
    recommendations.push(
      'PIX domina o mix — cupom ou cashback em app pode fidelizar sem complicar o PDV.'
    )
  }
  if (finance.hasData && finance.allPending > 0) {
    recommendations.push(
      `Revê as contas pendentes no Caixa Financeiro: há ${money.format(finance.allPending)} em aberto.`
    )
  }

  try {
    const sug = await getPromotionSuggestionsForStore(storeId, {
      slugChannelSourcesOnly: options?.slugChannelSourcesOnly,
    })
    if (sug?.title) {
      recommendations.unshift(`Combo sugerido: ${sug.title} — abre Promoções e usa “Usar no assistente”.`)
    }
  } catch {
    /* ignore */
  }

  let advanced: ReportsAdvancedSummary | undefined
  if (options?.advanced === true) {
    const startCur30 = addCalendarDaysSp(todayKey, -29)
    const startPrev30 = addCalendarDaysSp(todayKey, -59)
    const endPrev30 = addCalendarDaysSp(todayKey, -30)
    const cur30 = sumDayRange(byDay, startCur30, todayKey)
    const prev30 = sumDayRange(byDay, startPrev30, endPrev30)
    advanced = {
      rolling30VsPrior30: {
        revenueCurrent: Math.round(cur30.rev * 100) / 100,
        revenuePrevious: Math.round(prev30.rev * 100) / 100,
        revenuePctChange: pctDelta(cur30.rev, prev30.rev),
        ordersCurrent: cur30.n,
        ordersPrevious: prev30.n,
      },
    }
  }

  return {
    hasEnoughData: true,
    insights: insights.slice(0, 6),
    recommendations: recommendations.slice(0, 8),
    performance: {
      today: todaySeries,
      d7: buildSeries(7),
      d30: buildSeries(30),
    },
    ticket: {
      avgCurrent7d: avgTicket7,
      avgPrev7d: avgTicketPrev7,
      pctChangeVsPrev7d: ticketPct,
      ordersLast7d: cur7.n,
      projectedMonthlyGainIfTicketPlus5,
    },
    hours,
    peakRangeLabel,
    deadHourLabel,
    products: { topByQty, topByRevenue, slowMovers },
    payment,
    promo,
    finance,
    conversionAvailable: false,
    advanced,
    weighable,
  }
}
