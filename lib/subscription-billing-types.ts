import type { BillingCycle } from '@/lib/contract-pricing'
import type { Plan } from '@/lib/plan'

export type SubscriptionInvoiceStatus = 'pending' | 'paid' | 'failed' | 'waived'

export type SubscriptionInvoiceRow = {
  id: string
  store_id: string
  reference_month: string
  amount_brl: number
  billing_cycle: BillingCycle
  plan: string
  status: SubscriptionInvoiceStatus
  issued_at: string
  due_date: string
  paid_at: string | null
  mp_payment_id: string | null
  pix_qr_code: string | null
  pix_qr_base64: string | null
  pix_copy_paste: string | null
  created_at: string
  updated_at: string
}

export type PlatformBillingConfigRow = {
  id: number
  mp_access_token: string | null
  mp_webhook_secret: string | null
  receiver_name: string | null
  receiver_document: string | null
  enabled: boolean
  updated_at: string
  updated_by: string | null
}

export type SubscriptionBannerTone = 'soft' | 'urgent' | 'critical' | 'locked'

export type SubscriptionBannerCopy = {
  title: string
  body: string
  tone: SubscriptionBannerTone
  daysUntilDue: number
  dayOfMonth: number
  locked: boolean
}

export type SubscriptionBillingUiState = {
  invoiceId: string | null
  referenceMonth: string | null
  amountBrl: number | null
  amountLabel: string | null
  dueDate: string | null
  status: SubscriptionInvoiceStatus | null
  locked: boolean
  showBanner: boolean
  copy: SubscriptionBannerCopy | null
  pixQrBase64: string | null
  pixCopyPaste: string | null
  mpPaymentId: string | null
}
