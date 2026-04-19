import 'server-only'

import type { BillingSubscriptionStatus } from '@/lib/billing'
import {
  parseBillingInvoices,
  parsePaymentMethod,
  shouldBlockDashboardAfterOverdue,
} from '@/lib/billing'
import type { AssinaturaPageModel } from '@/lib/billing'
import type { Plan } from '@/lib/plan'
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

export function getAssinaturaPageModel(
  store: Record<string, unknown> | null | undefined,
  effectivePlan: Plan
): AssinaturaPageModel {
  const plan = effectivePlan
  const nextRaw = store?.billing_next_charge_at
  let nextChargeDateLabel = ''
  if (typeof nextRaw === 'string' && nextRaw.trim()) {
    nextChargeDateLabel = formatOpenInvoiceDate(nextRaw)
  }
  if (!nextChargeDateLabel) nextChargeDateLabel = nextChargeFallback()

  const paymentChangeUrl =
    typeof store?.billing_payment_update_url === 'string'
      ? store.billing_payment_update_url.trim() || null
      : null

  const invoices = parseBillingInvoices(store?.billing_invoices)

  return {
    plan,
    planBadgeLabel: planShortLabel(plan),
    priceLabel: planMonthlyPriceLabel(plan),
    nextChargeDateLabel,
    subscriptionStatus: parseStatus(store?.billing_subscription_status),
    paymentMethod: parsePaymentMethod(store?.billing_payment_method),
    paymentChangeUrl,
    invoices,
  }
}
