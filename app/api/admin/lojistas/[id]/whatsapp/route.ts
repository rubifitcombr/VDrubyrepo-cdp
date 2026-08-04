import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { insertAdminLogFromRequest } from '@/services/admin-logs.server'
import { adminDisconnectWhatsApp, getAdminWhatsAppSummary } from '@/services/whatsapp-onboarding.server'

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

/** Admin: apenas monitorização e disconnect de suporte. Ligação = lojista via Facebook (coexistência). */
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

  if (action !== 'disconnect') {
    return NextResponse.json(
      {
        error:
          'A ligação WhatsApp é feita pelo lojista via Conectar com Facebook (coexistência). Use apenas disconnect para suporte.',
      },
      { status: 400 }
    )
  }

  await adminDisconnectWhatsApp(ctx.svc, id)
  await insertAdminLogFromRequest(ctx.svc, req, {
    adminId: ctx.user.id,
    lojistaId: id,
    acao: 'whatsapp_desligou',
    detalhes: 'WhatsApp Master desligado pelo admin (suporte)',
  })
  const whatsapp = await getAdminWhatsAppSummary(ctx.svc, id)
  return NextResponse.json({ ok: true, whatsapp })
}
