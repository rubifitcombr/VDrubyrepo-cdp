/** Resultado estruturado de envio via Graph API /{phone_number_id}/messages. */

export type GraphWhatsAppSendSuccess = { ok: true; messageId: string }

export type GraphWhatsAppSendFailure = {
  ok: false
  error: string
  errorCode?: number
  /** Meta 131047 — mais de 24h desde o último inbound do cliente (re-engagement). */
  isWindowExpired: boolean
}

export type GraphWhatsAppSendResult = GraphWhatsAppSendSuccess | GraphWhatsAppSendFailure

/** Código oficial Meta: janela de atendimento de 24h expirada. */
export const WHATSAPP_META_ERROR_WINDOW_EXPIRED = 131047

export function parseGraphApiSendError(
  json: Record<string, unknown>,
  httpStatus?: number
): GraphWhatsAppSendFailure {
  const errObj = json.error as { message?: string; code?: number | string } | undefined
  const message =
    (typeof errObj?.message === 'string' && errObj.message.trim()) ||
    (httpStatus != null ? `Meta API HTTP ${httpStatus}` : 'Erro desconhecido da Meta API.')

  let errorCode: number | undefined
  if (errObj?.code != null) {
    const parsed = Number(errObj.code)
    if (!Number.isNaN(parsed)) errorCode = parsed
  }

  const isWindowExpired = errorCode === WHATSAPP_META_ERROR_WINDOW_EXPIRED

  return {
    ok: false,
    error: message,
    ...(errorCode != null ? { errorCode } : {}),
    isWindowExpired,
  }
}
