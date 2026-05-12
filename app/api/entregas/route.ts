import { NextRequest, NextResponse } from 'next/server'
import { gateMerchantDeliveryPipeline } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'
import { getEntregaByOrderId, insertEntrega, listEntregasForStore } from '@/services/entregas.server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantDeliveryPipeline(gate.ctx.store, user.email)
  if (deny) return deny

  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const orderIdOne = searchParams.get('orderId')?.trim() || undefined
  if (orderIdOne) {
    const row = await getEntregaByOrderId(supabase, gate.ctx.storeId, orderIdOne)
    return NextResponse.json({ ok: true, entrega: row })
  }

  const turnoId = searchParams.get('turnoId')?.trim() || undefined
  const period = searchParams.get('period')?.trim() || 'turno'
  const entregadorId = searchParams.get('entregadorId')?.trim() || undefined
  const pendenteSaldo = searchParams.get('pendenteSaldo') === '1'

  let fromMs: number | null = null
  if (period === 'hoje') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    fromMs = d.getTime()
  } else if (period === '7d') {
    fromMs = Date.now() - 7 * 86400000
  }

  if (period === 'turno' && !turnoId) {
    return NextResponse.json(
      { error: 'Indica o turno (turnoId) para o período «Este turno».' },
      { status: 400 }
    )
  }

  try {
    const entregas = await listEntregasForStore(supabase, gate.ctx.storeId, {
      turnoId: period === 'turno' ? turnoId ?? undefined : undefined,
      fromMs: period !== 'turno' ? fromMs : null,
      entregadorId: entregadorId || null,
      pendenteSaldo,
    })
    return NextResponse.json({ ok: true, entregas })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    if (/relation|does not exist|42P01/i.test(msg)) {
      return NextResponse.json({ ok: true, entregas: [], missingTable: true })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantDeliveryPipeline(gate.ctx.store, user.email)
  if (deny) return deny

  let body: {
    orderId?: unknown
    entregadorId?: unknown
    entregadorNomeAvulso?: unknown
    entregadorNome?: unknown
    valorCorrida?: unknown
    valorRecebidoCliente?: unknown
    formaPagamentoEntrega?: unknown
    observacao?: unknown
    clientePagouTaxa?: unknown
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
  if (!orderId) return NextResponse.json({ error: 'Pedido em falta.' }, { status: 400 })

  const parseMoney = (v: unknown): number => {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v * 100) / 100
    if (typeof v === 'string') {
      const n = Number(v.replace(',', '.').trim())
      if (Number.isFinite(n) && n >= 0) return Math.round(n * 100) / 100
    }
    return 0
  }

  const valorCorrida = parseMoney(body.valorCorrida)
  const clientePagou = body.clientePagouTaxa === true
  const valorRecebidoCliente = clientePagou
    ? parseMoney(body.valorRecebidoCliente)
    : 0
  const formaRaw = String(body.formaPagamentoEntrega ?? '').trim().toLowerCase()
  const forma =
    formaRaw === 'pix' || formaRaw === 'cartao' || formaRaw === 'cartão'
      ? formaRaw === 'cartão'
        ? 'cartao'
        : formaRaw
      : formaRaw === 'dinheiro' || formaRaw === 'cash'
        ? 'dinheiro'
        : null

  const entId =
    typeof body.entregadorId === 'string' && body.entregadorId.trim()
      ? body.entregadorId.trim()
      : null
  const avulso =
    typeof body.entregadorNomeAvulso === 'string'
      ? body.entregadorNomeAvulso.trim()
      : typeof body.entregadorNome === 'string'
        ? body.entregadorNome.trim()
        : ''

  if (!entId && !avulso) {
    return NextResponse.json(
      { error: 'Seleciona um entregador ou indica nome avulso.' },
      { status: 400 }
    )
  }
  if (clientePagou && valorRecebidoCliente <= 0) {
    return NextResponse.json(
      { error: 'Indica o valor recebido do cliente.' },
      { status: 400 }
    )
  }
  if (clientePagou && !forma) {
    return NextResponse.json(
      { error: 'Indica como o cliente pagou a entrega.' },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const storeId = gate.ctx.storeId

  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('id, status, store_id')
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (oErr || !order) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  }

  const st = String((order as { status?: string }).status ?? '')
  if (st !== 'delivered') {
    return NextResponse.json(
      { error: 'Só é possível registar entrega em pedidos já marcados como entregues.' },
      { status: 409 }
    )
  }

  const existing = await getEntregaByOrderId(supabase, storeId, orderId)
  if (existing) {
    return NextResponse.json(
      { error: 'Este pedido já tem entrega registada.' },
      { status: 409 }
    )
  }

  let nomeSnapshot = avulso
  if (entId) {
    const { data: ent } = await supabase
      .from('store_entregadores')
      .select('nome')
      .eq('id', entId)
      .eq('store_id', storeId)
      .maybeSingle()
    if (!ent) {
      return NextResponse.json({ error: 'Entregador não encontrado.' }, { status: 404 })
    }
    nomeSnapshot = String((ent as { nome?: string }).nome ?? '').trim() || nomeSnapshot
  }

  const { data: turnoAberto } = await supabase
    .from('caixas_turnos')
    .select('id')
    .eq('store_id', storeId)
    .eq('status', 'aberto')
    .maybeSingle()

  const turnoId =
    turnoAberto && typeof (turnoAberto as { id?: string }).id === 'string'
      ? (turnoAberto as { id: string }).id
      : null

  try {
    const entrega = await insertEntrega(supabase, storeId, {
      order_id: orderId,
      entregador_id: entId,
      entregador_nome: nomeSnapshot,
      valor_corrida: valorCorrida,
      valor_recebido_cliente: valorRecebidoCliente,
      forma_pagamento_entrega: clientePagou ? forma : null,
      turno_id: turnoId,
      observacao:
        typeof body.observacao === 'string' ? body.observacao.trim() || null : null,
    })
    return NextResponse.json({ ok: true, entrega })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
