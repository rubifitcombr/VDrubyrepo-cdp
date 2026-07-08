export function spDateKeyGarcons(iso: string): string {
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

export function spTodayYmdGarcons(): string {
  return spDateKeyGarcons(new Date().toISOString())
}

export function defaultGarconsReportRange(): { from: string; to: string } {
  const to = spTodayYmdGarcons()
  return { from: addCalendarDaysSp(to, -30), to }
}

export function addCalendarDaysSpGarcons(ymd: string, delta: number): string {
  return addCalendarDaysSp(ymd, delta)
}

export function spYmdToStartUtcMsGarcons(ymd: string): number {
  return spYmdToStartUtcMs(ymd)
}
