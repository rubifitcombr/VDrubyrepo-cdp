/** Nova sessão se não houve inbound do cliente há mais de 6 horas. */
export const WHATSAPP_SESSION_GAP_MS = 6 * 60 * 60 * 1000

export function isWhatsAppNewSession(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return true
  const prev = new Date(lastInboundAt).getTime()
  if (Number.isNaN(prev)) return true
  return Date.now() - prev > WHATSAPP_SESSION_GAP_MS
}
