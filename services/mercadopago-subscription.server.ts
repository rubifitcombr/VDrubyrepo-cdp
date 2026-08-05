import 'server-only'

import { createHmac } from 'crypto'
import type { SubscriptionInvoiceRow } from '@/lib/subscription-billing-types'
import {
  getPlatformBillingConfig,
  resolveMercadoPagoAccessToken,
} from '@/services/platform-billing-config.server'
import type { SupabaseClient } from '@supabase/supabase-js'

const MP_API = 'https://api.mercadopago.com'

export type MpPixPaymentResult = {
  paymentId: string
  status: string
  pixQrCode: string | null
  pixQrBase64: string | null
  pixCopyPaste: string | null
}

type MpPaymentResponse = {
  id?: number | string
  status?: string
  external_reference?: string
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string
      qr_code_base64?: string
      ticket_url?: string
    }
  }
}

function readWebhookSecret(
  configSecret: string | null | undefined
): string | null {
  const fromDb = configSecret?.trim()
  if (fromDb) return fromDb
  return process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() || null
}

export function verifyMercadoPagoWebhookSignature(input: {
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
  secret: string | null
}): boolean {
  const secret = input.secret?.trim()
  if (!secret) return true

  const sig = input.xSignature?.trim()
  if (!sig) return false

  const parts = Object.fromEntries(
    sig.split(',').map((p) => {
      const [k, v] = p.split('=')
      return [k?.trim(), v?.trim()]
    })
  ) as Record<string, string | undefined>

  const ts = parts.ts
  const v1 = parts.v1
  const dataId = input.dataId?.trim()
  const requestId = input.xRequestId?.trim()

  if (!ts || !v1 || !dataId || !requestId) return false

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const expected = createHmac('sha256', secret).update(manifest).digest('hex')
  return expected === v1
}

async function mpFetch(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<MpPaymentResponse> {
  const resp = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })

  const body = (await resp.json().catch(() => ({}))) as Record<string, unknown>
  if (!resp.ok) {
    const msg =
      typeof body.message === 'string'
        ? body.message
        : typeof body.error === 'string'
          ? body.error
          : `Mercado Pago HTTP ${resp.status}`
    throw new Error(msg)
  }
  return body as MpPaymentResponse
}

function mapPixFromPayment(payment: MpPaymentResponse): MpPixPaymentResult {
  const tx = payment.point_of_interaction?.transaction_data
  return {
    paymentId: String(payment.id ?? ''),
    status: String(payment.status ?? 'pending'),
    pixQrCode: tx?.qr_code ?? null,
    pixQrBase64: tx?.qr_code_base64 ?? null,
    pixCopyPaste: tx?.qr_code ?? null,
  }
}

export async function createPixPaymentForInvoice(
  svc: SupabaseClient,
  input: {
    invoice: SubscriptionInvoiceRow
    payerEmail: string
    description?: string
  }
): Promise<MpPixPaymentResult> {
  const config = await getPlatformBillingConfig(svc)
  const accessToken = resolveMercadoPagoAccessToken(config)
  if (!accessToken) {
    throw new Error('Mercado Pago não configurado')
  }

  const description =
    input.description?.trim() ||
    `Mensalidade Vyria ${input.invoice.reference_month}`

  const payment = await mpFetch(accessToken, '/v1/payments', {
    method: 'POST',
    body: JSON.stringify({
      transaction_amount: input.invoice.amount_brl,
      description,
      payment_method_id: 'pix',
      external_reference: input.invoice.id,
      payer: {
        email: input.payerEmail.trim() || 'lojista@vyria.local',
      },
    }),
  })

  return mapPixFromPayment(payment)
}

export async function syncPaymentStatus(
  svc: SupabaseClient,
  mpPaymentId: string
): Promise<MpPixPaymentResult> {
  const config = await getPlatformBillingConfig(svc)
  const accessToken = resolveMercadoPagoAccessToken(config)
  if (!accessToken) {
    throw new Error('Mercado Pago não configurado')
  }

  const payment = await mpFetch(accessToken, `/v1/payments/${encodeURIComponent(mpPaymentId)}`)
  return mapPixFromPayment(payment)
}

export function isMpPaymentApproved(status: string): boolean {
  return status === 'approved'
}

export function isMpPaymentTerminal(status: string): boolean {
  return ['approved', 'cancelled', 'rejected', 'refunded', 'charged_back'].includes(status)
}

export type MpWebhookPayload = {
  type?: string
  action?: string
  data?: { id?: string | number }
}

export function extractMpPaymentIdFromWebhook(body: MpWebhookPayload): string | null {
  const id = body.data?.id
  if (id == null) return null
  const s = String(id).trim()
  return s || null
}
