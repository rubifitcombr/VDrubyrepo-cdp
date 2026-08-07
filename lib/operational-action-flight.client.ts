'use client'

export type OperationalActionKind = 'caixa-close' | 'orders-status' | 'waiter-order'

const inFlight = new Set<string>()

export function operationalActionKey(
  kind: OperationalActionKind,
  orderId: string
): string {
  return `${kind}:${orderId}`
}

export function beginOperationalAction(key: string): void {
  inFlight.add(key)
}

export function endOperationalAction(key: string): void {
  inFlight.delete(key)
}

export function isOperationalActionInFlight(key: string): boolean {
  return inFlight.has(key)
}
