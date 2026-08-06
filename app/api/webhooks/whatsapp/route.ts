import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import {
  parseMetaWebhookPayload,
  processWhatsAppWebhook,
  verifyMetaWebhookSignature,
} from '@/services/whatsapp-webhook.server'

export const dynamic = 'force-dynamic'

/** Verificação do webhook Meta (GET). */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim()
  if (mode === 'subscribe' && verifyToken && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Verificação inválida.' }, { status: 403 })
}

/** Eventos WhatsApp Cloud API (POST). */
export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')

  if (process.env.NODE_ENV === 'production' && !process.env.META_APP_SECRET?.trim()) {
    console.error('[webhooks/whatsapp] META_APP_SECRET em falta em produção.')
    return NextResponse.json({ error: 'Webhook não configurado.' }, { status: 503 })
  }

  if (process.env.META_APP_SECRET?.trim()) {
    if (!verifyMetaWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 })
    }
  } else if (process.env.NODE_ENV !== 'production') {
    console.warn('[webhooks/whatsapp] META_APP_SECRET ausente — assinatura não validada (dev).')
  }

  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  try {
    const db = createServiceRoleClient()
    await processWhatsAppWebhook(db, parseMetaWebhookPayload(json))
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[webhooks/whatsapp]', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
