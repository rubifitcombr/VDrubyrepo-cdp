import type { Plan } from '@/lib/plan'

export type MarketingAiKind = 'description' | 'image'

/** Limites mensais no plano Pro (Master = ilimitado). */
export function getMarketingAiMonthlyLimit(
  plan: Plan,
  kind: MarketingAiKind
): number | null {
  if (plan === 'MASTER') return null
  if (plan !== 'PRO') return 0
  return kind === 'description' ? 45 : 25
}
