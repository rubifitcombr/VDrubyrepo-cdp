import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import {
  extractMpPaymentIdFromWebhook,
  verifyMercadoPagoWebhookSignature,
  type MpWebhookPayload,
} from '@/services/mercadopago-subscription.server'
import { getPlatformBillingConfig } from '@/services/platform-billing-config.server'
import { handleMercadoPagoPaymentWebhook } from '@/services/subscription-billing.server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as MpWebhookPayload
    const paymentId = extractMpPaymentIdFromWebhook(body)

    if (!paymentId) {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const svc = createServiceRoleClient()
    const config = await getPlatformBillingConfig(svc)
    const secret =
      config?.mp_webhook_secret?.trim() ||
      process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() ||
      null

    const valid = verifyMercadoPagoWebhookSignature({
      xSignature: req.headers.get('x-signature'),
      xRequestId: req.headers.get('x-request-id'),
      dataId: paymentId,
      secret,
    })

    if (!valid) {
      return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
    }

    const type = String(body.type ?? body.action ?? '').toLowerCase()
    if (type && !type.includes('payment')) {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const processed = await handleMercadoPagoPaymentWebhook(svc, paymentId)
    return NextResponse.json({ ok: true, processed })
  } catch (e) {
    console.error('[webhook mercadopago]', e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'mercadopago-subscription' })
}
