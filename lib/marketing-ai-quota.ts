import type { Plan } from '@/lib/plan'

export type MarketingAiKind = 'description'

/** Limites mensais de descrição com IA por plano. */
export function getMarketingAiMonthlyLimit(
  plan: Plan,
  kind: MarketingAiKind
): number | null {
  if (kind !== 'description') return 0
  if (plan === 'GROWTH') return 20
  if (plan !== 'PRO') return 0
  return 45
}
