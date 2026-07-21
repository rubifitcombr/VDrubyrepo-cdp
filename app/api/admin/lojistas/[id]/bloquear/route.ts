import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { readStoreStatus } from '@/lib/store-columns'
import { fetchLojistaDetail } from '@/lib/admin-lojistas-query.server'
import { insertAdminLogFromRequest } from '@/services/admin-logs.server'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id } = await params

  const { data: existing } = await ctx.svc
    .from('stores')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })
  }

  if (String(readStoreStatus(existing as Record<string, unknown>) || '') !== 'ativo') {
    return NextResponse.json(
      { error: 'Só é possível bloquear lojistas ativos' },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  const { error } = await ctx.svc
    .from('stores')
    .update({
      status: 'bloqueado',
      plano_atualizado_em: now,
    })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const nome = String((existing as { name?: string }).name ?? '')

  await insertAdminLogFromRequest(ctx.svc, req, {
    adminId: ctx.user.id,
    lojistaId: id,
    acao: 'bloqueou',
    detalhes: `Bloqueado · ${nome}`,
  })

  const detail = await fetchLojistaDetail(ctx.svc, id)
  return NextResponse.json({ ok: true, lojista: detail?.lojista })
}
