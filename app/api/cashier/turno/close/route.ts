import { NextResponse } from 'next/server'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { hasFeature } from '@/lib/plan'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import {
  breakdownFromOrderRows,
  getMovimentacoesForTurno,
} from '@/services/caixa-turnos.server'
import { createClient } from '@/lib/supabase/server'

function parseMoney(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v * 100) / 100
  if (typeof v === 'string') {
    const t = v.replace(',', '.').trim()
    if (t === '') return 0
    const n = Number(t)
    if (Number.isFinite(n) && n >= 0) return Math.round(n * 100) / 100
  }
  return 0
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const rawPlan = readStorePlano(gate.ctx.store)
  const plan = effectiveDashboardPlan(user.email ?? null, rawPlan)
  if (!hasFeature(plan, 'cashier')) {
    return NextResponse.json(
      { error: 'Recurso disponível apenas no plano Pro.' },
      { status: 403 }
    )
  }

  let body: {
    turnoId?: unknown
    informadoDinheiro?: unknown
    informadoPix?: unknown
    informadoCartao?: unknown
    informadoCredito?: unknown
    fundoProximoTurno?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const turnoId = String(body.turnoId ?? '').trim()
  if (!turnoId) {
    return NextResponse.json({ error: 'Turno inválido.' }, { status: 400 })
  }

  const supabase = await createClient()
  const storeId = gate.ctx.storeId

  const { data: turnoRow, error: tErr } = await supabase
    .from('caixas_turnos')
    .select('*')
    .eq('id', turnoId)
    .eq('store_id', storeId)
    .eq('status', 'aberto')
    .maybeSingle()

  if (tErr || !turnoRow) {
    return NextResponse.json({ error: 'Turno não encontrado ou já fechado.' }, { status: 404 })
  }

  const { data: orderRows, error: oErr } = await supabase
    .from('orders')
    .select('total, payment_method')
    .eq('store_id', storeId)
    .eq('caixa_turno_id', turnoId)
    .eq('status', 'delivered')

  if (oErr) {
    return NextResponse.json(
      { error: oErr.message ?? 'Erro ao ler pedidos do turno.' },
      { status: 500 }
    )
  }

  const breakdown = breakdownFromOrderRows(orderRows ?? [])

  const infD = parseMoney(body.informadoDinheiro)
  const infP = parseMoney(body.informadoPix)
  const infC = parseMoney(body.informadoCartao)
  const infCr = parseMoney(body.informadoCredito ?? 0)
  const fundoProximo = parseMoney(body.fundoProximoTurno)

  const sysTotal =
    breakdown.dinheiro.total +
    breakdown.pix.total +
    breakdown.cartao.total +
    breakdown.credito.total

  const infTotal = round2(infD + infP + infC + infCr)
  const diferencaTotal = round2(infTotal - sysTotal)

  const now = new Date().toISOString()

  const { error: upErr } = await supabase
    .from('caixas_turnos')
    .update({
      fechado_em: now,
      status: 'fechado',
      total_dinheiro: breakdown.dinheiro.total,
      total_pix: breakdown.pix.total,
      total_cartao: breakdown.cartao.total,
      total_credito: breakdown.credito.total,
      total_geral: sysTotal,
      total_informado_dinheiro: infD,
      total_informado_pix: infP,
      total_informado_cartao: infC,
      total_informado_credito: infCr,
      pedidos_fechados_count: breakdown.pedidosFechados,
      diferenca: diferencaTotal,
      fundo_proximo_turno: fundoProximo,
    })
    .eq('id', turnoId)
    .eq('store_id', storeId)
    .eq('status', 'aberto')

  if (upErr) {
    return NextResponse.json(
      { error: upErr.message ?? 'Não foi possível fechar o turno.' },
      { status: 500 }
    )
  }

  const movimentacoes = await getMovimentacoesForTurno(supabase, turnoId)

  return NextResponse.json({
    ok: true,
    resumo: {
      breakdown,
      movimentacoes,
      diferencaTotal,
    },
  })
}
