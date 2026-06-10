import { NextRequest, NextResponse } from 'next/server'
import { gateMerchantDeliveryPipeline } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { ORDER_SELECT } from '@/lib/store-order'
import { mapStoreOrderRow } from '@/lib/store-order'
import { isSlugChannelOrderSource } from '@/lib/slug-channel-orders'
import { getUser } from '@/services/auth.server'
import {
  listEntregadoresAtivos,
  setEntregadorStatusOperacional,
} from '@/services/store-entregadores.server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_BEFORE = new Set(['ready'])

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
    prazoMinutos?: unknown
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
  if (!orderId) return NextResponse.json({ error: 'Pedido em falta.' }, { status: 400 })

  const entId =
    typeof body.entregadorId === 'string' && body.entregadorId.trim()
      ? body.entregadorId.trim()
      : null
  const avulso =
    typeof body.entregadorNomeAvulso === 'string'
      ? body.entregadorNomeAvulso.trim()
      : ''

  if (!entId && !avulso) {
    return NextResponse.json(
      { error: 'Seleciona um entregador ou indica nome avulso.' },
      { status: 400 }
    )
  }

  const prazoRaw = Number(body.prazoMinutos)
  const prazoMinutos =
    Number.isFinite(prazoRaw) && prazoRaw > 0 ? Math.floor(prazoRaw) : 45

  const storeId = gate.ctx.storeId
  const supabase = await createClient()

  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, status, store_id, source')
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
  if (!ALLOWED_BEFORE.has(current)) {
    return NextResponse.json(
      { error: 'Só é possível despachar pedidos no estado «Pronto».' },
      { status: 409 }
    )
  }

  let nomeSnapshot = avulso
  if (entId) {
    const ativos = await listEntregadoresAtivos(supabase, storeId)
    const ent = ativos.find((e) => e.id === entId)
    if (!ent) {
      return NextResponse.json({ error: 'Entregador não encontrado ou inativo.' }, { status: 404 })
    }
    nomeSnapshot = ent.nome

    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('status', 'confirmed')
      .eq('entregador_id', entId)
      .neq('id', orderId)

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Este entregador já tem outro pedido a caminho.' },
        { status: 409 }
      )
    }
  }

  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = {
    status: 'confirmed',
    entregador_id: entId,
    entregador_nome: nomeSnapshot,
    entrega_despachada_em: now,
    entrega_prazo_minutos: prazoMinutos,
  }

  let { error: upErr } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId)
    .eq('store_id', storeId)
    .eq('status', current)

  if (upErr && /column.*does not exist/i.test(upErr.message)) {
    ;({ error: upErr } = await supabase
      .from('orders')
      .update({ status: 'confirmed' })
      .eq('id', orderId)
      .eq('store_id', storeId)
      .eq('status', current))
  }

  if (upErr) {
    return NextResponse.json(
      { error: upErr.message ?? 'Não foi possível despachar o pedido.' },
      { status: 500 }
    )
  }

  if (entId) {
    await setEntregadorStatusOperacional(supabase, storeId, entId, 'em_rota')
  }

  const { data: fresh } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .single()

  return NextResponse.json({
    ok: true,
    order: fresh ? mapStoreOrderRow(fresh as Record<string, unknown>) : null,
  })
}
