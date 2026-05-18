import { hasPixCheckout, parsePlan } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'

/** Tipos de chave PIX (cadastro no painel). */
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'

const TYPE_LABELS: Record<PixKeyType, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  phone: 'Telefone',
  random: 'Aleatória',
}

export function pixKeyKindLabel(type: PixKeyType): string {
  return TYPE_LABELS[type] ?? type
}

export const PIX_KEY_TYPE_OPTIONS: { value: PixKeyType; label: string }[] = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'random', label: 'Aleatória' },
]

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

function isValidCpfDigits(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i)
  let r = (sum * 10) % 11
  if (r === 10) r = 0
  if (r !== Number(d[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i)
  r = (sum * 10) % 11
  if (r === 10) r = 0
  return r === Number(d[10])
}

function isValidCnpjDigits(d: string): boolean {
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * w1[i]!
  let r = sum % 11
  const d1 = r < 2 ? 0 : 11 - r
  if (d1 !== Number(d[12])) return false
  sum = 0
  for (let i = 0; i < 13; i++) sum += Number(d[i]) * w2[i]!
  r = sum % 11
  const d2 = r < 2 ? 0 : 11 - r
  return d2 === Number(d[13])
}

/** Detecta o tipo da chave a partir do texto (heurística). */
export function detectPixKeyKind(input: string): PixKeyType | null {
  const raw = input.trim()
  if (!raw) return null
  if (raw.includes('@')) return 'email'
  const d = digitsOnly(raw)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return 'random'
  }
  if (d.length === 11 && isValidCpfDigits(d)) return 'cpf'
  if (d.length === 14 && isValidCnpjDigits(d)) return 'cnpj'
  if (d.length >= 10 && d.length <= 13) return 'phone'
  if (d.length === 11) return 'cpf'
  if (d.length === 14) return 'cnpj'
  if (raw.length >= 26) return 'random'
  return null
}

export function parsePixKeyTypeInput(raw: unknown): PixKeyType | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (s === 'cpf' || s === 'cnpj' || s === 'email' || s === 'phone' || s === 'random') {
    return s
  }
  if (s === 'aleatoria' || s === 'aleatória' || s === 'evp') return 'random'
  if (s === 'telefone' || s === 'tel') return 'phone'
  return null
}

export function normalizePixKey(
  input: string,
  forcedType?: PixKeyType | null
): { ok: true; value: string; type: PixKeyType } | { ok: false; error: string } {
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'Indica a chave PIX.' }

  const type = forcedType ?? detectPixKeyKind(raw)
  if (!type) {
    return {
      ok: false,
      error: 'Chave PIX inválida ou tipo não reconhecido. Escolhe o tipo manualmente.',
    }
  }

  if (type === 'email') {
    const email = raw.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'E-mail PIX inválido.' }
    }
    return { ok: true, value: email, type }
  }

  if (type === 'random') {
    const uuidLike =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    if (!uuidLike && raw.replace(/[^0-9a-f]/gi, '').length < 26) {
      return { ok: false, error: 'Chave aleatória inválida (formato UUID esperado).' }
    }
    return { ok: true, value: raw.toLowerCase(), type }
  }

  const d = digitsOnly(raw)
  if (type === 'cpf') {
    if (d.length !== 11 || !isValidCpfDigits(d)) {
      return { ok: false, error: 'CPF inválido.' }
    }
    return { ok: true, value: d, type }
  }

  if (type === 'cnpj') {
    if (d.length !== 14 || !isValidCnpjDigits(d)) {
      return { ok: false, error: 'CNPJ inválido.' }
    }
    return { ok: true, value: d, type }
  }

  if (type === 'phone') {
    let phone = d
    if (phone.length < 10 || phone.length > 13) {
      return { ok: false, error: 'Telefone PIX inválido (10 a 13 dígitos).' }
    }
    if (phone.length <= 11 && !phone.startsWith('55')) {
      phone = `55${phone}`
    }
    return { ok: true, value: `+${phone}`, type }
  }

  return { ok: false, error: 'Chave PIX inválida.' }
}

/** Lojista com PIX activo para checkout público (plano Pro + chave configurada). */
export function storePixCheckoutEnabled(store: Record<string, unknown>): boolean {
  const plan = parsePlan(readStorePlano(store))
  if (!hasPixCheckout(plan)) return false
  const key =
    typeof store.pix_key === 'string' ? store.pix_key.trim() : ''
  if (!key) return false
  if ('pix_enabled' in store && store.pix_enabled === false) return false
  return true
}
