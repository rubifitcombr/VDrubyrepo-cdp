import {
  buildSubscriptionBannerCopy,
  currentReferenceMonth,
  formatMoneyBrl,
  isSubscriptionLocked,
  todayIsoLocal,
} from '@/lib/subscription-billing-copy'
import type {
  SubscriptionBillingUiState,
  SubscriptionInvoiceRow,
} from '@/lib/subscription-billing-types'

export function subscriptionGateExemptPath(pathname: string): boolean {
  const p = pathname.split('?')[0] || '/'
  const n = p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p
  if (n === '/dashboard/assinatura' || n.startsWith('/dashboard/assinatura/')) return true
  if (n.startsWith('/api/billing/subscription/')) return true
  if (n === '/dashboard/contrato' || n.startsWith('/dashboard/contrato/')) return true
  if (n.startsWith('/api/contrato/')) return true
  if (n === '/logout' || n.startsWith('/logout/')) return true
  if (n === '/acesso-suspenso' || n.startsWith('/acesso-suspenso/')) return true
  return false
}

export function isMerchantApiSubscriptionGatePath(pathname: string): boolean {
  const p = pathname.split('?')[0] || '/'
  const n = p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p
  if (!n.startsWith('/api/')) return false
  if (n.startsWith('/api/billing/subscription/')) return false
  if (n.startsWith('/api/contrato/')) return false
  if (n.startsWith('/api/admin/')) return false
  if (n.startsWith('/api/public/')) return false
  if (n.startsWith('/api/webhooks/')) return false
  if (n.startsWith('/api/cron/')) return false
  if (n.startsWith('/api/auth/')) return false
  if (n.startsWith('/api/impersonate/')) return false
  return true
}

export function mapInvoiceRow(raw: Record<string, unknown>): SubscriptionInvoiceRow {
  return {
    id: String(raw.id ?? ''),
    store_id: String(raw.store_id ?? ''),
    reference_month: String(raw.reference_month ?? ''),
    amount_brl: Number(raw.amount_brl ?? 0),
    billing_cycle:
      String(raw.billing_cycle ?? 'monthly').toLowerCase() === 'annual'
        ? 'annual'
        : 'monthly',
    plan: String(raw.plan ?? ''),
    status: (['pending', 'paid', 'failed', 'waived'].includes(String(raw.status))
      ? String(raw.status)
      : 'pending') as SubscriptionInvoiceRow['status'],
    issued_at: String(raw.issued_at ?? ''),
    due_date: String(raw.due_date ?? '').slice(0, 10),
    paid_at: raw.paid_at ? String(raw.paid_at) : null,
    mp_payment_id: raw.mp_payment_id ? String(raw.mp_payment_id) : null,
    pix_qr_code: raw.pix_qr_code ? String(raw.pix_qr_code) : null,
    pix_qr_base64: raw.pix_qr_base64 ? String(raw.pix_qr_base64) : null,
    pix_copy_paste: raw.pix_copy_paste ? String(raw.pix_copy_paste) : null,
    created_at: String(raw.created_at ?? ''),
    updated_at: String(raw.updated_at ?? ''),
  }
}

export function buildSubscriptionBillingUiState(
  invoice: SubscriptionInvoiceRow | null,
  asOf: string = todayIsoLocal()
): SubscriptionBillingUiState {
  if (!invoice || invoice.status !== 'pending') {
    return {
      invoiceId: invoice?.id ?? null,
      referenceMonth: invoice?.reference_month ?? null,
      amountBrl: invoice?.amount_brl ?? null,
      amountLabel: invoice ? formatMoneyBrl(invoice.amount_brl) : null,
      dueDate: invoice?.due_date ?? null,
      status: invoice?.status ?? null,
      locked: false,
      showBanner: false,
      copy: null,
      pixQrBase64: null,
      pixCopyPaste: null,
      mpPaymentId: invoice?.mp_payment_id ?? null,
    }
  }

  const locked = isSubscriptionLocked(invoice.status, invoice.due_date, asOf)
  const amountLabel = formatMoneyBrl(invoice.amount_brl)
  const copy = buildSubscriptionBannerCopy({
    amountLabel,
    dueDate: invoice.due_date,
    asOf,
  })

  return {
    invoiceId: invoice.id,
    referenceMonth: invoice.reference_month,
    amountBrl: invoice.amount_brl,
    amountLabel,
    dueDate: invoice.due_date,
    status: invoice.status,
    locked,
    showBanner: !locked,
    copy,
    pixQrBase64: invoice.pix_qr_base64,
    pixCopyPaste: invoice.pix_copy_paste,
    mpPaymentId: invoice.mp_payment_id,
  }
}

export function requiresSubscriptionPayment(
  invoice: SubscriptionInvoiceRow | null,
  asOf: string = todayIsoLocal()
): boolean {
  if (!invoice || invoice.status !== 'pending') return false
  return true
}

export function requiresSubscriptionLock(
  invoice: { status: string; due_date: string } | null,
  asOf: string = todayIsoLocal()
): boolean {
  if (!invoice || invoice.status !== 'pending') return false
  return isSubscriptionLocked(invoice.status, invoice.due_date, asOf)
}

export function referenceMonthForToday(asOf: string = todayIsoLocal()): string {
  return currentReferenceMonth(asOf)
}
