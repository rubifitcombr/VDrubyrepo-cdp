import 'server-only'

import { createHmac, timingSafeEqual } from 'crypto'

const TOKEN_TTL_SEC = 2 * 60 * 60 // 2 h — janela do checkout PIX

function secret(): string {
  const s =
    process.env.CHECKOUT_ACCESS_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.IMPERSONATION_COOKIE_SECRET?.trim() ||
    ''
  if (!s && process.env.NODE_ENV === 'production') {
    throw new Error(
      'CHECKOUT_ACCESS_SECRET (ou CRON_SECRET) é obrigatório em produção.'
    )
  }
  return s || 'dev-checkout-access-secret-change-me'
}

function signPayload(slug: string, orderId: string, exp: number): string {
  return createHmac('sha256', secret())
    .update(`${slug}:${orderId}:${exp}`)
    .digest('hex')
}

/** Token opaco para consultar/confirmar PIX sem expor acesso anónimo à tabela orders. */
export function issueCheckoutAccessToken(slug: string, orderId: string): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC
  const sig = signPayload(slug, orderId, exp)
  return `${exp}.${sig}`
}

export function verifyCheckoutAccessToken(
  token: string | null | undefined,
  slug: string,
  orderId: string
): boolean {
  const raw = String(token ?? '').trim()
  if (!raw || !slug || !orderId) return false
  const dot = raw.indexOf('.')
  if (dot <= 0) return false
  const expStr = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  const expected = signPayload(slug, orderId, exp)
  try {
    const a = Buffer.from(sig, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
