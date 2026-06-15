'use client'

import type { StoreOrderRow } from '@/lib/store-order'
import type { StorePrintingState } from '@/lib/store-printing'
import {
  buildOrderTicketEscPos,
  uint8ToBase64,
  type OrderTicketVariant,
} from '@/lib/print'

export type PrintAgentClientResult =
  | { ok: true }
  | { ok: false; message: string; code?: string; detail?: string }

type AgentJson = {
  ok?: boolean
  error?: string
  code?: string
  detail?: string
}

function normalizeAgentBase(url: string): string | null {
  const base = String(url || '').trim().replace(/\/+$/, '')
  if (!base || !/^https?:\/\//i.test(base)) return null
  return base
}

function printAgentMessage(
  error: string | undefined,
  code?: string,
  detail?: string
): string {
  if (error) return detail ? `${error} (${detail})` : error
  if (code === 'unauthorized') return 'Token do Print Agent incorreto.'
  if (code === 'printer_timeout') return 'Impressora não respondeu. Confere IP, porta, Wi-Fi/cabo e se a impressora está ligada.'
  if (code === 'printer_connection_refused') return 'A impressora recusou a conexão. A porta pode estar errada.'
  if (code === 'printer_offline') return 'Impressora offline ou IP fora da rede do Print Agent.'
  return 'Não foi possível enviar a comanda ao Print Agent.'
}

export function canUseConfiguredPrintAgent(
  printing: Pick<
    StorePrintingState,
    'print_agent_url' | 'print_printer_ip' | 'print_printer_port'
  >
): boolean {
  return Boolean(
    normalizeAgentBase(printing.print_agent_url) &&
      String(printing.print_printer_ip || '').trim() &&
      Number(printing.print_printer_port || 9100) > 0
  )
}

export async function sendEscPosToPrintAgent(
  printing: Pick<
    StorePrintingState,
    | 'print_agent_url'
    | 'print_agent_token'
    | 'print_printer_ip'
    | 'print_printer_port'
  >,
  escPosBytes: Uint8Array,
  opts?: { timeoutMs?: number }
): Promise<PrintAgentClientResult> {
  const base = normalizeAgentBase(printing.print_agent_url)
  const printerIp = String(printing.print_printer_ip || '').trim()
  const printerPort = Number(printing.print_printer_port || 9100) || 9100

  if (!base) {
    return { ok: false, code: 'agent_not_configured', message: 'URL do Print Agent inválida.' }
  }
  if (!printerIp) {
    return { ok: false, code: 'printer_not_configured', message: 'IP da impressora não configurado.' }
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), opts?.timeoutMs ?? 9000)

  try {
    const res = await fetch(`${base}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-token': printing.print_agent_token?.trim() || 'vyria-agent-2026',
      },
      body: JSON.stringify({
        printerIp,
        printerPort,
        data: uint8ToBase64(escPosBytes),
      }),
      signal: controller.signal,
    })
    const json = (await res.json().catch(() => ({}))) as AgentJson
    if (!res.ok || json.ok === false) {
      return {
        ok: false,
        code: json.code || `http_${res.status}`,
        detail: json.detail,
        message: printAgentMessage(json.error, json.code, json.detail),
      }
    }
    return { ok: true }
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === 'AbortError'
        ? 'Tempo esgotado ao contactar o Print Agent.'
        : error instanceof TypeError
          ? 'O navegador não conseguiu contactar o Print Agent. Confere URL, HTTPS/HTTP, firewall e rede local.'
          : error instanceof Error
            ? error.message
            : String(error)
    return { ok: false, code: 'agent_offline', message }
  } finally {
    window.clearTimeout(timer)
  }
}

export async function sendOrderTicketToPrintAgent(
  opts: {
    storeName: string
    order: StoreOrderRow
    orderDisplayRef: string
    printing: Pick<
      StorePrintingState,
      'print_include_customer_details' | 'print_delivery_copy' | 'print_paper_mm'
    >
    variant?: OrderTicketVariant
  },
  agent: StorePrintingState
): Promise<PrintAgentClientResult> {
  try {
    const bytes = buildOrderTicketEscPos(opts)
    return await sendEscPosToPrintAgent(agent, bytes)
  } catch (error) {
    return {
      ok: false,
      code: 'build_failed',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
