import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { fetchLojistaDetail } from '@/lib/admin-lojistas-query.server'
import { insertAdminLog } from '@/services/admin-logs.server'
import { parsePlan, planShortLabel } from '@/lib/plan'
import { planToPlanoColumn } from '@/lib/plano-db'
import { readStoreStatus } from '@/lib/store-columns'

function fmtDateBr(iso: string) {
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  return d.toLocaleDateString('pt-BR')
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id } = await params
  let body: { plano?: string; plano_vence_em?: string }
  try {
    body = (await req.json()) as { plano?: string; plano_vence_em?: string }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const plano = parsePlan(body.plano)
  const vence = String(body.plano_vence_em || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vence)) {
    return NextResponse.json(
      { error: 'plano_vence_em inválido (use YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  const { data: existing } = await ctx.svc
    .from('stores')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })
  }

  const row = existing as Record<string, unknown>
  const st = String(readStoreStatus(row) || '')
    .trim()
    .toLowerCase()
  if (st !== 'pendente' && st !== 'bloqueado' && st !== 'cancelado') {
    return NextResponse.json(
      {
        error:
          'Só é possível ativar lojistas pendentes, bloqueados ou reativar contas canceladas',
      },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    plano: planToPlanoColumn(plano),
    status: 'ativo',
    plano_vence_em: vence,
    plano_ativado_em: now,
    plano_atualizado_em: now,
  }
  if (st === 'cancelado' && Object.prototype.hasOwnProperty.call(row, 'cancelamento_solicitado')) {
    patch.cancelamento_solicitado = false
  }

  const { error } = await ctx.svc.from('stores').update(patch).eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await insertAdminLog(ctx.svc, {
    adminId: ctx.user.id,
    lojistaId: id,
    acao: st === 'cancelado' ? 'reativou' : 'ativou',
    detalhes:
      st === 'cancelado'
        ? `Conta reativada · ${planShortLabel(plano)} · vence ${fmtDateBr(vence)}`
        : `Plano ativado · ${planShortLabel(plano)} · vence ${fmtDateBr(vence)}`,
  })

  const detail = await fetchLojistaDetail(ctx.svc, id)
  return NextResponse.json({ ok: true, lojista: detail?.lojista })
}
