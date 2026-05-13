import type { PaperMm } from '@/lib/print/layout'
import { DEFAULT_PAPER_MM } from '@/lib/print/layout'

export type StorePrintingKey =
  | 'print_auto_on_confirm'
  | 'print_include_customer_details'
  | 'print_delivery_copy'
  | 'print_auto_delivery'
  | 'print_auto_autoatendimento'
  | 'print_auto_pdv'
  | 'print_auto_garcom'

export type StorePrintingState = Record<StorePrintingKey, boolean> & {
  print_paper_mm: PaperMm
  print_agent_url: string
  print_agent_token: string
  print_printer_ip: string
  print_printer_port: number
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

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function portFromStore(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  const n = Number.parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : 9100
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
    print_auto_delivery: boolFromStore(row.print_auto_delivery, false),
    print_auto_autoatendimento: boolFromStore(
      row.print_auto_autoatendimento,
      false
    ),
    print_auto_pdv: boolFromStore(row.print_auto_pdv, false),
    print_auto_garcom: boolFromStore(row.print_auto_garcom, false),
    print_agent_url: str(row.print_agent_url).trim(),
    print_agent_token: str(row.print_agent_token).trim() || 'vyria-agent-2026',
    print_printer_ip: str(row.print_printer_ip).trim(),
    print_printer_port: portFromStore(row.print_printer_port),
  }
}
