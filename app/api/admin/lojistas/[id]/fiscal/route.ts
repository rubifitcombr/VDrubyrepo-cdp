import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { insertAdminLogFromRequest } from '@/services/admin-logs.server'
import { getStoreFiscalConfig } from '@/services/fiscal.server'
import { cadastrarEmpresa } from '@/services/fiscal'
import { getFiscalReadinessForStore } from '@/services/fiscal-readiness.server'
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
  if (action !== 'ativar' && action !== 'bloquear' && action !== 'cadastrar_empresa') {
    return NextResponse.json(
      { error: "action inválida (use 'ativar', 'bloquear' ou 'cadastrar_empresa')" },
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

  // Cadastra a loja como Empresa na Brasil NFe e guarda o token retornado.
  if (action === 'cadastrar_empresa') {
    const result = await cadastrarEmpresa(id)
    if (!result.ok) {
      return NextResponse.json({ error: result.motivo || 'Falha ao cadastrar empresa.' }, { status: 422 })
    }
    await insertAdminLogFromRequest(ctx.svc, req, {
      adminId: ctx.user.id,
      lojistaId: id,
      acao: 'fiscal_cadastrou_empresa',
      detalhes: 'Empresa cadastrada na Brasil NFe e token vinculado',
    })
    return NextResponse.json({ ok: true, tokenVinculado: true })
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

  if (action === 'ativar') {
    const readiness = await getFiscalReadinessForStore(ctx.svc, id)
    if (!readiness.ready) {
      return NextResponse.json(
        {
          error:
            'Checklist fiscal incompleto. A loja precisa concluir emitente, CSC, certificado e produtos antes da ativação.',
          pending: readiness.items
            .filter((i) => !i.ok && i.id !== 'pronto_emissao')
            .map((i) => ({ id: i.id, label: i.label, hint: i.hint })),
        },
        { status: 422 }
      )
    }
  }

  const { error } = await ctx.svc
    .from('store_fiscal_config')
    .upsert(patch, { onConflict: 'store_id' })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await insertAdminLogFromRequest(ctx.svc, req, {
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
