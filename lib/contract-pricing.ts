import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import { planMonthlyAmountBrl, type Plan } from '@/lib/plan'

/** Desconto no compromisso anual (mensalidade = tabela × (1 − desconto/100)). */
export const ANNUAL_CONTRACT_DISCOUNT_PCT = 15

/** Multa por cancelamento antecipado = percentual do valor restante. */
export const EARLY_TERMINATION_PENALTY_PCT = 50

export type BillingCycle = 'monthly' | 'annual'

export type StoreContractSnapshot = {
  billingCycle: BillingCycle
  contratoInicioEm: string | null
  contratoFimEm: string | null
  contratoMensalBrl: number | null
  contratoDescontoPct: number
}

export const PENALTY_TERMS_LINE =
  'Cancelamento antecipado do contrato anual: multa de 50% sobre o valor das mensalidades restantes.'

const moneyBrl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function parseBillingCycle(raw: unknown): BillingCycle {
  return String(raw ?? '')
    .trim()
    .toLowerCase() === 'annual'
    ? 'annual'
    : 'monthly'
}

export function todayIsoLocal(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

export function addDaysIso(baseYmd: string | null, days: number): string {
  const d = baseYmd
    ? new Date(baseYmd.includes('T') ? baseYmd : `${baseYmd.trim()}T12:00:00`)
    : new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Soma meses de calendário a uma data YYYY-MM-DD. */
export function addCalendarMonthsIso(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  dt.setMonth(dt.getMonth() + months)
  return dt.toISOString().slice(0, 10)
}

export function defaultAnnualContractEndIso(startYmd: string = todayIsoLocal()): string {
  return addCalendarMonthsIso(startYmd, 12)
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function planContractMonthlyAmountBrl(
  plan: Plan,
  operationMode: MerchantOperationMode | null = null
): number {
  const base = planMonthlyAmountBrl(plan, operationMode)
  return roundMoney(base * (1 - ANNUAL_CONTRACT_DISCOUNT_PCT / 100))
}

export function formatMoneyBrl(amount: number): string {
  return moneyBrl.format(amount)
}

export function formatContractMonthlyLabel(amount: number): string {
  return `${formatMoneyBrl(amount)}/mês`
}

export function annualSavingsVsListBrl(
  plan: Plan,
  operationMode: MerchantOperationMode | null = null
): number {
  const monthly = planMonthlyAmountBrl(plan, operationMode)
  const discounted = planContractMonthlyAmountBrl(plan, operationMode)
  return roundMoney((monthly - discounted) * 12)
}

export function readStoreContract(
  store: Record<string, unknown> | null | undefined
): StoreContractSnapshot {
  const billingCycle = parseBillingCycle(store?.billing_cycle)
  const contratoInicioEm =
    typeof store?.contrato_inicio_em === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(store.contrato_inicio_em.trim())
      ? store.contrato_inicio_em.trim()
      : null
  const contratoFimEm =
    typeof store?.contrato_fim_em === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(store.contrato_fim_em.trim())
      ? store.contrato_fim_em.trim()
      : null
  const rawMensal = store?.contrato_mensal_brl
  const contratoMensalBrl =
    typeof rawMensal === 'number' && Number.isFinite(rawMensal)
      ? rawMensal
      : typeof rawMensal === 'string' && rawMensal.trim() !== ''
        ? Number(rawMensal.replace(',', '.'))
        : null
  const rawDesc = store?.contrato_desconto_pct
  const contratoDescontoPct =
    typeof rawDesc === 'number' && Number.isFinite(rawDesc)
      ? rawDesc
      : typeof rawDesc === 'string' && rawDesc.trim() !== ''
        ? Number(rawDesc.replace(',', '.'))
        : ANNUAL_CONTRACT_DISCOUNT_PCT

  return {
    billingCycle,
    contratoInicioEm,
    contratoFimEm,
    contratoMensalBrl:
      contratoMensalBrl != null && Number.isFinite(contratoMensalBrl)
        ? roundMoney(contratoMensalBrl)
        : null,
    contratoDescontoPct: Number.isFinite(contratoDescontoPct)
      ? contratoDescontoPct
      : ANNUAL_CONTRACT_DISCOUNT_PCT,
  }
}

export function isAnnualContractActive(
  contract: StoreContractSnapshot,
  asOfYmd: string = todayIsoLocal()
): boolean {
  if (contract.billingCycle !== 'annual' || !contract.contratoFimEm) return false
  return contract.contratoFimEm >= asOfYmd
}

/**
 * Meses de calendário restantes até `contratoFimEm` (inclusive do mês final quando aplicável).
 */
export function remainingCalendarMonths(
  contratoFimEm: string,
  asOfYmd: string = todayIsoLocal()
): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(contratoFimEm) || contratoFimEm <= asOfYmd) return 0

  const [ey, em, ed] = contratoFimEm.split('-').map(Number)
  const [cy, cm, cd] = asOfYmd.split('-').map(Number)

  let months = (ey! - cy!) * 12 + (em! - cm!)
  if (ed! < cd!) months -= 1
  if (months <= 0 && contratoFimEm > asOfYmd) return 1
  return Math.max(0, months)
}

export function remainingContractValueBrl(
  contratoMensalBrl: number,
  contratoFimEm: string,
  asOfYmd: string = todayIsoLocal()
): number {
  const months = remainingCalendarMonths(contratoFimEm, asOfYmd)
  return roundMoney(contratoMensalBrl * months)
}

export function earlyTerminationPenaltyBrl(
  contratoMensalBrl: number,
  contratoFimEm: string,
  asOfYmd: string = todayIsoLocal()
): number {
  const remaining = remainingContractValueBrl(contratoMensalBrl, contratoFimEm, asOfYmd)
  return roundMoney(remaining * (EARLY_TERMINATION_PENALTY_PCT / 100))
}

export type ContractPenaltyEstimate = {
  mesesRestantes: number
  valorRestanteBrl: number
  multaBrl: number
}

export function estimateContractPenalty(
  contract: StoreContractSnapshot,
  asOfYmd: string = todayIsoLocal()
): ContractPenaltyEstimate | null {
  if (
    contract.billingCycle !== 'annual' ||
    !contract.contratoFimEm ||
    contract.contratoFimEm <= asOfYmd
  ) {
    return null
  }
  const mensal =
    contract.contratoMensalBrl ??
    null
  if (mensal == null || !Number.isFinite(mensal)) return null

  const mesesRestantes = remainingCalendarMonths(contract.contratoFimEm, asOfYmd)
  const valorRestanteBrl = remainingContractValueBrl(mensal, contract.contratoFimEm, asOfYmd)
  const multaBrl = earlyTerminationPenaltyBrl(mensal, contract.contratoFimEm, asOfYmd)
  return { mesesRestantes, valorRestanteBrl, multaBrl }
}

/** MRR estimado no admin — mensalidade efectiva (com desconto anual quando aplicável). */
export function effectiveMonthlyRevenueBrl(
  plan: Plan,
  operationMode: MerchantOperationMode | null,
  contract: StoreContractSnapshot | null | undefined
): number {
  if (contract?.billingCycle === 'annual') {
    if (contract.contratoMensalBrl != null && Number.isFinite(contract.contratoMensalBrl)) {
      return contract.contratoMensalBrl
    }
    return planContractMonthlyAmountBrl(plan, operationMode)
  }
  return planMonthlyAmountBrl(plan, operationMode)
}

export function buildAnnualContractDbPatch(input: {
  plan: Plan
  operationMode: MerchantOperationMode | null
  contratoInicioEm: string
  contratoFimEm: string
}): Record<string, unknown> {
  return {
    billing_cycle: 'annual',
    contrato_inicio_em: input.contratoInicioEm,
    contrato_fim_em: input.contratoFimEm,
    contrato_mensal_brl: planContractMonthlyAmountBrl(input.plan, input.operationMode),
    contrato_desconto_pct: ANNUAL_CONTRACT_DISCOUNT_PCT,
  }
}

export function buildMonthlyContractDbPatch(): Record<string, unknown> {
  return {
    billing_cycle: 'monthly',
    contrato_inicio_em: null,
    contrato_fim_em: null,
    contrato_mensal_brl: null,
    contrato_desconto_pct: null,
  }
}
