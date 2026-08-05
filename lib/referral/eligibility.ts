import type { Plan } from '@/lib/plan'
import { planTier } from '@/lib/plan'
import { parseMerchantStatus } from '@/lib/merchant-status'
import { readStorePlano, readStoreStatus } from '@/lib/store-columns'

/** Indique e Ganhe: Growth, Pro e Master (Start excluído). */
export function planEligibleForReferralProgram(plan: Plan): boolean {
  return planTier(plan) >= planTier('GROWTH')
}

export function storeRowEligibleAsReferrer(row: Record<string, unknown>): boolean {
  const status = parseMerchantStatus(readStoreStatus(row))
  if (status !== 'ativo') return false
  const plan = readStorePlano(row)
  if (!plan) return false
  return planEligibleForReferralProgram(plan as Plan)
}
