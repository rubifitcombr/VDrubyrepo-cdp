import type { Plan } from '@/lib/plan'

export type BillingSubscriptionStatus = 'active' | 'overdue' | 'cancelled'

export type BillingInvoiceStatus = 'paid' | 'pending' | 'failed'

export type BillingInvoiceRow = {
  date: string
  description: string
  amount: number
  status: BillingInvoiceStatus
}

export type BillingPaymentMethod =
  | { type: 'card'; brand: string; last4: string }
  | { type: 'pix' }

export type AssinaturaPageModel = {
  plan: Plan
  planBadgeLabel: string
  priceLabel: string
  nextChargeDateLabel: string
  subscriptionStatus: BillingSubscriptionStatus
  paymentMethod: BillingPaymentMethod | null
  paymentChangeUrl: string | null
  invoices: BillingInvoiceRow[]
}

const OVERDUE_BLOCK_DAYS = 3
const MS_PER_DAY = 86_400_000

export function shouldBlockDashboardAfterOverdue(
  overdueAtIso: string | null | undefined
): boolean {
  if (!overdueAtIso || typeof overdueAtIso !== 'string') return false
  const t = Date.parse(overdueAtIso)
  if (Number.isNaN(t)) return false
  return Date.now() - t >= OVERDUE_BLOCK_DAYS * MS_PER_DAY
}

export function parseBillingInvoices(raw: unknown): BillingInvoiceRow[] {
  if (!Array.isArray(raw)) return []
  const out: BillingInvoiceRow[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const date = typeof o.date === 'string' ? o.date : ''
    const description = typeof o.description === 'string' ? o.description : ''
    const amount =
      typeof o.amount === 'number'
        ? o.amount
        : typeof o.amount === 'string'
          ? Number(o.amount)
          : NaN
    const status = o.status
    if (
      !date ||
      !Number.isFinite(amount) ||
      (status !== 'paid' && status !== 'pending' && status !== 'failed')
    ) {
      continue
    }
    out.push({ date, description, amount, status })
  }
  return out
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 6)
}

export function parsePaymentMethod(raw: unknown): BillingPaymentMethod | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const type = o.type
  if (type === 'pix') return { type: 'pix' }
  if (type === 'card') {
    const brand = typeof o.brand === 'string' ? o.brand : 'Cartão'
    const last4 = typeof o.last4 === 'string' ? o.last4 : '••••'
    return { type: 'card', brand, last4 }
  }
  return null
}
