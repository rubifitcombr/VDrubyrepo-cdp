export type StoreAutomationKey =
  | 'auto_whatsapp_confirm'
  | 'auto_accept_orders'
  | 'auto_notify_new_order'
  | 'auto_close_outside_hours'
  | 'auto_whatsapp_delivery'

export type StoreAutomationsState = Record<StoreAutomationKey, boolean>

function boolFromStore(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  return fallback
}

export function parseAutomationsFromStore(
  row: Record<string, unknown>
): StoreAutomationsState {
  return {
    auto_whatsapp_confirm: boolFromStore(row.auto_whatsapp_confirm, false),
    auto_accept_orders: boolFromStore(row.auto_accept_orders, false),
    auto_notify_new_order: boolFromStore(row.auto_notify_new_order, false),
    auto_close_outside_hours: boolFromStore(
      row.auto_close_outside_hours,
      false
    ),
    auto_whatsapp_delivery: boolFromStore(row.auto_whatsapp_delivery, false),
  }
}
