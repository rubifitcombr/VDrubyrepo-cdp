import { NextRequest, NextResponse } from 'next/server'
import { gateMerchantDeliveryPipeline } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { saldoEntregaLinha } from '@/lib/entregas-types'
import { getUser } from '@/services/auth.server'
import { getOpenCaixaTurno } from '@/services/caixa-turnos.server'
import { getEntregasByIds, markEntregasAsSettled } from '@/services/entregas.server'
import { createClient } from '@/lib/supabase/server'

function parseMoney(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v * 100) / 100
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.').trim())
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100
  }
  return 0
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantDeliveryPipeline(gate.ctx.store, user.email)
  if (deny) return deny

  let body: {
    entregadorId?: unknown
    entregadorNome?: unknown
    entregaIds?: unknown
    valor?: unknown
    forma?: unknown
    observacao?: unknown
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const entregaIds = Array.isArray(body.entregaIds)
    ? body.entregaIds.filter((id): id is string => typeof id === 'string' && !!id.trim())
    : []
  if (entregaIds.length === 0) {
    return NextResponse.json({ error: 'Seleciona pelo menos uma entrega.' }, { status: 400 })
  }

  const valor = parseMoney(body.valor)
  if (valor <= 0) {
    return NextResponse.json({ error: 'Indica um valor maior que zero.' }, { status: 400 })
  }

  const formaRaw = String(body.forma ?? 'dinheiro').trim().toLowerCase()
  const forma = formaRaw === 'pix' ? 'pix' : 'dinheiro'
  const formaLabel = forma === 'pix' ? 'PIX' : 'Dinheiro'
  const nome =
    typeof body.entregadorNome === 'string' ? body.entregadorNome.trim() : 'Entregador'
  const obs = typeof body.observacao === 'string' ? body.observacao.trim() : ''
  const motivo = [
    `Acerto com ${nome} — ${entregaIds.length} entrega(s)`,
    formaLabel,
    obs,
  ]
    .filter(Boolean)
    .join(' · ')

  const supabase = await createClient()
  const storeId = gate.ctx.storeId

  const turno = await getOpenCaixaTurno(supabase, storeId)
  if (!turno) {
    return NextResponse.json({ error: 'Não há turno aberto no caixa.' }, { status: 409 })
  }

  const selected = await getEntregasByIds(supabase, storeId, entregaIds)
  if (selected.length !== entregaIds.length) {
    return NextResponse.json({ error: 'Uma ou mais entregas não foram encontradas.' }, { status: 404 })
  }
  if (selected.some((e) => e.acertado_em)) {
    return NextResponse.json({ error: 'Uma ou mais entregas já foram acertadas.' }, { status: 409 })
  }

  const saldoEsperado = Math.round(
    selected.reduce((s, e) => s + saldoEntregaLinha(e), 0) * 100
  ) / 100

  const operador =
    (typeof user.email === 'string' && user.email.trim()) ||
    (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
    null

  const { data: mov, error: movErr } = await supabase
    .from('caixa_movimentacoes')
    .insert({
      store_id: storeId,
      turno_id: turno.id,
      tipo: 'acerto_entregador',
      valor,
      motivo,
      operador,
    })
    .select('id')
    .single()

  if (movErr || !mov?.id) {
    return NextResponse.json(
      { error: movErr?.message ?? 'Não foi possível registar o acerto.' },
      { status: 500 }
    )
  }

  const settledCount = await markEntregasAsSettled(
    supabase,
    storeId,
    entregaIds,
    String(mov.id)
  )

  if (settledCount !== entregaIds.length) {
    await supabase.from('caixa_movimentacoes').delete().eq('id', mov.id).eq('store_id', storeId)
    return NextResponse.json(
      {
        error:
          'Uma ou mais entregas já foram acertadas noutro painel. Actualiza e tenta de novo.',
      },
      { status: 409 }
    )
  }

  return NextResponse.json({
    ok: true,
    movimentacaoId: mov.id,
    saldoEsperado,
    valor,
  })
}
