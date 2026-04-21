import type { Plan } from '@/lib/plan'

/** Limites de análises de cardápio por foto / mês (matriz comercial). */
export function getMenuImportMonthlyLimit(plan: Plan): number | null {
  switch (plan) {
    case 'GROWTH':
      return 5
    case 'PRO':
      return 15
    default:
      return 0
  }
}

export function currentYearMonthUtc(): string {
  return new Date().toISOString().slice(0, 7)
}
