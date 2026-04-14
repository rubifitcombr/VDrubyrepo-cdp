import 'server-only'

import type { FinanceCompareData } from '@/lib/finance-charts'
import { createClient } from '@/lib/supabase/server'

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

function isCancelled(status: string | null | undefined) {
  return status === 'cancelled'
}

function sumTotalsNonCancelled(
  rows: { total: number | string | null; status?: string | null }[] | null
): number {
  if (!rows?.length) return 0
  let sum = 0
  for (const r of rows) {
    if (isCancelled(r.status)) continue
    const n = Number(r.total)
    if (!Number.isNaN(n)) sum += n
  }
  return sum
}

export type FinancePageData = {
  revenueToday: number
  revenueYesterday: number
  monthRevenue: number
  prevMonthRevenue: number
}

const emptyFinance: FinancePageData = {
  revenueToday: 0,
  revenueYesterday: 0,
  monthRevenue: 0,
  prevMonthRevenue: 0,
}

export async function getFinancePageData(
  storeId: string | null
): Promise<FinancePageData> {
  if (!storeId) return { ...emptyFinance }

  const supabase = await createClient()
  const now = new Date()
  const { startIso, endExclusiveIso } = saoPauloDayBounds(now)
  const yB = saoPauloDayBounds(new Date(now.getTime() - 86400000))
  const mB = saoPauloMonthPair(now)

  const [todayRes, yestRes, monthRes, prevRes] = await Promise.all([
    supabase
      .from('orders')
      .select('total, status')
      .eq('store_id', storeId)
      .gte('created_at', startIso)
      .lt('created_at', endExclusiveIso),
    supabase
      .from('orders')
      .select('total, status')
      .eq('store_id', storeId)
      .gte('created_at', yB.startIso)
      .lt('created_at', yB.endExclusiveIso),
    supabase
      .from('orders')
      .select('total, status')
      .eq('store_id', storeId)
      .gte('created_at', mB.monthStart)
      .lt('created_at', mB.monthEndExclusive),
    supabase
      .from('orders')
      .select('total, status')
      .eq('store_id', storeId)
      .gte('created_at', mB.prevMonthStart)
      .lt('created_at', mB.prevMonthEndExclusive),
  ])

  if (todayRes.error || yestRes.error || monthRes.error || prevRes.error) {
    console.error(
      '[finance]',
      todayRes.error?.message,
      yestRes.error?.message,
      monthRes.error?.message,
      prevRes.error?.message
    )
    return { ...emptyFinance }
  }

  return {
    revenueToday: sumTotalsNonCancelled(todayRes.data),
    revenueYesterday: sumTotalsNonCancelled(yestRes.data),
    monthRevenue: sumTotalsNonCancelled(monthRes.data),
    prevMonthRevenue: sumTotalsNonCancelled(prevRes.data),
  }
}

/* ——— Comparativo (timezone America/Sao_Paulo) — séries longas → Relatórios ——— */

function spDateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso))
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

function spTodayKey(now = new Date()): string {
  return spDateKey(now.toISOString())
}

/** Dia da semana curto en-US em São Paulo (Mon…Sun). */
function spWeekdayShort(ymd: string): string {
  const t = spYmdToStartUtcMs(ymd)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  }).format(new Date(t))
}

/** Segunda-feira (ISO) da semana civil que contém ymd, em São Paulo. */
function mondayOfCalendarWeekSp(ymd: string): string {
  const wd = spWeekdayShort(ymd)
  const daysBackFromMonday: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  }
  return addCalendarDaysSp(ymd, -(daysBackFromMonday[wd] ?? 0))
}

function sumDayRange(
  byDay: Map<string, number>,
  fromKey: string,
  toKey: string
): number {
  let sum = 0
  let k = fromKey
  for (let i = 0; i < 400; i++) {
    sum += byDay.get(k) ?? 0
    if (k === toKey) break
    k = addCalendarDaysSp(k, 1)
  }
  return sum
}

function daysFromStartToInclusive(startKey: string, endKey: string): number {
  let n = 0
  let k = startKey
  for (;;) {
    n += 1
    if (k === endKey) break
    k = addCalendarDaysSp(k, 1)
  }
  return n
}

const emptyCompare: FinanceCompareData = {
  compare: {
    today: 0,
    yesterday: 0,
    weekCurrent: 0,
    weekPrevious: 0,
    monthPartial: 0,
    monthPrevSameDays: 0,
  },
}

export async function getFinanceCompareData(
  storeId: string | null
): Promise<FinanceCompareData> {
  const now = new Date()
  const todayKey = spTodayKey(now)
  const mB0 = saoPauloMonthPair(now)
  const monthStartKey = spDateKey(mB0.monthStart)
  const prevMonthStartKey = spDateKey(mB0.prevMonthStart)

  if (!storeId) return { ...emptyCompare }

  const startChartKey = addCalendarDaysSp(todayKey, -75)
  const startChartIso = new Date(spYmdToStartUtcMs(startChartKey)).toISOString()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('orders')
    .select('created_at, total, status')
    .eq('store_id', storeId)
    .gte('created_at', startChartIso)

  if (error) {
    console.error('[finance compare]', error.message)
    return { ...emptyCompare }
  }

  const byDay = new Map<string, number>()
  for (const r of data ?? []) {
    if (isCancelled(r.status)) continue
    const t = Number(r.total)
    if (Number.isNaN(t)) continue
    const key = spDateKey(r.created_at)
    byDay.set(key, (byDay.get(key) ?? 0) + t)
  }

  const yesterdayKey = addCalendarDaysSp(todayKey, -1)
  const mondayThisWeek = mondayOfCalendarWeekSp(todayKey)
  const mondayPrevWeek = addCalendarDaysSp(mondayThisWeek, -7)
  const sundayPrevWeek = addCalendarDaysSp(mondayThisWeek, -1)

  const dim = daysFromStartToInclusive(monthStartKey, todayKey)
  let monthPartial = 0
  let monthPrevSameDays = 0
  for (let i = 0; i < dim; i++) {
    const kCur = addCalendarDaysSp(monthStartKey, i)
    const kPrev = addCalendarDaysSp(prevMonthStartKey, i)
    monthPartial += byDay.get(kCur) ?? 0
    monthPrevSameDays += byDay.get(kPrev) ?? 0
  }

  return {
    compare: {
      today: byDay.get(todayKey) ?? 0,
      yesterday: byDay.get(yesterdayKey) ?? 0,
      weekCurrent: sumDayRange(byDay, mondayThisWeek, todayKey),
      weekPrevious: sumDayRange(byDay, mondayPrevWeek, sundayPrevWeek),
      monthPartial,
      monthPrevSameDays,
    },
  }
}
