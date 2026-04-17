import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { hasAutomationAccess } from '@/lib/plan'
import {
  sendWhatsAppMessage,
  shouldSkipAutoReply,
} from '@/services/whatsapp-sender.server'

type WebhookPayload = {
  message?: string
  from?: string
  store_id?: string
  instance?: string
  instanceName?: string
  data?: {
    key?: {
      fromMe?: boolean
      remoteJid?: string
    }
    message?: {
      conversation?: string
      extendedTextMessage?: {
        text?: string
      }
      imageMessage?: {
        caption?: string
      }
      videoMessage?: {
        caption?: string
      }
    }
  }
}

function toText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function buildStoreLink(req: NextRequest, slug: string): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  if (!host) return `https://seudominio.com/${slug}`
  return `${proto}://${host}/${slug}`
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '')
}

function extractStoreIdFromInstance(instanceName: string): string {
  if (!instanceName.startsWith('store_')) return ''
  const tail = instanceName.slice('store_'.length).trim()
  return tail
}

/** Browser abre em GET — só para confirmar que a rota existe; a Evolution usa POST. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      'Webhook Vyria ativo. A Evolution deve enviar eventos com método POST para este URL.',
  })
}

/** Alguns health checks usam HEAD e devolviam 405. */
export async function HEAD() {
  return new NextResponse(null, { status: 200 })
}

function extractWebhookInput(body: WebhookPayload): {
  storeId: string
  from: string
  incomingMessage: string
  ignore: boolean
} {
  const fromMe = body?.data?.key?.fromMe === true
  const remoteJid = toText(body?.data?.key?.remoteJid)
  const isGroup = remoteJid.endsWith('@g.us')
  const isBroadcast = remoteJid.includes('status@broadcast')

  const directFrom = toText(body?.from)
  const parsedFromJid = remoteJid ? remoteJid.split('@')[0] : ''
  const from = normalizePhone(directFrom || parsedFromJid)

  const directStoreId = toText(body?.store_id)
  const instanceName = toText(body?.instance || body?.instanceName)
  const storeId = directStoreId || extractStoreIdFromInstance(instanceName)

  const incomingMessage =
    toText(body?.message) ||
    toText(body?.data?.message?.conversation) ||
    toText(body?.data?.message?.extendedTextMessage?.text) ||
    toText(body?.data?.message?.imageMessage?.caption) ||
    toText(body?.data?.message?.videoMessage?.caption)

  return {
    storeId,
    from,
    incomingMessage,
    ignore: fromMe || isGroup || isBroadcast,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as WebhookPayload
    const { from, storeId, incomingMessage, ignore } = extractWebhookInput(body)

    if (ignore) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'Evento ignorado (fromMe/grupo/status).',
      })
    }

    if (!from || !storeId) {
      return NextResponse.json(
        { ok: true, skipped: true, reason: 'Webhook sem from/store_id válidos.' },
        { status: 200 }
      )
    }

    const supabase = createServiceRoleClient()
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id, slug, plan')
      .eq('id', storeId)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })
    }

    if (!hasAutomationAccess(String(store.plan || 'START'))) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'Plano sem acesso à automação.',
      })
    }

    const { data: automation, error: automationError } = await supabase
      .from('whatsapp_automations')
      .select('is_active, message_template, delay_seconds')
      .eq('store_id', storeId)
      .maybeSingle()

    if (automationError) {
      return NextResponse.json(
        { error: automationError.message || 'Erro ao buscar automação.' },
        { status: 500 }
      )
    }

    if (!automation?.is_active) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'Automação inativa.',
      })
    }

    const slug = toText(store.slug)
    if (!slug) {
      return NextResponse.json(
        { error: 'Loja sem slug configurado.' },
        { status: 409 }
      )
    }

    const antiSpamKey = `${storeId}:${from}`
    if (shouldSkipAutoReply(antiSpamKey)) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'Cooldown anti-spam ativo.',
      })
    }

    const link = buildStoreLink(req, slug)
    const template = toText(automation.message_template) || 'Olá 👋 faça seu pedido aqui: {link}'
    const outgoingMessage = template.replaceAll('{link}', link)
    const delaySeconds = Math.min(
      300,
      Math.max(0, Number(automation.delay_seconds) || 0)
    )

    if (delaySeconds > 0) {
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000))
    }

    await sendWhatsAppMessage({
      storeId,
      to: from,
      text: outgoingMessage,
    })

    return NextResponse.json({
      ok: true,
      replied: true,
      receivedMessage: incomingMessage || null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
