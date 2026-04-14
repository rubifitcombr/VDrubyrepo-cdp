export const DAY_KEYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const

export type DayKey = (typeof DAY_KEYS)[number]

export type DaySlot = {
  closed: boolean
  open: string
  close: string
}

export type WeeklyHours = Record<DayKey, DaySlot>

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Segunda',
  tue: 'Terça',
  wed: 'Quarta',
  thu: 'Quinta',
  fri: 'Sexta',
  sat: 'Sábado',
  sun: 'Domingo',
}

export const DEFAULT_WEEKLY_HOURS = (): WeeklyHours => ({
  mon: { closed: false, open: '09:00', close: '22:00' },
  tue: { closed: false, open: '09:00', close: '22:00' },
  wed: { closed: false, open: '09:00', close: '22:00' },
  thu: { closed: false, open: '09:00', close: '22:00' },
  fri: { closed: false, open: '09:00', close: '22:00' },
  sat: { closed: false, open: '09:00', close: '22:00' },
  sun: { closed: true, open: '09:00', close: '22:00' },
})

const WEEKDAY_EN_TO_KEY: Record<string, DayKey> = {
  Sun: 'sun',
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
}

function parseHm(s: string): number {
  const p = s.trim().split(':')
  const h = parseInt(p[0] ?? '0', 10)
  const m = parseInt(p[1] ?? '0', 10)
  if (Number.isNaN(h)) return 0
  return h * 60 + (Number.isNaN(m) ? 0 : m)
}

function normalizeSlot(raw: unknown): DaySlot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const closed = Boolean(o.closed)
  const open = typeof o.open === 'string' ? o.open : '09:00'
  const close = typeof o.close === 'string' ? o.close : '22:00'
  return { closed, open, close }
}

/** Mescla JSON guardado com valores por omissão. */
export function parseWeeklyHours(raw: unknown): WeeklyHours {
  const base = DEFAULT_WEEKLY_HOURS()
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Record<string, unknown>
  const days = obj.days
  if (!days || typeof days !== 'object') return base
  const d = days as Record<string, unknown>
  for (const k of DAY_KEYS) {
    const slot = normalizeSlot(d[k])
    if (slot) base[k] = slot
  }
  return base
}

/** Para gravar na coluna `business_hours` (jsonb). */
export function serializeWeeklyHours(hours: WeeklyHours): { days: WeeklyHours } {
  return { days: hours }
}

export function getSaoPauloNowParts(date = new Date()): {
  dayKey: DayKey
  minutes: number
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((x) => [x.type, x.value])
  )
  const dayKey = WEEKDAY_EN_TO_KEY[parts.weekday ?? ''] ?? 'mon'
  const hour = parseInt(parts.hour ?? '0', 10)
  const minute = parseInt(parts.minute ?? '0', 10)
  return { dayKey, minutes: hour * 60 + minute }
}

export function isOpenFromWeeklyHours(
  hours: WeeklyHours,
  date = new Date()
): boolean {
  const { dayKey, minutes } = getSaoPauloNowParts(date)
  const slot = hours[dayKey]
  if (!slot || slot.closed) return false
  const o = parseHm(slot.open)
  const c = parseHm(slot.close)
  if (c <= o) return minutes >= o || minutes < c
  return minutes >= o && minutes < c
}

/** Sem horário definido na BD → consideramos sempre aberto (comportamento anterior). */
export function hasConfiguredBusinessHours(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const days = (raw as { days?: unknown }).days
  return days != null && typeof days === 'object' && Object.keys(days as object).length > 0
}

export function getStoreOpenState(
  businessHoursJson: unknown,
  options?: { manualClosed?: boolean; now?: Date }
): { open: boolean; mode: 'always' | 'scheduled' | 'manual' } {
  const date = options?.now ?? new Date()
  if (options?.manualClosed === true) {
    return { open: false, mode: 'manual' }
  }
  if (!hasConfiguredBusinessHours(businessHoursJson)) {
    return { open: true, mode: 'always' }
  }
  const weekly = parseWeeklyHours(businessHoursJson)
  return {
    open: isOpenFromWeeklyHours(weekly, date),
    mode: 'scheduled',
  }
}

/** Hora de fecho de hoje (Brasília), p.ex. `22:30`, para textos tipo "Aberto até às …". */
export function getTodayClosingDisplayHM(
  businessHoursJson: unknown,
  date = new Date()
): string | null {
  if (!hasConfiguredBusinessHours(businessHoursJson)) return null
  const weekly = parseWeeklyHours(businessHoursJson)
  const { dayKey } = getSaoPauloNowParts(date)
  const slot = weekly[dayKey]
  if (!slot || slot.closed) return null
  const parts = slot.close.trim().split(':')
  const h = (parts[0] ?? '22').padStart(2, '0')
  const m = (parts[1] ?? '00').padStart(2, '0')
  return `${h}:${m}`
}

export function todayHoursLine(
  businessHoursJson: unknown,
  date = new Date()
): string {
  if (!hasConfiguredBusinessHours(businessHoursJson)) {
    return 'Horário não definido — mostramos como aberto no link público.'
  }
  const weekly = parseWeeklyHours(businessHoursJson)
  const { dayKey } = getSaoPauloNowParts(date)
  const slot = weekly[dayKey]
  if (slot.closed) return `Hoje (${DAY_LABELS[dayKey]}): fechado`
  return `Hoje: ${slot.open} – ${slot.close} (horário de Brasília)`
}
