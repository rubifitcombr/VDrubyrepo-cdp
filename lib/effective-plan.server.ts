import 'server-only'

import type { Plan } from '@/lib/plan'
import { parsePlan, planTier } from '@/lib/plan'

function normalizeDevForcePlan(raw: string): Plan | null {
  const u = raw.trim().toUpperCase()
  if (u === 'START' || u === 'GROWTH' || u === 'PRO' || u === 'MASTER') return u
  return null
}

/**
 * Plano efetivo no painel (server-only).
 * Em desenvolvimento:
 * - `VYRIA_DEV_FORCE_PLAN` — força o plano (START|GROWTH|PRO|MASTER).
 * - `VYRIA_DEV_PRO_EMAILS` — garante pelo menos PRO para emails listados, mas **não
 *   reduz** um plano já superior vindo do Supabase.
 */
export function effectiveDashboardPlan(
  userEmail: string | undefined | null,
  rawStorePlan: unknown
): Plan {
  const fromStore = parsePlan(rawStorePlan)

  if (process.env.NODE_ENV === 'development') {
    const forced = normalizeDevForcePlan(process.env.VYRIA_DEV_FORCE_PLAN || '')
    if (userEmail && forced) {
      return forced
    }

    const allow = (process.env.VYRIA_DEV_PRO_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
    const email = userEmail?.trim().toLowerCase()
    if (email && allow.includes(email)) {
      return planTier(fromStore) >= planTier('PRO') ? fromStore : 'PRO'
    }
  }

  return fromStore
}

/**
 * Plano efectivo da loja em rotas públicas (checkout, cardápio, fidelidade).
 * Sem email de utilizador — em produção equivale a `parsePlan` do registo da loja.
 */
export function effectiveStorePlan(rawStorePlan: unknown): Plan {
  return effectiveDashboardPlan(null, rawStorePlan)
}
