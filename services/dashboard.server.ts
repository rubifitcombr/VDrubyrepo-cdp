import 'server-only'

import { slugChannelSourcesForSupabaseIn } from '@/lib/slug-channel-orders'
import { orderIsVisibleAfterPixConfirmation } from '@/lib/store-order'
import { createClient } from '@/lib/supabase/server'

export type RecentOrder = {
  id: string
  created_at: string
  total: number | string | null
  status?: string | null
}

/** Start of calendar day in São Paulo (BRT, UTC−3) as ISO string for DB filters. */
function saoPauloDayBounds(now = new Date()): {
  startIso: string
  endExclusiveIso: string
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((x) => [x.type, x.value])
  )
  const y = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  const start = new Date(Date.UTC(y, month - 1, day, 3, 0, 0, 0))
  const endExclusive = new Date(Date.UTC(y, month - 1, day + 1, 3, 0, 0, 0))
  return { startIso: start.toISOString(), endExclusiveIso: endExclusive.toISOString() }
}

/** Limites do mês civil em Brasília (início inclusivo, fim exclusivo em ISO UTC). */
function saoPauloMonthPair(now = new Date()): {
  monthStart: string
  monthEndExclusive: string
  prevMonthStart: string
  prevMonthEndExclusive: string
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((x) => [x.type, x.value])
  )
  const y = Number(parts.year)
  const month = Number(parts.month)
  const start = new Date(Date.UTC(y, month - 1, 1, 3, 0, 0, 0))
  const nextMonth = month === 12 ? 1 : month + 1
  const nextY = month === 12 ? y + 1 : y
  const endExclusive = new Date(Date.UTC(nextY, nextMonth - 1, 1, 3, 0, 0, 0))
  const prevMonth = month === 1 ? 12 : month - 1
  const prevY = month === 1 ? y - 1 : y
  const prevStart = new Date(Date.UTC(prevY, prevMonth - 1, 1, 3, 0, 0, 0))
  return {
    monthStart: start.toISOString(),
    monthEndExclusive: endExclusive.toISOString(),
    prevMonthStart: prevStart.toISOString(),
    prevMonthEndExclusive: start.toISOString(),
  }
}

function sumTotals(rows: { total: number | string | null }[] | null): number {
  if (!rows?.length) return 0
  let sum = 0
  for (const r of rows) {
    const n = Number(r.total)
    if (!Number.isNaN(n)) sum += n
  }
  return sum
}

async function getOpenCashierTurnStartIso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storeId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('caixas_turnos')
    .select('aberto_em')
    .eq('store_id', storeId)
    .eq('status', 'aberto')
    .maybeSingle()

  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message)) return null
    console.error('[dashboard] open cashier turn:', error.message)
    return null
  }

  const openedAt =
    data && typeof data === 'object' && typeof data.aberto_em === 'string'
      ? data.aberto_em
      : null
  return openedAt?.trim() || null
}

export type DashboardMetrics = {
  ordersToday: number
  revenueToday: number
  activeProducts: number
  totalProducts: number
  recentOrders: RecentOrder[]
}

const emptyMetrics: DashboardMetrics = {
  ordersToday: 0,
  revenueToday: 0,
  activeProducts: 0,
  totalProducts: 0,
  recentOrders: [],
}

export async function getDashboardMetrics(
  storeId: string | null
): Promise<DashboardMetrics> {
  if (!storeId) return { ...emptyMetrics }

  const supabase = await createClient()
  const { endExclusiveIso } = saoPauloDayBounds()
  const operationalStartIso =
    (await getOpenCashierTurnStartIso(supabase, storeId)) ?? endExclusiveIso

  const [
    ordersTodayCountRes,
    ordersTodayTotalsRes,
    productsTotalRes,
    productsActiveRes,
    recentRes,
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .gte('created_at', operationalStartIso)
      .lt('created_at', endExclusiveIso),
    supabase
      .from('orders')
      .select('total')
      .eq('store_id', storeId)
      .gte('created_at', operationalStartIso)
      .lt('created_at', endExclusiveIso),
    supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId),
    supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('active', true),
    supabase
      .from('orders')
      .select('id, created_at, total, status')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const ordersError =
    ordersTodayCountRes.error ||
    ordersTodayTotalsRes.error ||
    recentRes.error
  if (ordersError) {
    console.error('[dashboard] orders query:', ordersError.message)
  }

  const productsError = productsTotalRes.error || productsActiveRes.error
  if (productsError) {
    console.error('[dashboard] products query:', productsError.message)
  }

  const ordersToday =
    ordersError || ordersTodayCountRes.count == null
      ? 0
      : ordersTodayCountRes.count

  const revenueToday =
    ordersError ? 0 : sumTotals(ordersTodayTotalsRes.data)

  const totalProducts =
    productsError || productsTotalRes.count == null
      ? 0
      : productsTotalRes.count

  const activeProducts =
    productsError || productsActiveRes.count == null
      ? 0
      : productsActiveRes.count

  const recentOrders: RecentOrder[] = ordersError
    ? []
    : (recentRes.data as RecentOrder[] | null) ?? []

  return {
    ordersToday,
    revenueToday,
    activeProducts,
    totalProducts,
    recentOrders,
  }
}

