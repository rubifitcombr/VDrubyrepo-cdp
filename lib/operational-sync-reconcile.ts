import type { StoreOrderRow } from '@/lib/store-order'

/**
 * TTL de segurança — só expira se o request não completar (rede pendurada).
 * Enquanto a acção estiver em voo, o overlay nunca expira por tempo.
 */
export const OPERATIONAL_OVERLAY_SAFETY_MS = 90_000

/** @deprecated Use OPERATIONAL_OVERLAY_SAFETY_MS */
export const OPERATIONAL_PENDING_OVERLAY_MS = OPERATIONAL_OVERLAY_SAFETY_MS

export const OPERATIONAL_OVERLAY_CONFIRM_FAIL_MESSAGE =
  'Não foi possível confirmar a alteração. Verifique a conexão e atualize a página.'

export type PendingOrderOverlay = {
  expiresAt: number
  snapshot: StoreOrderRow
  actionKey: string
}

export type ReconcileOverlaysOptions = {
  onSafetyExpired?: (orderId: string, overlay: PendingOrderOverlay) => void
  isActionInFlight?: (actionKey: string) => boolean
}

export function clearPendingOrderOverlay(
  overlays: Map<string, PendingOrderOverlay>,
  orderId: string
): void {
  overlays.delete(orderId)
}

export function registerPendingOrderOverlay(
  overlays: Map<string, PendingOrderOverlay>,
  orderId: string,
  snapshot: StoreOrderRow,
  actionKey: string,
  safetyMs = OPERATIONAL_OVERLAY_SAFETY_MS
): void {
  overlays.set(orderId, {
    expiresAt: Date.now() + safetyMs,
    snapshot,
    actionKey,
  })
}

function isOperationalActionInFlight(
  pending: PendingOrderOverlay,
  options?: ReconcileOverlaysOptions
): boolean {
  return options?.isActionInFlight?.(pending.actionKey) ?? false
}

function shouldRetainOverlay(
  pending: PendingOrderOverlay,
  serverRow: StoreOrderRow | null,
  shouldKeepOverlay: (serverRow: StoreOrderRow, overlay: StoreOrderRow) => boolean,
  options?: ReconcileOverlaysOptions
): boolean {
  const now = Date.now()

  if (now >= pending.expiresAt) {
    options?.onSafetyExpired?.(serverRow?.id ?? pending.snapshot.id, pending)
    return false
  }

  if (isOperationalActionInFlight(pending, options)) {
    return true
  }

  if (!serverRow) {
    return isOperationalActionInFlight(pending, options)
  }

  if (shouldKeepOverlay(serverRow, pending.snapshot)) {
    return true
  }

  return false
}

/**
 * Reconcilia lista do servidor com overlays pendentes.
 * Mantém overlay enquanto `dashboardFetch`/acção estiver em voo ou servidor ainda não reflectiu.
 */
export function reconcileOrdersWithPendingOverlays(
  serverRows: StoreOrderRow[],
  overlays: Map<string, PendingOrderOverlay>,
  shouldKeepOverlay: (serverRow: StoreOrderRow, overlay: StoreOrderRow) => boolean,
  options?: ReconcileOverlaysOptions
): StoreOrderRow[] {
  const byServerId = new Map(serverRows.map((row) => [row.id, row]))
  const merged: StoreOrderRow[] = []
  const consumed = new Set<string>()

  for (const serverRow of serverRows) {
    const pending = overlays.get(serverRow.id)
    if (!pending) {
      merged.push(serverRow)
      continue
    }
    if (
      shouldRetainOverlay(pending, serverRow, shouldKeepOverlay, options)
    ) {
      merged.push(pending.snapshot)
      consumed.add(serverRow.id)
      continue
    }
    overlays.delete(serverRow.id)
    merged.push(serverRow)
    consumed.add(serverRow.id)
  }

  for (const [id, pending] of overlays) {
    if (consumed.has(id)) continue
    if (shouldRetainOverlay(pending, null, shouldKeepOverlay, options)) {
      merged.push(pending.snapshot)
    } else {
      overlays.delete(id)
    }
  }

  return merged.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}
