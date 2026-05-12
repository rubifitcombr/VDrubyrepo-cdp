import type { PaperMm } from '@/lib/print/layout'
import { DEFAULT_PAPER_MM } from '@/lib/print/layout'

export type StorePrintingKey =
  | 'print_auto_on_confirm'
  | 'print_include_customer_details'
  | 'print_delivery_copy'

export type StorePrintingState = Record<StorePrintingKey, boolean> & {
  print_paper_mm: PaperMm
}

function boolFromStore(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  return fallback
}

function paperMmFromStore(v: unknown): PaperMm {
  const n = Number(v)
  if (n === 58) return 58
  if (n === 80) return 80
  return DEFAULT_PAPER_MM
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
    print_paper_mm: paperMmFromStore(row.print_paper_mm),
  }
}
