import { formatCnpj } from '@/lib/br-document'

/** Dados jurídicos da contratada (Arcano Digital / Vyria Delivery). */
export const VYRIA_CONTRATADA_RAZAO_SOCIAL = 'Arcano Digital Ltda.'
export const VYRIA_CONTRATADA_CNPJ = '63745900000188'
export const VYRIA_CONTRATADA_CNPJ_LABEL = '63.745.900/0001-88'

const OBSOLETE_RAZAO_SOCIAL = 'Vyria Delivery Tecnologia Ltda.'

export function resolveVyriaContratadaRazaoSocial(value?: string | null): string {
  const trimmed = String(value || '').trim()
  if (!trimmed || trimmed === OBSOLETE_RAZAO_SOCIAL) {
    return VYRIA_CONTRATADA_RAZAO_SOCIAL
  }
  return trimmed
}

export function resolveVyriaContratadaCnpjLabel(
  label?: string | null,
  cnpjDigits?: string | null
): string {
  const digits = String(cnpjDigits || '').replace(/\D/g, '')
  if (digits.length === 14) return formatCnpj(digits)

  const trimmedLabel = String(label || '').trim()
  if (!trimmedLabel || trimmedLabel === '—') return VYRIA_CONTRATADA_CNPJ_LABEL

  const labelDigits = trimmedLabel.replace(/\D/g, '')
  if (labelDigits.length === 14) return formatCnpj(labelDigits)

  return trimmedLabel
}

export function resolveVyriaContratadaCnpjDigits(value?: string | null): string {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 14) return digits
  return VYRIA_CONTRATADA_CNPJ
}
