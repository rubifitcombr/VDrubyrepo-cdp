import 'server-only'

import { createHmac, timingSafeEqual } from 'crypto'
import type { ImpersonationContext } from '@/lib/impersonation'

const SEP = '.'

function secret(): string | null {
  const s =
    process.env.IMPERSONATION_COOKIE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    null
  return s && s.length >= 16 ? s : null
}

function signPayload(payloadB64: string): string | null {
  const key = secret()
  if (!key) return null
  return createHmac('sha256', key).update(payloadB64).digest('base64url')
}

export function sealImpersonationContext(ctx: ImpersonationContext): string {
  const payload = Buffer.from(JSON.stringify(ctx), 'utf8').toString('base64url')
  const sig = signPayload(payload)
  if (!sig) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'IMPERSONATION_COOKIE_SECRET em falta (mín. 16 caracteres).'
      )
    }
    return JSON.stringify(ctx)
  }
  return `${payload}${SEP}${sig}`
}

export function openImpersonationContext(
  raw: string | null | undefined
): ImpersonationContext | null {
  if (!raw) return null

  const trimmed = raw.trim()
  const key = secret()

  if (!trimmed.includes(SEP)) {
    if (key) return null
    return legacyParse(trimmed)
  }

  const sepIdx = trimmed.lastIndexOf(SEP)
  const payloadB64 = trimmed.slice(0, sepIdx)
  const sig = trimmed.slice(sepIdx + 1)
  const expected = signPayload(payloadB64)

  if (!expected) {
    return null
  }

  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null
    }
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8')
    return legacyParse(json)
  } catch {
    return null
  }
}

function legacyParse(raw: string): ImpersonationContext | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ImpersonationContext>
    const storeId = String(parsed.storeId ?? '').trim()
    if (!storeId) return null
    return {
      storeId,
      storeName: String(parsed.storeName ?? '').trim() || 'lojista',
    }
  } catch {
    return null
  }
}
