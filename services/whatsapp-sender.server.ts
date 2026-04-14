import 'server-only'
import {
  getStoreEvolutionInstanceName,
  sendEvolutionTextMessage,
} from '@/services/evolution-api.server'

type SendWhatsAppMessageInput = {
  storeId: string
  to: string
  text: string
}

const RECENT_AUTO_REPLIES = new Map<string, number>()
const DEFAULT_COOLDOWN_MS = 30_000

/**
 * Anti-spam inicial (memória local de processo).
 * Em produção distribuída, migrar para Redis/DB.
 */
export function shouldSkipAutoReply(
  key: string,
  cooldownMs: number = DEFAULT_COOLDOWN_MS
): boolean {
  const now = Date.now()
  const previous = RECENT_AUTO_REPLIES.get(key)
  if (previous && now - previous < cooldownMs) return true
  RECENT_AUTO_REPLIES.set(key, now)
  return false
}

function normalizePhone(input: string): string {
  return input.replace(/\D/g, '')
}

function readEvolutionConfig() {
  const baseUrl = process.env.EVOLUTION_API_BASE_URL?.trim() || ''
  const apiKey = process.env.EVOLUTION_API_KEY?.trim() || ''
  const enabled = !!baseUrl && !!apiKey
  return { enabled }
}

export async function sendWhatsAppMessage({
  storeId,
  to,
  text,
}: SendWhatsAppMessageInput): Promise<void> {
  const toNumber = normalizePhone(to)
  const message = text.trim()
  if (!toNumber || !message) {
    throw new Error('Parâmetros inválidos para envio WhatsApp.')
  }

  if (!readEvolutionConfig().enabled) {
    // Fallback local: mantém o fluxo funcional sem provider real.
    console.log('[whatsapp-mock] Enviando mensagem para:', toNumber, message)
    return
  }

  const instanceName = getStoreEvolutionInstanceName(storeId)
  await sendEvolutionTextMessage({
    instanceName,
    to: toNumber,
    text: message,
  })
}
