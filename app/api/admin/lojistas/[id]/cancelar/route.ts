import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { fetchLojistaDetail } from '@/lib/admin-lojistas-query.server'
import {
  estimateContractPenalty,
  formatMoneyBrl,
  readStoreContract,
  todayIsoLocal,
} from '@/lib/contract-pricing'
import { readStoreStatus } from '@/lib/store-columns'
import { insertAdminLog } from '@/services/admin-logs.server'

export async function POST(
  _req: Request,
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

  const row = existing as Record<string, unknown>
  const st = String(readStoreStatus(row) || '')
  if (st !== 'ativo' && st !== 'bloqueado') {
    return NextResponse.json(
      { error: 'Cancelamento só para ativos ou bloqueados' },
      { status: 400 }
    )
  }

  const contract = readStoreContract(row)
  const penalty = estimateContractPenalty(contract, todayIsoLocal())

  const now = new Date().toISOString()
  const { error } = await ctx.svc
    .from('stores')
    .update({
      status: 'cancelado',
      plano_atualizado_em: now,
      cancelamento_solicitado: false,
    })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const nome = String((existing as { name?: string }).name ?? '')
  const penaltyLine =
    penalty && penalty.multaBrl > 0
      ? ` · multa informativa ${formatMoneyBrl(penalty.multaBrl)} (${penalty.mesesRestantes} meses restantes)`
      : ''

  await insertAdminLog(ctx.svc, {
    adminId: ctx.user.id,
    lojistaId: id,
    acao: 'cancelou',
    detalhes: `Assinatura cancelada · ${nome}${penaltyLine}`,
  })

  const detail = await fetchLojistaDetail(ctx.svc, id)
  return NextResponse.json({
    ok: true,
    lojista: detail?.lojista,
    multaEstimadaBrl: penalty?.multaBrl ?? 0,
    mesesRestantes: penalty?.mesesRestantes ?? 0,
  })
}
