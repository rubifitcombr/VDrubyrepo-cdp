/** Metadados da promoção guiada (serializados após marcador na coluna `description`). */

export const PROMO_META_MARKER = '\n\n__VYRIA_PROMO_V2__\n'

export type PromoKind =
  | 'combo'
  | 'product_discount'
  | 'bundle_more'
  | 'free_shipping'
  | 'coupon'

export type SchedulePreset = 'custom' | 'today' | 'weekend' | 'happy_hour'

export type DiscountMode = 'final' | 'percent' | 'fixed'

export type GuidedPromoMetaV2 = {
  v: 2
  kind: PromoKind
  productIds: string[]
  referenceTotal: number
  discountMode: DiscountMode
  discountPercent: number | null
  discountFixed: number | null
  schedulePreset: SchedulePreset
  validFrom: string | null
  validUntil: string | null
  timeStart: string | null
  timeEnd: string | null
  bundleRule: string | null
  couponCode: string | null
}

export const PROMO_KIND_LABEL: Record<PromoKind, string> = {
  combo: 'Combo',
  product_discount: 'Desconto em produto',
  bundle_more: 'Leve mais por menos',
  free_shipping: 'Frete grátis',
  coupon: 'Cupom',
}

export function needsProductPicker(kind: PromoKind): boolean {
  return kind === 'combo' || kind === 'product_discount' || kind === 'bundle_more'
}

export function needsDiscountStep(kind: PromoKind): boolean {
  return (
    kind === 'combo' ||
    kind === 'product_discount' ||
    kind === 'bundle_more' ||
    kind === 'coupon'
  )
}

function spYmdToStartUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 3, 0, 0, 0)
}

export function addCalendarDaysSp(ymd: string, delta: number): string {
  const t = spYmdToStartUtcMs(ymd) + delta * 86400000
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(t))
}

export function spTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date())
}

function spWeekdayShort(ymd: string): string {
  const t = spYmdToStartUtcMs(ymd)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  }).format(new Date(t))
}

function mondayOfCalendarWeekSp(ymd: string): string {
  const wd = spWeekdayShort(ymd)
  const back: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  }
  return addCalendarDaysSp(ymd, -(back[wd] ?? 0))
}

export function presetTodaySp(): { validFrom: string; validUntil: string } {
  const t = spTodayYmd()
  return { validFrom: t, validUntil: t }
}

export function presetWeekendSp(): { validFrom: string; validUntil: string } {
  const t = spTodayYmd()
  const mon = mondayOfCalendarWeekSp(t)
  return {
    validFrom: addCalendarDaysSp(mon, 5),
    validUntil: addCalendarDaysSp(mon, 6),
  }
}

export function presetHappyHourSp(): {
  validFrom: string
  validUntil: string
  timeStart: string
  timeEnd: string
} {
  const today = spTodayYmd()
  return {
    validFrom: today,
    validUntil: addCalendarDaysSp(today, 14),
    timeStart: '18:00',
    timeEnd: '23:00',
  }
}

export function buildDescriptionWithMeta(
  human: string,
  meta: GuidedPromoMetaV2
): string {
  const h = human.trim()
  return h + PROMO_META_MARKER + JSON.stringify(meta)
}

export function splitPromoDescription(raw: string | null): {
  human: string
  meta: GuidedPromoMetaV2 | null
} {
  if (!raw?.trim()) return { human: '', meta: null }
  const i = raw.indexOf(PROMO_META_MARKER)
  if (i === -1) return { human: raw.trim(), meta: null }
  const human = raw.slice(0, i).trim()
  try {
    const meta = JSON.parse(
      raw.slice(i + PROMO_META_MARKER.length)
    ) as GuidedPromoMetaV2
    if (meta && meta.v === 2) return { human, meta }
  } catch {
    /* ignore */
  }
  return { human: raw.trim(), meta: null }
}

export function sumReferenceFromCatalog(
  productIds: string[],
  catalog: { id: string; price: number | string | null }[]
): number {
  let s = 0
  for (const id of productIds) {
    const p = catalog.find((x) => x.id === id)
    if (p) {
      const n = Number(p.price)
      if (!Number.isNaN(n)) s += n
    }
  }
  return Math.round(s * 100) / 100
}

export function computePromoPrice(
  reference: number,
  mode: DiscountMode,
  finalStr: string,
  percentStr: string,
  fixedStr: string
): { promo: number | null; pct: number | null } {
  const finalN = parseMoney(finalStr)
  const pctN = parsePercent(percentStr)
  const fixN = parseMoney(fixedStr)
  if (reference <= 0) {
    if (mode === 'final' && finalN != null) return { promo: finalN, pct: null }
    return { promo: null, pct: null }
  }
  if (mode === 'final' && finalN != null && finalN > 0) {
    const pct = Math.round(((reference - finalN) / reference) * 1000) / 10
    return { promo: finalN, pct: Math.max(0, pct) }
  }
  if (mode === 'percent' && pctN != null && pctN >= 0) {
    const promo = Math.round(reference * (1 - pctN / 100) * 100) / 100
    return { promo: Math.max(0.01, promo), pct: pctN }
  }
  if (mode === 'fixed' && fixN != null && fixN >= 0) {
    const promo = Math.max(0.01, Math.round((reference - fixN) * 100) / 100)
    const pct = Math.round(((reference - promo) / reference) * 1000) / 10
    return { promo, pct: Math.max(0, pct) }
  }
  return { promo: null, pct: null }
}

function parseMoney(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const normalized = t.includes(',')
    ? t.replace(/\./g, '').replace(',', '.')
    : t.replace(/\s/g, '')
  const n = Number(normalized)
  if (Number.isNaN(n) || n < 0) return null
  return n
}

function parsePercent(raw: string): number | null {
  const t = raw.trim().replace('%', '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (Number.isNaN(n) || n < 0 || n > 100) return null
  return n
}

export function formatSchedulePreview(meta: GuidedPromoMetaV2): string {
  const parts: string[] = []
  if (meta.schedulePreset === 'today') parts.push('Só hoje')
  else if (meta.schedulePreset === 'weekend') parts.push('Fim de semana')
  else if (meta.schedulePreset === 'happy_hour') parts.push('Happy hour')
  if (meta.timeStart && meta.timeEnd) {
    parts.push(`${meta.timeStart} – ${meta.timeEnd}`)
  }
  if (meta.validFrom && meta.validUntil) {
    if (meta.validFrom === meta.validUntil) {
      parts.push(formatPtDate(meta.validFrom))
    } else {
      parts.push(`${formatPtDate(meta.validFrom)} → ${formatPtDate(meta.validUntil)}`)
    }
  } else if (meta.validUntil) {
    parts.push(`Até ${formatPtDate(meta.validUntil)}`)
  }
  return parts.filter(Boolean).join(' · ') || 'Sem limite de datas definido'
}

function formatPtDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  const dt = new Date(Date.UTC(y, m - 1, d))
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(dt)
}
