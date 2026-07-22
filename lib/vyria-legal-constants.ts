import { formatCnpj } from '@/lib/br-document'

const OBSOLETE_RAZAO_SOCIAL = 'Vyria Delivery Tecnologia Ltda.'

export function resolveVyriaContratadaRazaoSocial(value?: string | null): string {
  const trimmed = String(value || '').trim()
  if (!trimmed || trimmed === OBSOLETE_RAZAO_SOCIAL) return ''
  return trimmed
}

export function resolveVyriaContratadaCnpjLabel(
  label?: string | null,
  cnpjDigits?: string | null
): string {
  const digits = String(cnpjDigits || '').replace(/\D/g, '')
  if (digits.length === 14) return formatCnpj(digits)

  const trimmedLabel = String(label || '').trim()
  if (!trimmedLabel || trimmedLabel === '—') return ''

  const labelDigits = trimmedLabel.replace(/\D/g, '')
  if (labelDigits.length === 14) return formatCnpj(labelDigits)

  return trimmedLabel
}

export function resolveVyriaContratadaCnpjDigits(value?: string | null): string {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 14) return digits
  return ''
}
