export type BrDocumentType = 'cpf' | 'cnpj'

export function digitsOnly(value: string): string {
  return String(value || '').replace(/\D/g, '')
}

export function formatCpf(digits: string): string {
  const d = digitsOnly(digits).slice(0, 11)
  if (d.length !== 11) return digits
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function formatCnpj(digits: string): string {
  const d = digitsOnly(digits).slice(0, 14)
  if (d.length !== 14) return digits
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

function allSameDigits(d: string): boolean {
  return /^(\d)\1+$/.test(d)
}

export function validateCpf(value: string): boolean {
  const cpf = digitsOnly(value)
  if (cpf.length !== 11 || allSameDigits(cpf)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i)
  let d1 = (sum * 10) % 11
  if (d1 === 10) d1 = 0
  if (d1 !== Number(cpf[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i)
  let d2 = (sum * 10) % 11
  if (d2 === 10) d2 = 0
  return d2 === Number(cpf[10])
}

export function validateCnpj(value: string): boolean {
  const cnpj = digitsOnly(value)
  if (cnpj.length !== 14 || allSameDigits(cnpj)) return false
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(cnpj[i]) * w1[i]!
  let d1 = sum % 11
  d1 = d1 < 2 ? 0 : 11 - d1
  if (d1 !== Number(cnpj[12])) return false
  sum = 0
  for (let i = 0; i < 13; i++) sum += Number(cnpj[i]) * w2[i]!
  let d2 = sum % 11
  d2 = d2 < 2 ? 0 : 11 - d2
  return d2 === Number(cnpj[13])
}

export function parseBrDocument(
  tipo: unknown,
  numero: unknown
): { tipo: BrDocumentType; numero: string; label: string } | null {
  const t = String(tipo || '')
    .trim()
    .toLowerCase()
  const digits = digitsOnly(String(numero || ''))
  if (t === 'cpf') {
    if (!validateCpf(digits)) return null
    return { tipo: 'cpf', numero: digits, label: formatCpf(digits) }
  }
  if (t === 'cnpj') {
    if (!validateCnpj(digits)) return null
    return { tipo: 'cnpj', numero: digits, label: formatCnpj(digits) }
  }
  return null
}

export function brDocumentTypeLabel(tipo: BrDocumentType): string {
  return tipo === 'cpf' ? 'CPF' : 'CNPJ'
}
