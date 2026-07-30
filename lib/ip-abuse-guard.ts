/**
 * Bloqueio progressivo por IP (memória por instância).
 * Complementar com WAF/CDN e ABUSE_IP_BLOCKLIST no deploy.
 */

type ViolationBucket = { count: number; resetAt: number }
type BlockEntry = { until: number; reason: string }

const blocks = new Map<string, BlockEntry>()
const violationsShort = new Map<string, ViolationBucket>()
const violationsLong = new Map<string, ViolationBucket>()

const SHORT_WINDOW_MS = 10 * 60_000 // 10 min
const LONG_WINDOW_MS = 6 * 60 * 60_000 // 6 h — padrão do ataque reportado

/** Bloqueio curto após rajadas rápidas. */
const SHORT_VIOLATIONS_TO_BLOCK = 4
const SHORT_BLOCK_MS = 60 * 60_000 // 1 h

/** Bloqueio longo após abuso sustentado (centenas em horas). */
const LONG_VIOLATIONS_TO_BLOCK = 12
const LONG_BLOCK_MS = 24 * 60 * 60_000 // 24 h

function parseIpSet(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set()
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

function staticBlocklist(): Set<string> {
  return parseIpSet(process.env.ABUSE_IP_BLOCKLIST)
}

function staticAllowlist(): Set<string> {
  return parseIpSet(process.env.ABUSE_IP_ALLOWLIST)
}

function normalizeIp(ip: string): string {
  const v = ip.trim()
  return v || 'unknown'
}

function bumpViolation(
  store: Map<string, ViolationBucket>,
  ip: string,
  windowMs: number
): number {
  const now = Date.now()
  const hit = store.get(ip)
  if (!hit || now >= hit.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs })
    return 1
  }
  hit.count += 1
  return hit.count
}

/** Regista excesso de pedidos; pode activar bloqueio automático. */
export function recordIpAbuseViolation(ip: string, reason: string): void {
  const key = normalizeIp(ip)
  if (staticAllowlist().has(key)) return

  const shortCount = bumpViolation(violationsShort, key, SHORT_WINDOW_MS)
  const longCount = bumpViolation(violationsLong, key, LONG_WINDOW_MS)

  const now = Date.now()
  if (longCount >= LONG_VIOLATIONS_TO_BLOCK) {
    blocks.set(key, { until: now + LONG_BLOCK_MS, reason: `abuse-long:${reason}` })
    return
  }
  if (shortCount >= SHORT_VIOLATIONS_TO_BLOCK) {
    const cur = blocks.get(key)
    if (!cur || cur.until < now + SHORT_BLOCK_MS) {
      blocks.set(key, { until: now + SHORT_BLOCK_MS, reason: `abuse-short:${reason}` })
    }
  }
}

export function isIpBlocked(ip: string): {
  blocked: boolean
  retryAfterSec: number
  reason?: string
} {
  const key = normalizeIp(ip)
  if (staticAllowlist().has(key)) {
    return { blocked: false, retryAfterSec: 0 }
  }
  if (staticBlocklist().has(key)) {
    return { blocked: true, retryAfterSec: 3600, reason: 'blocklist' }
  }

  const entry = blocks.get(key)
  if (!entry) return { blocked: false, retryAfterSec: 0 }

  const now = Date.now()
  if (now >= entry.until) {
    blocks.delete(key)
    return { blocked: false, retryAfterSec: 0 }
  }

  return {
    blocked: true,
    retryAfterSec: Math.max(1, Math.ceil((entry.until - now) / 1000)),
    reason: entry.reason,
  }
}

export type IpGuardResult =
  | { ok: true }
  | { ok: false; status: 403 | 429; retryAfterSec: number; message: string }

export type IpGuardFailure = Extract<IpGuardResult, { ok: false }>

/** Verifica blocklist + bloqueio automático antes do rate limit. */
export function guardIpAccess(ip: string): IpGuardResult {
  const blocked = isIpBlocked(ip)
  if (blocked.blocked) {
    return {
      ok: false,
      status: 403,
      retryAfterSec: blocked.retryAfterSec,
      message: 'Acesso temporariamente bloqueado por excesso de pedidos.',
    }
  }
  return { ok: true }
}

export function guardRateLimitExceeded(
  ip: string,
  scope: string
): IpGuardFailure {
  recordIpAbuseViolation(ip, scope)
  const blocked = isIpBlocked(ip)
  if (blocked.blocked) {
    return {
      ok: false,
      status: 403,
      retryAfterSec: blocked.retryAfterSec,
      message: 'Acesso bloqueado por comportamento abusivo.',
    }
  }
  return {
    ok: false,
    status: 429,
    retryAfterSec: 60,
    message: 'Demasiados pedidos. Tenta novamente dentro de momentos.',
  }
}
