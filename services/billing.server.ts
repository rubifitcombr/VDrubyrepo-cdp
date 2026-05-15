import 'server-only'

import type { AssinaturaPageModel, BillingSubscriptionStatus } from '@/lib/billing'
import { shouldBlockDashboardAfterOverdue } from '@/lib/billing'
import { getAdminWhatsappHref } from '@/lib/admin-whatsapp-href.server'
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

function nextChargeFallback(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
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

  return {
    plan,
    planBadgeLabel: planShortLabel(plan),
    priceLabel: planMonthlyPriceLabel(plan, operationMode),
    nextChargeDateLabel,
    planoVenceEm,
    subscriptionStatus: parseStatus(store?.billing_subscription_status),
    invoices: invoicesFromDb,
    whatsappHref: getAdminWhatsappHref(),
    operationMode,
  }
}
