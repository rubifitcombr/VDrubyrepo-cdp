import type { Plan } from '@/lib/plan'
import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import type { BillingCycle } from '@/lib/contract-pricing'

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

export type AssinaturaAnnualContract = {
  billingCycle: BillingCycle
  mensalidadeLabel: string
  contratoInicioLabel: string
  contratoFimLabel: string
  descontoPct: number
  savingsLabel: string
  penaltyTermsLine: string
  mesesRestantes: number
  multaEstimadaLabel: string | null
  contractEnded: boolean
  documentoHash: string | null
  contratoAssinadoEm: string | null
  podeBaixarPdf: boolean
}

export type AssinaturaPageModel = {
  plan: Plan
  planBadgeLabel: string
  priceLabel: string
  /** Data de validade do plano (legível), derivada de `plano_vence_em`. */
  planValidUntilLabel: string | null
  /** Data de vencimento do plano (YYYY-MM-DD), da loja. */
  planoVenceEm: string | null
  subscriptionStatus: BillingSubscriptionStatus
  invoices: BillingInvoiceRow[]
  whatsappHref: string | null
  operationMode: MerchantOperationMode | null
  annualContract: AssinaturaAnnualContract | null
  cancelamentoSolicitado: boolean
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
