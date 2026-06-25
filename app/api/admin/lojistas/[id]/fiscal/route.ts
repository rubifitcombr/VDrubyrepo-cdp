import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { insertAdminLog } from '@/services/admin-logs.server'
import { getStoreFiscalConfig } from '@/services/fiscal.server'
import { parseFiscalAmbiente } from '@/lib/fiscal'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const cfg = await getStoreFiscalConfig(ctx.svc, id)
  if (!cfg) {
    return NextResponse.json({
      ok: true,
      fiscal: { status: 'nao_configurado', configured: false },
    })
  }

  // Nunca devolve o token cru ao cliente — só indica se está preenchido.
  return NextResponse.json({
    ok: true,
    fiscal: {
      status: cfg.status,
      ambiente: cfg.ambiente,
      regimeTributario: cfg.regimeTributario,
      cnpj: cfg.cnpj,
      razaoSocial: cfg.razaoSocial,
      hasToken: Boolean(cfg.brasilnfeToken),
      configured: true,
    },
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id } = await params
  let body: { action?: string; ambiente?: string }
  try {
    body = (await req.json()) as { action?: string; ambiente?: string }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const action = String(body.action || '').trim().toLowerCase()
  if (action !== 'ativar' && action !== 'bloquear') {
    return NextResponse.json(
      { error: "action inválida (use 'ativar' ou 'bloquear')" },
      { status: 400 }
    )
  }

  const { data: store } = await ctx.svc
    .from('stores')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (!store) {
    return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })
  }

  const nextStatus = action === 'ativar' ? 'ativo' : 'bloqueado'
  const patch: Record<string, unknown> = {
    store_id: id,
    status: nextStatus,
    updated_at: new Date().toISOString(),
  }
  if (action === 'ativar' && body.ambiente) {
    patch.ambiente = parseFiscalAmbiente(body.ambiente)
  }

  const { error } = await ctx.svc
    .from('store_fiscal_config')
    .upsert(patch, { onConflict: 'store_id' })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await insertAdminLog(ctx.svc, {
    adminId: ctx.user.id,
    lojistaId: id,
    acao: action === 'ativar' ? 'fiscal_ativou' : 'fiscal_bloqueou',
    detalhes:
      action === 'ativar'
        ? `Add-on fiscal ativado${body.ambiente ? ` (${parseFiscalAmbiente(body.ambiente)})` : ''}`
        : 'Add-on fiscal bloqueado',
  })

  return NextResponse.json({ ok: true, status: nextStatus })
}