export type DashboardTodayOrder = {
  id: string
  created_at: string
  total: number | string | null
  status?: string | null
  customer_name?: string | null
}

export type DashboardProductSignalRow = {
  image_url: string | null
  promotion_active: boolean | null
  promotional_price: number | string | null
  price: number | string | null
}

export type DashboardRecentOrderRow = {
  id: string
  created_at: string
  total: number | string | null
  status: string | null
  customer_name: string | null
}

export type DashboardTopProductRow = {
  name: string
  quantity: number
}

export type DashboardOverview = {
  ordersToday: number
  revenueToday: number
  ordersYesterday: number
  revenueYesterday: number
  pendingOrders: number
  avgTicketToday: number
  monthRevenue: number
  prevMonthRevenue: number
  recentOrders: DashboardRecentOrderRow[]
  topProducts: DashboardTopProductRow[]
}

async function fetchTopProductsForStore(
  storeId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  slugChannelSourcesOnly?: boolean
): Promise<DashboardTopProductRow[]> {
  const since = new Date(Date.now() - 90 * 86400000).toISOString()
  let oq = supabase
    .from('orders')
    .select('id')
    .eq('store_id', storeId)
    .gte('created_at', since)
  if (slugChannelSourcesOnly) {
    oq = oq.in('source', slugChannelSourcesForSupabaseIn())
  }
  const { data: orderRows, error: oErr } = await oq

  if (oErr || !orderRows?.length) return []

  const orderIds = orderRows.map((r) => r.id as string)
  const { data: lines, error: lErr } = await supabase
    .from('order_items')
    .select('product_id, quantity')
    .in('order_id', orderIds)

  if (lErr) {
    if (
      lErr.message?.includes('order_items') ||
      lErr.message?.includes('does not exist')
    ) {
      return []
    }
    console.error('[dashboard] order_items:', lErr.message)
    return []
  }

  const qtyByProduct = new Map<string, number>()
  for (const row of lines ?? []) {
    const pid = row.product_id as string
    const q = Number(row.quantity) || 0
    if (!pid || q < 1) continue
    qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + q)
  }

  const sorted = [...qtyByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  if (!sorted.length) return []

  const productIds = sorted.map(([id]) => id)
  const { data: products } = await supabase
    .from('products')
    .select('id, name')
    .in('id', productIds)

  const names = new Map(
    (products ?? []).map((p) => [p.id as string, String(p.name ?? 'Produto')])
  )

  return sorted.map(([id, quantity]) => ({
    name: names.get(id) ?? 'Produto',
    quantity,
  }))
}

/** Contagem leve de comandas pendentes (badge do hub). */
export async function getPendingOrdersCount(
  storeId: string,
  options?: { slugChannelSourcesOnly?: boolean }
): Promise<number> {
  const supabase = await createClient()
  let q = supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('status', 'pending')
  if (options?.slugChannelSourcesOnly) {
    q = q.in('source', slugChannelSourcesForSupabaseIn())
  }
  const { count, error } = await q

  if (error) {
    console.error('[dashboard] pending orders count:', error.message)
    return 0
  }
  return count ?? 0
}

/** Pedidos que precisam de atenção (badge no sino). */
export async function getDashboardNotificationCount(
  storeId: string,
  options?: { slugChannelSourcesOnly?: boolean }
): Promise<number> {
  const supabase = await createClient()
  let q = supabase
    .from('orders')
    .select('payment_method, payment_status')
    .eq('store_id', storeId)
    .in('status', ['pending', 'preparing', 'ready', 'confirmed'])
  if (options?.slugChannelSourcesOnly) {
    q = q.in('source', slugChannelSourcesForSupabaseIn())
  }
  const { data, error } = await q

  if (error) {
    console.error('[dashboard] notification count:', error.message)
    return 0
  }
  return (data ?? []).filter((row) =>
    orderIsVisibleAfterPixConfirmation({
      payment_method:
        typeof row.payment_method === 'string' ? row.payment_method : null,
      payment_status:
        typeof row.payment_status === 'string' ? row.payment_status : null,
    })
  ).length
}

function withSlugOrderSources(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: any,
  slugChannelSourcesOnly: boolean | undefined
) {
  if (!slugChannelSourcesOnly) return q
  return q.in('source', slugChannelSourcesForSupabaseIn())
}

