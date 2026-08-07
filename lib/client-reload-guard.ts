'use client'

/** Pedidos em voo via `dashboardFetch` — adiar reload enquanto > 0. */
let dashboardFetchInFlight = 0

export function trackDashboardFetchStart(): void {
  dashboardFetchInFlight += 1
}

export function trackDashboardFetchEnd(): void {
  dashboardFetchInFlight = Math.max(0, dashboardFetchInFlight - 1)
}

export function getDashboardFetchInFlightCount(): number {
  return dashboardFetchInFlight
}

function isEditableFocused(): boolean {
  if (typeof document === 'undefined') return false
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el instanceof HTMLElement && el.isContentEditable) return true
  return false
}

/** Adia reload automático de versão enquanto o utilizador edita ou há API em curso. */
export function shouldDeferClientReload(): boolean {
  return isEditableFocused() || dashboardFetchInFlight > 0
}
