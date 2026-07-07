import 'server-only'

import type { AssinaturaAnnualContract, AssinaturaPageModel, BillingSubscriptionStatus } from '@/lib/billing'
import { shouldBlockDashboardAfterOverdue } from '@/lib/billing'
import { getAdminWhatsappHref } from '@/lib/admin-whatsapp-href.server'
import {
  annualSavingsVsListBrl,
  estimateContractPenalty,
  formatContractMonthlyLabel,
  formatMoneyBrl,
  isAnnualContractActive,
  PENALTY_TERMS_LINE,
  planContractMonthlyAmountBrl,
  readStoreContract,
  todayIsoLocal,
} from '@/lib/contract-pricing'
import { readContractAcceptance } from '@/lib/annual-contract-acceptance'
import type { Plan } from '@/lib/plan'
import { parseOperationModeFromStore } from '@/lib/merchant-operation-mode'
import { planMonthlyPriceLabel, planShortLabel } from '@/lib/plan'

export type DashboardBillingBanner = {
  openInvoiceDateLabel: string
  payUrl: string
} | null

export type DashboardBillingBlock = {
  payUrl: string | null
} | null

export type { AssinaturaPageModel }

function parseStatus(raw: unknown): BillingSubscriptionStatus {
  if (raw === 'overdue') return 'overdue'
  if (raw === 'cancelled') return 'cancelled'
  return 'active'
}

function formatOpenInvoiceDate(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return ''
  const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return raw
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

function formatYmdLabel(ymd: string): string {
  return formatOpenInvoiceDate(ymd)
}

function nextChargeFallback(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

function buildAnnualContractModel(
  store: Record<string, unknown>,
  plan: Plan,
  operationMode: ReturnType<typeof parseOperationModeFromStore>
): AssinaturaAnnualContract | null {
  const contract = readStoreContract(store)
  if (contract.billingCycle !== 'annual') return null

  const today = todayIsoLocal()
  const mensal =
    contract.contratoMensalBrl ?? planContractMonthlyAmountBrl(plan, operationMode)
  const penalty = estimateContractPenalty({ ...contract, contratoMensalBrl: mensal }, today)
  const contractEnded = !isAnnualContractActive(contract, today)
  const acceptance = readContractAcceptance(store)

  return {
    billingCycle: 'annual',
    mensalidadeLabel: formatContractMonthlyLabel(mensal),
    contratoInicioLabel: contract.contratoInicioEm
      ? formatYmdLabel(contract.contratoInicioEm)
      : '—',
    contratoFimLabel: contract.contratoFimEm ? formatYmdLabel(contract.contratoFimEm) : '—',
    descontoPct: contract.contratoDescontoPct,
    savingsLabel: formatMoneyBrl(annualSavingsVsListBrl(plan, operationMode)),
    penaltyTermsLine: PENALTY_TERMS_LINE,
    mesesRestantes: penalty?.mesesRestantes ?? 0,
    multaEstimadaLabel:
      penalty && penalty.multaBrl > 0 ? formatMoneyBrl(penalty.multaBrl) : null,
    contractEnded,
    documentoHash: acceptance.documentoHash,
    contratoAssinadoEm: acceptance.aceiteEm ? formatOpenInvoiceDate(acceptance.aceiteEm) : null,
    podeBaixarPdf: Boolean(acceptance.pdfPath && acceptance.documentoHash),
  }
}

export function getDashboardBillingBanner(
  store: Record<string, unknown> | null | undefined
): DashboardBillingBanner {
  if (!store) return null
  const status = parseStatus(store.billing_subscription_status)
  if (status !== 'overdue') return null
  const payUrl =
    typeof store.billing_invoice_pay_url === 'string'
      ? store.billing_invoice_pay_url.trim()
      : ''
  if (!payUrl) return null
  const raw = store.billing_open_invoice_at
  const openInvoiceDateLabel =
    formatOpenInvoiceDate(raw) ||
    formatOpenInvoiceDate(new Date().toISOString().slice(0, 10))
  if (!openInvoiceDateLabel) return null
  return { openInvoiceDateLabel, payUrl }
}

export function getDashboardBillingBlock(
  store: Record<string, unknown> | null | undefined
): DashboardBillingBlock {
  if (!store) return null
  const status = parseStatus(store.billing_subscription_status)
  if (status !== 'overdue') return null
  const overdueAt =
    typeof store.billing_overdue_at === 'string'
      ? store.billing_overdue_at
      : null
  if (!shouldBlockDashboardAfterOverdue(overdueAt)) return null
  const payUrl =
    typeof store.billing_invoice_pay_url === 'string'
      ? store.billing_invoice_pay_url.trim()
      : ''
  return { payUrl: payUrl || null }
}

export async function getAssinaturaPageModel(
  store: Record<string, unknown> | null | undefined,
  effectivePlan: Plan,
  invoicesFromDb: import('@/lib/billing').BillingInvoiceRow[]
): Promise<AssinaturaPageModel> {
  const plan = effectivePlan
  const nextRaw = store?.billing_next_charge_at
  let nextChargeDateLabel = ''
  if (typeof nextRaw === 'string' && nextRaw.trim()) {
    nextChargeDateLabel = formatOpenInvoiceDate(nextRaw)
  }
  if (!nextChargeDateLabel) nextChargeDateLabel = nextChargeFallback()

  const planoVenceEm =
    typeof store?.plano_vence_em === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(store.plano_vence_em.trim())
      ? store.plano_vence_em.trim()
      : null

  const operationMode = parseOperationModeFromStore(store ?? null)
  const contract = readStoreContract(store ?? null)
  const priceLabel =
    contract.billingCycle === 'annual'
      ? formatContractMonthlyLabel(
          contract.contratoMensalBrl ?? planContractMonthlyAmountBrl(plan, operationMode)
        )
      : planMonthlyPriceLabel(plan, operationMode)

  const cancelRaw = store?.cancelamento_solicitado

  return {
    plan,
    planBadgeLabel: planShortLabel(plan),
    priceLabel,
    nextChargeDateLabel,
    planoVenceEm,
    subscriptionStatus: parseStatus(store?.billing_subscription_status),
    invoices: invoicesFromDb,
    whatsappHref: getAdminWhatsappHref(),
    operationMode,
    annualContract: store ? buildAnnualContractModel(store, plan, operationMode) : null,
    cancelamentoSolicitado:
      cancelRaw === true || cancelRaw === 'true' || cancelRaw === 1,
  }
}
