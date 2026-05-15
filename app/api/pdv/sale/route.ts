import { NextResponse } from 'next/server'
import {
  effectivePlanFromStore,
  gateMerchantMenuKey,
} from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'
import { getOpenCaixaTurno } from '@/services/caixa-turnos.server'
import { buildItemsSummaryWithLineTotals } from '@/lib/print/items-summary-format'
import { tryAutoThermalPrint } from '@/services/thermal-print.server'
import { hasFeature } from '@/lib/plan'

type PaymentMethod = 'cash' | 'pix' | 'card'

type BodyItem = {
  product_id?: unknown
  quantity?: unknown
  unit_price?: unknown
  name?: unknown
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function normalizePayment(v: unknown): PaymentMethod | null {
  const t = String(v ?? '').trim().toLowerCase()
  if (t === 'cash' || t === 'pix' || t === 'card') return t
  return null
}

function friendlyStockError(raw: string | undefined): string {
  const m = raw?.trim() || ''
  if (/estoque insuficiente/i.test(m)) {
    const q = m.match(/Estoque insuficiente para "([^"]+)"/i)
    if (q?.[1]) {
      return `Stock insuficiente para «${q[1]}». Ajusta a quantidade ou o estoque.`
    }
    return 'Stock insuficiente para um dos produtos. Ajusta a quantidade ou o estoque.'
  }
  return m || 'Erro ao guardar os itens do pedido.'
}

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const denyPdv = gateMerchantMenuKey(gate.ctx.store, user.email, 'pdv')
  if (denyPdv) return denyPdv

  const plan = effectivePlanFromStore(gate.ctx.store, user.email)
  const caixaModule = hasFeature(plan, 'cashier')

  let body: {
    closeMode?: unknown
    paymentMethod?: unknown
    customerName?: unknown
    internalNotes?: unknown
    discountBrl?: unknown
    items?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const closeMode = body.closeMode === 'immediate' ? 'immediate' : 'cashier'
  let paymentMethod: PaymentMethod | null = null

  if (closeMode === 'cashier' && !caixaModule) {
    return NextResponse.json(
      {
        error:
          'Este plano não inclui o módulo Caixa. Regista o pagamento com «Receber agora».',
      },
      { status: 400 }
    )
  }

  if (closeMode === 'immediate') {
    if (caixaModule) {
      const denyCaixa = gateMerchantMenuKey(gate.ctx.store, user.email, 'caixa')
      if (denyCaixa) {
        return NextResponse.json(
          {
            error:
              'Receber no balcão exige permissão de Caixa. Usa «Enviar para o Caixa» ou abre sessão com acesso ao Caixa.',
          },
          { status: 403 }
        )
      }
    }
    paymentMethod = normalizePayment(body.paymentMethod)
    if (!paymentMethod) {
      return NextResponse.json(
        { error: 'Indica o método de pagamento para receber agora.' },
        { status: 400 }
      )
    }
  }

  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    return NextResponse.json(
      { error: 'Adiciona pelo menos um produto.' },
      { status: 400 }
    )
  }

  const storeId = gate.ctx.storeId
  const supabase = await createClient()

  let turnoAberto: { id: string } | null = null
  if (closeMode === 'immediate' && caixaModule) {
    turnoAberto = await getOpenCaixaTurno(supabase, storeId)
    if (!turnoAberto) {
      return NextResponse.json(
        { error: 'Abre um turno de caixa para receber pagamentos no balcão.' },
        { status: 400 }
      )
    }
  }

  const productIds = (items as BodyItem[])
    .map((i) => String(i.product_id ?? '').trim())
    .filter(Boolean)
  if (productIds.length === 0) {
    return NextResponse.json(
      { error: 'Cada item precisa de product_id válido.' },
      { status: 400 }
    )
  }
  const { data: prodOk, error: prodErr } = await supabase
    .from('products')
    .select('id')
    .eq('store_id', storeId)
    .in('id', productIds)

  if (prodErr) {
    return NextResponse.json(
      { error: 'Não foi possível validar os produtos.' },
      { status: 500 }
    )
  }

  const allowed = new Set((prodOk ?? []).map((p) => String(p.id)))
  const cleanItems = (items as BodyItem[])
    .filter((i) => allowed.has(String(i.product_id ?? '').trim()))
    .map((i) => ({
      product_id: String(i.product_id ?? '').trim(),
      quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
      unit_price: round2(Math.max(0, Number(i.unit_price) || 0)),
      name: String(i.name ?? '').trim() || 'Item',
    }))

  if (cleanItems.length === 0) {
    return NextResponse.json(
      { error: 'Nenhum item válido para esta loja.' },
      { status: 400 }
    )
  }

  const gross = round2(
    cleanItems.reduce((s, l) => s + l.unit_price * l.quantity, 0)
  )
  const discountBrl = round2(Math.max(0, Number(body.discountBrl) || 0))
  const disc = round2(Math.min(Math.max(0, discountBrl), gross))
  const total = round2(Math.max(0, gross - disc))

  const itemsSummary = buildItemsSummaryWithLineTotals(cleanItems)

  const customerName =
    typeof body.customerName === 'string' ? body.customerName.trim() || null : null

  const noteLines: string[] = []
  const internal =
    typeof body.internalNotes === 'string' ? body.internalNotes.trim() : ''
  if (internal) {
    noteLines.push(`[Balcão — interno] ${internal}`)
  }
  if (disc > 0) {
    noteLines.push(`Desconto manual: ${brl.format(disc)} (subtotal ${brl.format(gross)})`)
  }
  let notes = noteLines.length ? noteLines.join('\n') : null

  if (closeMode === 'immediate' && paymentMethod) {
    const closeLine = `[PDV] Recebido em ${new Date().toISOString()} (${paymentMethod})`
    notes = notes ? `${notes}\n${closeLine}` : closeLine
  }

  const orderInsert: Record<string, unknown> = {
    store_id: storeId,
    customer_name: customerName,
    total,
    status: closeMode === 'immediate' ? 'delivered' : 'pending',
    source: 'pdv',
    payment_method: closeMode === 'immediate' ? paymentMethod : null,
    items_summary: itemsSummary,
    notes,
  }

  if (closeMode === 'immediate' && turnoAberto) {
    orderInsert.caixa_turno_id = turnoAberto.id
  }

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert(orderInsert)
    .select('id')
    .single()

  if (orderErr || !order?.id) {
    const msg = orderErr?.message ?? ''
    if (/caixa_turno_id|column/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            'Coluna caixa_turno_id em orders em falta. Aplica a migração SQL do caixa no Supabase.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: msg || 'Não foi possível criar o pedido.' },
      { status: 500 }
    )
  }

  const orderId = String(order.id)

  const rows = cleanItems.map((l) => ({
    order_id: orderId,
    product_id: l.product_id,
    quantity: l.quantity,
    price: l.unit_price,
    unit_price: l.unit_price,
    name: l.name,
  }))

  const { error: itemsErr } = await supabase.from('order_items').insert(rows)

  if (itemsErr) {
    await supabase.from('orders').delete().eq('id', orderId)
    return NextResponse.json(
      { error: friendlyStockError(itemsErr.message) },
      { status: /estoque|stock/i.test(itemsErr.message) ? 409 : 500 }
    )
  }

  void tryAutoThermalPrint(supabase, {
    storeId,
    orderId,
    orderSource: 'pdv',
  })

  return NextResponse.json({
    ok: true,
    orderId,
    closeMode,
    closedImmediately: closeMode === 'immediate',
  })
}
