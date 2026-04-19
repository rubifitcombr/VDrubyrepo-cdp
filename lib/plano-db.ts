import type { Plan } from '@/lib/plan'

/** Valor em `stores.plano` (minúsculas). */
export function planToPlanoColumn(plan: Plan): string {
  return plan.toLowerCase()
}
