import 'server-only'

import type { Plan } from '@/lib/plan'
import { parsePlan, planTier } from '@/lib/plan'

/**
 * Plano efetivo no painel (server-only).
 * Em desenvolvimento:
 * - `VYRIA_DEV_FORCE_PLAN` — força o plano (START|GROWTH|PRO|MASTER).
 * - `VYRIA_DEV_PRO_EMAILS` — garante pelo menos PRO para emails listados, mas **não
 *   reduz** um plano já superior vindo do Supabase (ex.: MASTER na loja continua Master).
 */
export function effectiveDashboardPlan(
  userEmail: string | undefined | null,
  rawStorePlan: unknown
): Plan {
  const fromStore = parsePlan(rawStorePlan)

  if (process.env.NODE_ENV === 'development') {
    const forced = process.env.VYRIA_DEV_FORCE_PLAN?.trim().toUpperCase()
    if (
      userEmail &&
      (forced === 'PRO' ||
        forced === 'GROWTH' ||
        forced === 'START' ||
        forced === 'MASTER')
    ) {
      return forced as Plan
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
