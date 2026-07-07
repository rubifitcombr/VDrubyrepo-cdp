import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import {
  effectiveMonthlyRevenueBrl,
  readStoreContract,
  type StoreContractSnapshot,
} from '@/lib/contract-pricing'
import { planMonthlyAmountBrl, type Plan } from '@/lib/plan'

/** Valores mensais (BRL) para MRR estimado no admin — inclui desconto de contrato anual. */
export function valorMensalPlano(
  plan: Plan,
  operationMode: MerchantOperationMode | null = null,
  contract?: StoreContractSnapshot | null
): number {
  return effectiveMonthlyRevenueBrl(plan, operationMode, contract ?? null)
}

export function valorMensalPlanoFromStore(
  plan: Plan,
  operationMode: MerchantOperationMode | null,
  store: Record<string, unknown>
): number {
  return valorMensalPlano(plan, operationMode, readStoreContract(store))
}

/** Preço de tabela mensal (sem desconto anual). */
export function valorMensalTabela(
  plan: Plan,
  operationMode: MerchantOperationMode | null = null
): number {
  return planMonthlyAmountBrl(plan, operationMode)
}