/** Pedidos de hoje (Brasília) + produtos ativos + KPIs e widgets do painel. */
export async function getDashboardHomeData(
  storeId: string,
  options?: { slugChannelSourcesOnly?: boolean }
): Promise<{
  todayOrders: DashboardTodayOrder[]
  activeProducts: DashboardProductSignalRow[]
  overview: DashboardOverview
}> {
  const supabase = await createClient()
  const now = new Date()
  const { endExclusiveIso } = saoPauloDayBounds(now)
  const yBounds = saoPauloDayBounds(new Date(now.getTime() - 86400000))
  const monthB = saoPauloMonthPair(now)
  const slugF = options?.slugChannelSourcesOnly
  const operationalStartIso =
    (await getOpenCashierTurnStartIso(supabase, storeId)) ?? endExclusiveIso

  const [
    ordersRes,
    productsRes,
    todayCountRes,
    todayTotalsRes,
    yCountRes,
    yTotalsRes,
    pendingRes,
    monthTotalsRes,
    prevMonthTotalsRes,
    recentRes,
  ] = await Promise.all([
    withSlugOrderSources(
      supabase
        .from('orders')
        .select('id, created_at, total, status, customer_name')
        .eq('store_id', storeId)
        .gte('created_at', operationalStartIso)
        .lt('created_at', endExclusiveIso),
      slugF
    )
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('products')
      .select('image_url, promotion_active, promotional_price, price')
      .eq('store_id', storeId)
      .eq('active', true),
    withSlugOrderSources(
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .gte('created_at', operationalStartIso)
        .lt('created_at', endExclusiveIso),
      slugF
    ),
    withSlugOrderSources(
      supabase
        .from('orders')
        .select('total')
        .eq('store_id', storeId)
        .gte('created_at', operationalStartIso)
        .lt('created_at', endExclusiveIso),
      slugF
    ),
    withSlugOrderSources(
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .gte('created_at', yBounds.startIso)
        .lt('created_at', yBounds.endExclusiveIso),
      slugF
    ),
    withSlugOrderSources(
      supabase
        .from('orders')
        .select('total')
        .eq('store_id', storeId)
        .gte('created_at', yBounds.startIso)
        .lt('created_at', yBounds.endExclusiveIso),
      slugF
    ),
    withSlugOrderSources(
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('status', 'pending'),
      slugF
    ),
    withSlugOrderSources(
      supabase
        .from('orders')
        .select('total')
        .eq('store_id', storeId)
        .gte('created_at', monthB.monthStart)
        .lt('created_at', monthB.monthEndExclusive),
      slugF
    ),
    withSlugOrderSources(
      supabase
        .from('orders')
        .select('total')
        .eq('store_id', storeId)
        .gte('created_at', monthB.prevMonthStart)
        .lt('created_at', monthB.prevMonthEndExclusive),
      slugF
    ),
    withSlugOrderSources(
      supabase
        .from('orders')
        .select('id, created_at, total, status, customer_name')
        .eq('store_id', storeId),
      slugF
    )
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  if (ordersRes.error) {
    console.error('[dashboard] today orders:', ordersRes.error.message)
  }
  if (productsRes.error) {
    console.error('[dashboard] products signals:', productsRes.error.message)
  }

  const ordersToday =
    todayCountRes.error || todayCountRes.count == null
      ? 0
      : todayCountRes.count
  const revenueToday = sumTotals(todayTotalsRes.data)
  const ordersYesterday =
    yCountRes.error || yCountRes.count == null ? 0 : yCountRes.count
  const revenueYesterday = sumTotals(yTotalsRes.data)
  const pendingOrders =
    pendingRes.error || pendingRes.count == null ? 0 : pendingRes.count
  const avgTicketToday =
    ordersToday > 0 ? revenueToday / ordersToday : 0
  const monthRevenue = sumTotals(monthTotalsRes.data)
  const prevMonthRevenue = sumTotals(prevMonthTotalsRes.data)

  const recentOrders: DashboardRecentOrderRow[] = recentRes.error
    ? []
    : ((recentRes.data as DashboardRecentOrderRow[] | null) ?? [])

  const topProducts = await fetchTopProductsForStore(
    storeId,
    supabase,
    options?.slugChannelSourcesOnly
  )

  const overview: DashboardOverview = {
    ordersToday,
    revenueToday,
    ordersYesterday,
    revenueYesterday,
    pendingOrders,
    avgTicketToday,
    monthRevenue,
    prevMonthRevenue,
    recentOrders,
    topProducts,
  }

  return {
    todayOrders: (ordersRes.data as DashboardTodayOrder[] | null) ?? [],
    activeProducts:
      (productsRes.data as DashboardProductSignalRow[] | null) ?? [],
    overview,
  }
}
