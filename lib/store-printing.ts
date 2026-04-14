export type StorePrintingKey =
  | 'print_auto_on_confirm'
  | 'print_include_customer_details'
  | 'print_delivery_copy'

export type StorePrintingState = Record<StorePrintingKey, boolean>

function boolFromStore(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  return fallback
}

export function parsePrintingFromStore(
  row: Record<string, unknown>
): StorePrintingState {
  return {
    print_auto_on_confirm: boolFromStore(row.print_auto_on_confirm, false),
    print_include_customer_details: boolFromStore(
      row.print_include_customer_details,
      false
    ),
    print_delivery_copy: boolFromStore(row.print_delivery_copy, false),
  }
}
