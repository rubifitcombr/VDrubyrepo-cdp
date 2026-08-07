import { NextResponse } from 'next/server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { isOpenCaixaComanda } from '@/lib/cashier-comanda-close'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'
import {
  breakdownForTurno,
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

  const deny = gateMerchantMenuKey(gate.ctx.store, user.email, 'caixa')
  if (deny) return deny

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

  const { data: openComandaRows } = await supabase
    .from('orders')
    .select('id, status, source, notes, caixa_turno_id')
    .eq('store_id', storeId)
    .in('source', ['pdv', 'waiter', 'autoatendimento'])
    .neq('status', 'cancelled')

  const openComandasCount = (openComandaRows ?? []).filter((row) =>
    isOpenCaixaComanda(
      row as {
        status?: string
        source?: string
        notes?: string
        caixa_turno_id?: string
      }
    )
  ).length

  if (openComandasCount > 0) {
    return NextResponse.json(
      {
        error: `Existem ${openComandasCount} comanda(s) em aberto. Fecha-as no caixa antes de encerrar o turno.`,
      },
      { status: 409 }
    )
  }

  const breakdown = await breakdownForTurno(supabase, storeId, turnoId)

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

  const { error: upErr, data: updatedRows } = await supabase
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
    .select('id')

  if (upErr) {
    if (/relation|does not exist|schema cache|42P01/i.test(upErr.message ?? '')) {
      return NextResponse.json(
        {
          error:
            'Tabelas de caixa em falta. Aplica supabase/migrations/20260725190007_caixa_schema.sql no Supabase.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: upErr.message ?? 'Não foi possível fechar o turno.' },
      { status: 500 }
    )
  }

  if (!updatedRows?.length) {
    return NextResponse.json(
      { error: 'Turno já foi fechado noutro painel. Actualiza e tenta de novo.' },
      { status: 409 }
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
