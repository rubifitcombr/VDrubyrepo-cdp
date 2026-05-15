import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import { planMonthlyAmountBrl, planShortLabel, type Plan } from '@/lib/plan'

const moneyBr = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export type AdminPlanOption = {
  code: Plan
  label: string
  priceLabel: string
}

/** Preço mensal formatado para selects do admin (sem sufixo «/mês»). */
export function adminPlanPriceLabel(
  plan: Plan,
  operationMode: MerchantOperationMode | null = null
): string {
  return moneyBr.format(planMonthlyAmountBrl(plan, operationMode))
}

/** Opções de plano no admin — preços conforme modelo de operação da loja. */
export function adminPlanOptionsForOperationMode(
  operationMode: MerchantOperationMode | null = null
): AdminPlanOption[] {
  return (['START', 'GROWTH', 'PRO'] as const).map((code) => ({
    code,
    label: planShortLabel(code),
    priceLabel: adminPlanPriceLabel(code, operationMode),
  }))
}

/** Legado: tabela Delivery/Presencial (modo não definido). */
export const ADMIN_PLAN_OPTIONS: AdminPlanOption[] =
  adminPlanOptionsForOperationMode(null)
