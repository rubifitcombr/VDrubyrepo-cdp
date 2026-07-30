import {
  guardIpAccess,
  guardRateLimitExceeded,
  type IpGuardFailure,
  type IpGuardResult,
} from '@/lib/ip-abuse-guard'

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export type { IpGuardResult }

export type EdgeRateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number; guard?: IpGuardFailure }

/** Bloqueio + rate limit no Edge (complementar com WAF/CDN). */
export function checkEdgeRateLimit(
  ip: string,
  scope: string,
  limit: number,
  windowMs: number
): EdgeRateLimitResult {
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

export function clientIpFromEdgeRequest(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}
