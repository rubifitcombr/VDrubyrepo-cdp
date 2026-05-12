import { NextResponse } from 'next/server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'
import {
  computeSaldoDinheiroDisponivel,
  getOpenCaixaTurno,
} from '@/services/caixa-turnos.server'
import { createClient } from '@/lib/supabase/server'

function parseMoney(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v * 100) / 100
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.').trim())
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100
  }
  return 0
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

  let body: { tipo?: unknown; valor?: unknown; motivo?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const tipoRaw = String(body.tipo ?? '').trim().toLowerCase()
  const tipo =
    tipoRaw === 'sangria'
      ? 'sangria'
      : tipoRaw === 'suprimento'
        ? 'suprimento'
        : tipoRaw === 'acerto_entregador'
          ? 'acerto_entregador'
          : null
  if (!tipo) {
    return NextResponse.json(
      { error: 'Tipo inválido (use suprimento, sangria ou acerto_entregador).' },
      { status: 400 }
    )
  }

  const valor = parseMoney(body.valor)
  if (valor <= 0) {
    return NextResponse.json({ error: 'Indica um valor maior que zero.' }, { status: 400 })
  }

  const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''
  if (!motivo) {
    return NextResponse.json({ error: 'Indica o motivo da movimentação.' }, { status: 400 })
  }

  const operador =
    (typeof user.email === 'string' && user.email.trim()) ||
    (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
    null

  const supabase = await createClient()
  const storeId = gate.ctx.storeId

  const turno = await getOpenCaixaTurno(supabase, storeId)
  if (!turno) {
    return NextResponse.json({ error: 'Não há turno aberto.' }, { status: 409 })
  }

  if (tipo === 'sangria') {
    const saldo = await computeSaldoDinheiroDisponivel(supabase, storeId, turno)
    if (valor > saldo + 0.001) {
      return NextResponse.json(
        {
          error: `Sangria superior ao dinheiro disponível no caixa (${saldo.toFixed(2)}).`,
        },
        { status: 400 }
      )
    }
  }
  /* acerto_entregador: não entra na validação de sangria (valor acordado com entregador). */

  const { data, error } = await supabase
    .from('caixa_movimentacoes')
    .insert({
      store_id: storeId,
      turno_id: turno.id,
      tipo,
      valor,
      motivo,
      operador,
    })
    .select('*')
    .single()

  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json(
        {
          error:
            'Tabelas de caixa não encontradas. Aplica a migração SQL no Supabase.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: error.message ?? 'Não foi possível registar a movimentação.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, movimentacao: data })
}
