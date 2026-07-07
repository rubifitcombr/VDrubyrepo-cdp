import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { fetchLojistaDetail } from '@/lib/admin-lojistas-query.server'
import {
  addCalendarMonthsIso,
  buildAnnualContractDbPatch,
  buildMonthlyContractDbPatch,
  defaultAnnualContractEndIso,
  parseBillingCycle,
  readStoreContract,
  todayIsoLocal,
} from '@/lib/contract-pricing'
import { clearAnnualContractAcceptancePatch } from '@/lib/annual-contract-acceptance'
import { parseMerchantStatus } from '@/lib/merchant-status'
import { parseOperationModeFromStore } from '@/lib/merchant-operation-mode'
import { parsePlan, planShortLabel } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'
import { planToPlanoColumn } from '@/lib/plano-db'
import { readStoreStatus } from '@/lib/store-columns'
import { insertAdminLog } from '@/services/admin-logs.server'
import { formatSupabaseStoreUpdateError } from '@/lib/supabase-schema-error'

function fmtDateBr(iso: string) {
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  return d.toLocaleDateString('pt-BR')
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
  let body: {
    plano?: string
    dias?: number
    plano_vence_em?: string
    billing_cycle?: string
    contrato_fim_em?: string
  }
  try {
    body = (await req.json()) as typeof body
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

  const billingCycleInput =
    body.billing_cycle !== undefined && String(body.billing_cycle).trim() !== ''
      ? parseBillingCycle(body.billing_cycle)
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

  const today = todayIsoLocal()
  let novoVence: string
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicitVence)) {
    novoVence = explicitVence
  } else {
    const rawCur = row.plano_vence_em
    const cur =
      typeof rawCur === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawCur.trim())
        ? rawCur.trim()
        : today
    const base = cur >= today ? cur : today
    novoVence = addDaysIso(base, dias)
  }

  const now = new Date().toISOString()
  const pFinal = plano ?? parsePlan(readStorePlano(row))
  const operationMode = parseOperationModeFromStore(row)
  const currentContract = readStoreContract(row)
  const billingCycle = billingCycleInput ?? currentContract.billingCycle

  const patch: Record<string, unknown> = {
    plano_vence_em: novoVence,
    plano_atualizado_em: now,
  }
  if (plano !== undefined) {
    patch.plano = planToPlanoColumn(plano)
  }

  if (billingCycle === 'annual') {
    const contratoFimRaw = String(body.contrato_fim_em || '').trim()
    let contratoFim: string
    if (/^\d{4}-\d{2}-\d{2}$/.test(contratoFimRaw)) {
      contratoFim = contratoFimRaw
    } else if (currentContract.contratoFimEm && currentContract.contratoFimEm >= today) {
      contratoFim = addCalendarMonthsIso(currentContract.contratoFimEm, 12)
    } else {
      contratoFim = defaultAnnualContractEndIso(today)
    }
    const contratoInicio =
      currentContract.contratoInicioEm &&
      currentContract.contratoFimEm &&
      currentContract.contratoFimEm >= today
        ? currentContract.contratoInicioEm
        : today
    const prevFim = currentContract.contratoFimEm
    Object.assign(
      patch,
      buildAnnualContractDbPatch({
        plan: pFinal,
        operationMode,
        contratoInicioEm: contratoInicio,
        contratoFimEm: contratoFim,
      })
    )
    if (contratoFim !== prevFim || billingCycleInput === 'annual') {
      Object.assign(patch, clearAnnualContractAcceptancePatch())
    }
  } else if (billingCycleInput === 'monthly') {
    Object.assign(patch, buildMonthlyContractDbPatch(), clearAnnualContractAcceptancePatch())
  }

  const { error } = await ctx.svc.from('stores').update(patch).eq('id', id)
  if (error) {
    return NextResponse.json(
      { error: formatSupabaseStoreUpdateError(error) },
      { status: 500 }
    )
  }

  const cycleLabel = billingCycle === 'annual' ? 'Anual' : 'Mensal'
  const contratoFim =
    typeof patch.contrato_fim_em === 'string' ? patch.contrato_fim_em : null

  await insertAdminLog(ctx.svc, {
    adminId: ctx.user.id,
    lojistaId: id,
    acao: 'renovou',
    detalhes: `Renovação · ${planShortLabel(pFinal)} · ${cycleLabel} · vence ${fmtDateBr(novoVence)}${contratoFim ? ` · contrato até ${fmtDateBr(contratoFim)}` : ''}`,
  })

  const detail = await fetchLojistaDetail(ctx.svc, id)
  return NextResponse.json({ ok: true, lojista: detail?.lojista })
}
