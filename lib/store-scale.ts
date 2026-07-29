import type {
  ScaleBrand,
  ScaleConnectionType,
  ScaleProtocol,
} from '@/lib/scale/types'

export type StoreScaleState = {
  scale_enabled: boolean
  scale_connection: ScaleConnectionType
  scale_brand: ScaleBrand | null
  scale_protocol: ScaleProtocol
  scale_baud_rate: number
  scale_auto_add_stable: boolean
  scale_plu_prefix: string
  /** Porta serial local no PC do agente (ex.: COM3, /dev/ttyUSB0). */
  scale_serial_port: string
}

/** Contexto PDV: config da balança + credenciais do Print Agent (mesma URL/token da impressão). */
export type PdvScaleContext = StoreScaleState & {
  agentUrl: string
  agentToken: string
}

const CONNECTIONS = new Set<ScaleConnectionType>([
  'web_serial',
  'agent',
  'barcode_only',
])

const BRANDS = new Set<ScaleBrand>(['toledo', 'filizola', 'urano', 'generic'])

function boolFromStore(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  return fallback
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function parseConnection(v: unknown): ScaleConnectionType {
  const s = str(v).trim().toLowerCase()
  if (CONNECTIONS.has(s as ScaleConnectionType)) return s as ScaleConnectionType
  return 'web_serial'
}

function parseBrand(v: unknown): ScaleBrand | null {
  const s = str(v).trim().toLowerCase()
  if (BRANDS.has(s as ScaleBrand)) return s as ScaleBrand
  return null
}

function parseProtocol(v: unknown): ScaleProtocol {
  const s = str(v).trim().toLowerCase()
  if (s === 'toledo_p03') return 'toledo_p03'
  return 'toledo_p03'
}

function baudFromStore(v: unknown): number {
  const n = Number.parseInt(String(v ?? ''), 10)
  if (n === 2400 || n === 4800 || n === 9600 || n === 19200) return n
  return 9600
}

export function parseScaleFromStore(
  row: Record<string, unknown>
): StoreScaleState {
  return {
    scale_enabled: boolFromStore(row.scale_enabled, false),
    scale_connection: parseConnection(row.scale_connection),
    scale_brand: parseBrand(row.scale_brand),
    scale_protocol: parseProtocol(row.scale_protocol),
    scale_baud_rate: baudFromStore(row.scale_baud_rate),
    scale_auto_add_stable: boolFromStore(row.scale_auto_add_stable, false),
    scale_plu_prefix: str(row.scale_plu_prefix).trim() || '2',
    scale_serial_port: str(row.scale_serial_port).trim(),
  }
}

export function parsePdvScaleContext(
  row: Record<string, unknown>
): PdvScaleContext {
  return {
    ...parseScaleFromStore(row),
    agentUrl: str(row.print_agent_url).trim(),
    agentToken: str(row.print_agent_token).trim() || 'vyria-agent-2026',
  }
}
