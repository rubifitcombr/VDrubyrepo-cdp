export type StoreAutomationKey =
  | 'auto_accept_orders'
  | 'auto_notify_new_order'
  | 'auto_close_outside_hours'

export type StoreAutomationsState = Record<StoreAutomationKey, boolean>

function boolFromStore(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  return fallback
}

export function parseAutomationsFromStore(
  row: Record<string, unknown>
): StoreAutomationsState {
  return {
    auto_accept_orders: boolFromStore(row.auto_accept_orders, false),
    auto_notify_new_order: boolFromStore(row.auto_notify_new_order, false),
    auto_close_outside_hours: boolFromStore(
      row.auto_close_outside_hours,
      false
    ),
  }
}
