import 'server-only'

import {
  guardIpAccess,
  guardRateLimitExceeded,
  type IpGuardFailure,
} from '@/lib/ip-abuse-guard'

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number; guard?: IpGuardFailure }

/**
 * Rate limit in-memory (por instância serverless). Complementar com WAF/CDN em produção.
 */
export function checkRateLimit(
  ip: string,
  scope: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const blocked = guardIpAccess(ip)
  if (!blocked.ok) {
    return {
      ok: false,
      retryAfterSec: blocked.retryAfterSec,
      guard: blocked,
    }
  }

  const key = `${scope}:${ip}`
  const now = Date.now()
  const hit = buckets.get(key)

  if (!hit || now >= hit.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1 }
  }

  if (hit.count >= limit) {
    const guard = guardRateLimitExceeded(ip, scope)
    return {
      ok: false,
      retryAfterSec: guard.retryAfterSec,
      guard,
    }
  }

  hit.count += 1
  return { ok: true, remaining: limit - hit.count }
}

export function clientIpFromRequest(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

export function rateLimitResponse(
  retryAfterSec: number,
  message?: string,
  status = 429
): Response {
  return Response.json(
    {
      error:
        message || 'Demasiados pedidos. Tenta novamente dentro de momentos.',
    },
    {
      status,
      headers: { 'Retry-After': String(retryAfterSec) },
    }
  )
}
