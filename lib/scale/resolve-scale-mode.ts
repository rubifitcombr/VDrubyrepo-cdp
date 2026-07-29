import { isWebSerialSupported } from '@/lib/scale-client'
import type { PdvScaleContext } from '@/lib/store-scale'

export type PdvScaleLiveMode = 'web_serial' | 'agent' | 'manual'

/**
 * Modo de leitura ao vivo no PDV.
 * - web_serial: navegador liga à balança (Chrome/Edge)
 * - agent: Print Agent local (fallback Firefox/Safari ou `scale_connection=agent`)
 * - manual: só entrada manual de peso
 */
export function resolvePdvScaleLiveMode(
  config: Pick<
    PdvScaleContext,
    'scale_enabled' | 'scale_connection' | 'agentUrl'
  >
): PdvScaleLiveMode {
  if (!config.scale_enabled) return 'manual'
  if (config.scale_connection === 'barcode_only') return 'manual'

  if (config.scale_connection === 'agent') {
    return config.agentUrl ? 'agent' : 'manual'
  }

  if (isWebSerialSupported()) return 'web_serial'
  if (config.agentUrl) return 'agent'
  return 'manual'
}

export function canPollScaleAgent(config: PdvScaleContext): boolean {
  return resolvePdvScaleLiveMode(config) === 'agent' && Boolean(config.agentUrl)
}
