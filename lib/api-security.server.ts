import 'server-only'

import { guardIpAccess } from '@/lib/ip-abuse-guard'
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitResponse,
} from '@/lib/rate-limit.server'

/** Aplica bloqueio por IP + rate limit; devolve Response ou null se OK. */
export function enforceApiRateLimit(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number
): Response | null {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(ip, scope, limit, windowMs)
  if (!rl.ok) {
    const status = rl.guard?.status === 403 ? 403 : 429
    return rateLimitResponse(
      rl.retryAfterSec,
      rl.guard?.message,
      status
    )
  }
  return null
}

/** Só verifica blocklist / bloqueio automático. */
export function enforceIpBlocklist(req: Request): Response | null {
  const ip = clientIpFromRequest(req)
  const blocked = guardIpAccess(ip)
  if (!blocked.ok) {
    return rateLimitResponse(blocked.retryAfterSec, blocked.message, 403)
  }
  return null
}
