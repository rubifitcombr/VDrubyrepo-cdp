import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { fetchLojistaDetail } from '@/lib/admin-lojistas-query.server'
import { parseMerchantStatus } from '@/lib/merchant-status'
import { parsePlan, planShortLabel } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'
import { planToPlanoColumn } from '@/lib/plano-db'
import { readStoreStatus } from '@/lib/store-columns'
import { insertAdminLog } from '@/services/admin-logs.server'

function fmtDateBr(iso: string) {
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  return d.toLocaleDateString('pt-BR')
}

function todayIsoLocal(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

function addDaysIso(baseYmd: string, days: number): string {
  const d = new Date(
    baseYmd.includes('T') ? baseYmd : `${baseYmd.trim()}T12:00:00`
  )
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id } = await params
  let body: { plano?: string; dias?: number; plano_vence_em?: string }
  try {
    body = (await req.json()) as {
      plano?: string
      dias?: number
      plano_vence_em?: string
    }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const explicitVence = String(body.plano_vence_em || '').trim()
  const diasRaw = body.dias
  const dias =
    typeof diasRaw === 'number' && Number.isFinite(diasRaw) && diasRaw > 0
      ? Math.floor(diasRaw)
      : 30

  const plano =
    body.plano !== undefined && String(body.plano).trim() !== ''
      ? parsePlan(body.plano)
      : undefined

  const { data: existing } = await ctx.svc
    .from('stores')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })
  }

  const row = existing as Record<string, unknown>
  if (parseMerchantStatus(readStoreStatus(row)) !== 'ativo') {
    return NextResponse.json(
      { error: 'Renovação só para lojistas ativos' },
      { status: 400 }
    )
  }

  let novoVence: string
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicitVence)) {
    novoVence = explicitVence
  } else {
    const rawCur = row.plano_vence_em
    const cur =
      typeof rawCur === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawCur.trim())
        ? rawCur.trim()
        : todayIsoLocal()
    const base = cur >= todayIsoLocal() ? cur : todayIsoLocal()
    novoVence = addDaysIso(base, dias)
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    plano_vence_em: novoVence,
    plano_atualizado_em: now,
  }
  if (plano !== undefined) {
    patch.plano = planToPlanoColumn(plano)
  }

  const { error } = await ctx.svc.from('stores').update(patch).eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const pFinal = plano ?? parsePlan(readStorePlano(row))

  await insertAdminLog(ctx.svc, {
    adminId: ctx.user.id,
    lojistaId: id,
    acao: 'renovou',
    detalhes: `Renovação · ${planShortLabel(pFinal)} · vence ${fmtDateBr(novoVence)}`,
  })

  const detail = await fetchLojistaDetail(ctx.svc, id)
  return NextResponse.json({ ok: true, lojista: detail?.lojista })
}
