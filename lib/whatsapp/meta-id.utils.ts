/** Dígitos apenas — útil para comparar telefone com display_phone_number da Meta. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Valores que parecem telefone (ex.: 5562983148719) e não o ID interno da Meta
 * (ex.: 1162876776919791 no campo Phone Number ID do painel).
 */
export function looksLikePhoneE164(value: string): boolean {
  const digits = digitsOnly(value)
  if (!digits) return false

  // Brasil: 55 + DDD (2) + 8 ou 9 dígitos
  if (/^55\d{10,11}$/.test(digits)) return true

  // Outros formatos internacionais comuns (10–13 dígitos, não IDs longos da Meta)
  if (digits.length >= 10 && digits.length <= 13) return true

  return false
}

export function phonesMatchE164(a: string, b: string): boolean {
  const da = digitsOnly(a)
  const db = digitsOnly(b)
  if (!da || !db) return false
  if (da === db) return true

  const stripCountry = (d: string) => (d.startsWith('55') && d.length > 11 ? d.slice(2) : d)
  return stripCountry(da) === stripCountry(db)
}

export function formatWhatsAppConnectError(
  rawError: string,
  context: { phoneNumberId: string; wabaId?: string }
): string {
  const err = rawError.trim()
  const looksLikePhone = looksLikePhoneE164(context.phoneNumberId)

  if (
    looksLikePhone &&
    (err.includes('does not exist') ||
      err.includes('Unsupported get request') ||
      err.includes('missing permissions'))
  ) {
    return (
      'O valor informado em «Phone Number ID» parece ser o número de telefone ' +
      `(${context.phoneNumberId}), não o ID interno da Meta. ` +
      'No Meta Business Suite → WhatsApp → API Setup, copie o «Phone number ID» ' +
      '(código numérico diferente do telefone). Se o WABA ID e o token estiverem corretos, ' +
      'pode colocar o telefone nesse campo — o sistema tentará localizar o ID automaticamente.'
    )
  }

  if (
    err.includes('does not exist') ||
    err.includes('Unsupported get request')
  ) {
    return (
      'Não foi possível validar o Phone Number ID na Meta. Confira se o ID, o WABA ID e o ' +
      'token pertencem à mesma conta WhatsApp Business e se o token tem permissão ' +
      'whatsapp_business_management / whatsapp_business_messaging.'
    )
  }

  return err
}
