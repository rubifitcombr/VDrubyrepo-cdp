import { NextRequest, NextResponse } from 'next/server'
import {
  gateMerchantDeliveryPipeline,
  gateMerchantMenuKey,
} from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'
import { deleteEntregaById, insertEntrega } from '@/services/entregas.server'
import { setEntregadorStatusOperacional } from '@/services/store-entregadores.server'
import { createClient } from '@/lib/supabase/server'
import { ORDER_SELECT, mapStoreOrderRow } from '@/lib/store-order'
import { isSlugChannelOrderSource } from '@/lib/slug-channel-orders'
import { triggerLoyaltyEarnForDeliveredOrder } from '@/services/loyalty.server'
import { tryAutoEmitNfceForOrder } from '@/services/fiscal'

const ALLOWED_BEFORE = new Set(['confirmed'])

function parseMoney(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v * 100) / 100
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.').trim())
    if (Number.isFinite(n) && n >= 0) return Math.round(n * 100) / 100
  }
  return 0
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  let body: {
    orderId?: unknown
    skip?: unknown
    entregadorId?: unknown
    entregadorNomeAvulso?: unknown
    valorCorrida?: unknown
    clientePagouTaxa?: unknown
    valorRecebidoCliente?: unknown
    formaPagamentoEntrega?: unknown
    observacao?: unknown
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
  if (!orderId) return NextResponse.json({ error: 'Pedido em falta.' }, { status: 400 })

  const skip = body.skip === true
  if (skip) {
    const deny = gateMerchantMenuKey(gate.ctx.store, user.email, 'pedidos')
    if (deny) return deny
  } else {
    const deny = gateMerchantDeliveryPipeline(gate.ctx.store, user.email)
    if (deny) return deny
  }

  const storeId = gate.ctx.storeId
  const supabase = await createClient()

  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, status, store_id, source, entregador_id, entregador_nome, delivery_fee')
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (fetchErr || !order) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  }

  const current = String((order as { status?: string }).status ?? '')
  const source = String((order as { source?: string | null }).source ?? '')
  if (!isSlugChannelOrderSource(source)) {
    return NextResponse.json(
      {
        error:
          'A janela de entregadores aceita apenas pedidos do link público (entrega ou retirada).',
      },
      { status: 409 }
    )
  }
  if (current === 'delivered') {
    return NextResponse.json({ error: 'Pedido já está entregue.' }, { status: 409 })
  }
  if (!ALLOWED_BEFORE.has(current)) {
    return NextResponse.json(
      { error: 'Só é possível marcar entregue a partir do estado «A caminho».' },
      { status: 409 }
    )
  }

  if (skip) {
    const { error: upErr, data: updatedRows } = await supabase
      .from('orders')
      .update({ status: 'delivered' })
      .eq('id', orderId)
      .eq('store_id', storeId)
      .eq('status', current)
      .select('id')

    if (upErr) {
      return NextResponse.json(
        { error: upErr.message ?? 'Não foi possível atualizar o pedido.' },
        { status: 500 }
      )
    }

    if (!updatedRows?.length) {
      return NextResponse.json(
        { error: 'O estado do pedido mudou noutro painel. Actualiza e tenta de novo.' },
        { status: 409 }
      )
    }

    const fiscal = await tryAutoEmitNfceForOrder(orderId)
    void triggerLoyaltyEarnForDeliveredOrder(supabase, storeId, orderId).catch((e) =>
      console.warn('[loyalty earn]', e)
    )

    return NextResponse.json({ ok: true, skipped: true, fiscal })
  }

  const entId =
    typeof body.entregadorId === 'string' && body.entregadorId.trim()
      ? body.entregadorId.trim()
      : typeof (order as { entregador_id?: string }).entregador_id === 'string'
        ? (order as { entregador_id: string }).entregador_id
        : null
  const avulso =
    typeof body.entregadorNomeAvulso === 'string'
      ? body.entregadorNomeAvulso.trim()
      : ''

  const valorCorrida = parseMoney(body.valorCorrida)
  const clientePagou = body.clientePagouTaxa === true
  const valorRecebidoCliente = clientePagou
    ? parseMoney(body.valorRecebidoCliente)
    : 0
  const formaRaw = String(body.formaPagamentoEntrega ?? '').trim().toLowerCase()
  const forma =
    formaRaw === 'pix'
      ? 'pix'
      : formaRaw === 'cartao' || formaRaw === 'cartão'
        ? 'cartao'
        : formaRaw === 'dinheiro' || formaRaw === 'cash'
          ? 'dinheiro'
          : null

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

  let nomeSnapshot = avulso
  if (!entId && !avulso) {
    const orderNome = String((order as { entregador_nome?: string }).entregador_nome ?? '').trim()
    if (!orderNome) {
      return NextResponse.json(
        { error: 'Seleciona um entregador ou indica nome avulso.' },
        { status: 400 }
      )
    }
    nomeSnapshot = orderNome
  }

  if (entId) {
    const { data: ent } = await supabase
      .from('store_entregadores')
      .select('nome, ativo')
      .eq('id', entId)
      .eq('store_id', storeId)
      .maybeSingle()
    if (!ent) {
      return NextResponse.json({ error: 'Entregador não encontrado.' }, { status: 404 })
    }
    if ((ent as { ativo?: boolean }).ativo === false) {
      return NextResponse.json(
        { error: 'Entregador inativo. Escolhe outro ou usa nome avulso.' },
        { status: 400 }
      )
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

  let insertedId: string | null = null
  try {
    const row = await insertEntrega(supabase, storeId, {
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
    insertedId = row.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao registar entrega.'
    if (/duplicate|unique|23505/i.test(msg)) {
      return NextResponse.json(
        { error: 'Este pedido já tem entrega registada.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const { error: upErr, data: updatedRows } = await supabase
    .from('orders')
    .update({ status: 'delivered' })
    .eq('id', orderId)
    .eq('store_id', storeId)
    .eq('status', current)
    .select('id')

  if (upErr) {
    if (insertedId) {
      try {
        await deleteEntregaById(supabase, storeId, insertedId)
      } catch {
        /* ignore */
      }
    }
    return NextResponse.json(
      { error: upErr.message ?? 'Não foi possível marcar o pedido como entregue.' },
      { status: 500 }
    )
  }

  if (!updatedRows?.length) {
    if (insertedId) {
      try {
        await deleteEntregaById(supabase, storeId, insertedId)
      } catch {
        /* ignore */
      }
    }
    return NextResponse.json(
      { error: 'O estado do pedido mudou noutro painel. Actualiza e tenta de novo.' },
      { status: 409 }
    )
  }

  if (entId) {
    await setEntregadorStatusOperacional(supabase, storeId, entId, 'disponivel')
  }

  void triggerLoyaltyEarnForDeliveredOrder(supabase, storeId, orderId).catch((e) =>
    console.warn('[loyalty earn]', e)
  )

  const fiscal = await tryAutoEmitNfceForOrder(orderId)

  const { data: fresh } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .single()

  return NextResponse.json({
    ok: true,
    order: fresh ? mapStoreOrderRow(fresh as Record<string, unknown>) : null,
    entregaId: insertedId,
    fiscal,
  })
}
