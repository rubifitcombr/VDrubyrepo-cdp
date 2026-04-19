import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { hasAutomationAccess, parsePlan } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'
import {
  sendWhatsAppMessage,
  shouldSkipAutoReply,
} from '@/services/whatsapp-sender.server'

/** Vercel: aumenta limite para delays + chamada à Evolution (ajusta no painel se precisares de mais). */
export const maxDuration = 60

type WebhookPayload = {
  event?: string
  message?: string
  from?: string
  store_id?: string
  instance?: string
  instanceName?: string
  data?: {
    key?: {
      fromMe?: boolean
      remoteJid?: string
      remoteJidAlt?: string
    }
    message?: Record<string, unknown>
  }
}

function toText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** Texto em mensagens Baileys (incl. ephemeral / viewOnce). */
function extractBaileysMessageText(message: Record<string, unknown> | undefined): string {
  if (!message) return ''
  if (typeof message.conversation === 'string') return message.conversation.trim()
  const ext = message.extendedTextMessage
  if (ext && typeof ext === 'object') {
    const t = (ext as { text?: string }).text
    if (typeof t === 'string') return t.trim()
  }
  for (const wrap of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2']) {
    const inner = message[wrap]
    if (inner && typeof inner === 'object' && 'message' in inner) {
      const nested = (inner as { message?: Record<string, unknown> }).message
      if (nested && typeof nested === 'object') {
        const t = extractBaileysMessageText(nested)
        if (t) return t
      }
    }
  }
  const img = message.imageMessage
  if (img && typeof img === 'object') {
    const c = (img as { caption?: string }).caption
    if (typeof c === 'string') return c.trim()
  }
  const vid = message.videoMessage
  if (vid && typeof vid === 'object') {
    const c = (vid as { caption?: string }).caption
    if (typeof c === 'string') return c.trim()
  }
  return ''
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
  let remoteJid = toText(body?.data?.key?.remoteJid)
  const remoteJidAlt = toText(body?.data?.key?.remoteJidAlt)
  if (remoteJid.includes('@lid') && remoteJidAlt) {
    remoteJid = remoteJidAlt
  }
  const isGroup = remoteJid.endsWith('@g.us')
  const isBroadcast = remoteJid.includes('status@broadcast')

  const directFrom = toText(body?.from)
  const parsedFromJid = remoteJid ? remoteJid.split('@')[0] : ''
  const from = normalizePhone(directFrom || parsedFromJid)

  const directStoreId = toText(body?.store_id)
  const instanceName = toText(body?.instance || body?.instanceName)
  const storeId = directStoreId || extractStoreIdFromInstance(instanceName)

  const msgObj = body?.data?.message
  const incomingMessage =
    toText(body?.message) ||
    (msgObj && typeof msgObj === 'object'
      ? extractBaileysMessageText(msgObj as Record<string, unknown>)
      : '')

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

    const ev = typeof body.event === 'string' ? body.event.trim().toLowerCase() : ''
    if (ev && ev !== 'messages.upsert') {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: `Evento "${body.event}" não dispara resposta automática (só messages.upsert).`,
      })
    }

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
        {
          ok: true,
          skipped: true,
          reason: 'Webhook sem from/store_id válidos.',
          hint:
            'Confirma instance tipo store_<uuid> e mensagem com remoteJid; evento messages.upsert.',
        },
        { status: 200 }
      )
    }

    const supabase = createServiceRoleClient()
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id, slug, plano, plan')
      .eq('id', storeId)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })
    }

    if (
      !hasAutomationAccess(
        parsePlan(readStorePlano(store as Record<string, unknown>))
      )
    ) {
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
    /** No Vercel o tempo de função é limitado; evita sleep longo que corta antes do envio. */
    const delaySeconds = Math.min(
      25,
      Math.min(300, Math.max(0, Number(automation.delay_seconds) || 0))
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
