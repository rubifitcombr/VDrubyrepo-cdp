import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import { planMonthlyAmountBrl, type Plan } from '@/lib/plan'

/** Valores mensais (BRL) para MRR estimado no admin — respeita modelo híbrido. */
export function valorMensalPlano(
  plan: Plan,
  operationMode: MerchantOperationMode | null = null
): number {
  return planMonthlyAmountBrl(plan, operationMode)
}
