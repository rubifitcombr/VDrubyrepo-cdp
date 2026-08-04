import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { insertAdminLogFromRequest } from '@/services/admin-logs.server'
import {
  adminDisconnectWhatsApp,
  finalizeWhatsAppConnection,
  getAdminWhatsAppSummary,
} from '@/services/whatsapp-onboarding.server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const { data: store } = await ctx.svc.from('stores').select('id').eq('id', id).maybeSingle()
  if (!store) {
    return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })
  }

  const whatsapp = await getAdminWhatsAppSummary(ctx.svc, id)
  return NextResponse.json({ ok: true, whatsapp })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const { data: store } = await ctx.svc.from('stores').select('id').eq('id', id).maybeSingle()
  if (!store) {
    return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const action = String(body.action || '').trim().toLowerCase()

  if (action === 'disconnect') {
    await adminDisconnectWhatsApp(ctx.svc, id)
    await insertAdminLogFromRequest(ctx.svc, req, {
      adminId: ctx.user.id,
      lojistaId: id,
      acao: 'whatsapp_desligou',
      detalhes: 'WhatsApp Master desligado manualmente pelo admin',
    })
    const whatsapp = await getAdminWhatsAppSummary(ctx.svc, id)
    return NextResponse.json({ ok: true, whatsapp })
  }

  if (action !== 'connect') {
    return NextResponse.json(
      { error: "action inválida (use 'connect' ou 'disconnect')" },
      { status: 400 }
    )
  }

  const wabaId = String(body.waba_id || '').trim()
  const phoneNumberId = String(body.phone_number_id || '').trim()
  const accessToken = String(body.access_token || '').trim()
  const displayPhone =
    body.display_phone_e164 != null ? String(body.display_phone_e164).trim() : undefined

  if (!wabaId || !phoneNumberId || !accessToken) {
    return NextResponse.json(
      { error: 'Preencha WABA ID, Phone Number ID e access token.' },
      { status: 400 }
    )
  }

  const result = await finalizeWhatsAppConnection(ctx.svc, id, {
    waba_id: wabaId,
    phone_number_id: phoneNumberId,
    access_token: accessToken,
    display_phone_e164: displayPhone || null,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  await insertAdminLogFromRequest(ctx.svc, req, {
    adminId: ctx.user.id,
    lojistaId: id,
    acao: 'whatsapp_ligou',
    detalhes: `WhatsApp ligado (WABA ${wabaId}, phone ${result.config.phone_number_id})`,
  })

  const whatsapp = await getAdminWhatsAppSummary(ctx.svc, id)
  return NextResponse.json({
    ok: true,
    config: result.config,
    webhook_subscribed: result.webhook_subscribed,
    templates_scheduled: result.templates_scheduled,
    whatsapp,
  })
}
