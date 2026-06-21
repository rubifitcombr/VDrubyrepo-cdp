/**
 * Normaliza um telefone para uso em links wa.me / api.whatsapp.com.
 *
 * Links wa.me exigem o número no formato internacional (com código de país).
 * Quando o lojista cadastra só o DDD + número (ex.: "62 99999-9999"), o link
 * "wa.me/62999999999" faz o WhatsApp tratar "62" como código de país (Indonésia)
 * e o número não é reconhecido — em qualquer WhatsApp, normal ou Business.
 *
 * Regra (Brasil): números locais têm 10 (fixo: DDD + 8) ou 11 (móvel: DDD + 9)
 * dígitos. Nesses casos prefixamos "55". Números já com 12/13 dígitos são
 * considerados completos (já têm o código de país) e ficam como estão. Tratar
 * só 10/11 dígitos evita prefixar errado o DDD 55 (Rio Grande do Sul).
 */
export function toWhatsAppLinkNumber(
  raw: string | null | undefined
): string | null {
  if (!raw) return null
  let digits = String(raw).replace(/\D/g, '')
  if (!digits) return null
  // Remove prefixo internacional "00" e zeros à esquerda antes do DDD.
  digits = digits.replace(/^0+/, '')
  if (!digits) return null
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`
  }
  return digits
}

/** Monta um link wa.me com o número normalizado e texto opcional. */
export function buildWhatsAppLink(
  raw: string | null | undefined,
  text?: string
): string | null {
  const number = toWhatsAppLinkNumber(raw)
  if (!number) return null
  const base = `https://wa.me/${number}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}
