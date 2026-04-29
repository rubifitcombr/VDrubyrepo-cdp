import { NextResponse } from 'next/server'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { hasFeature } from '@/lib/plan'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'

type BodyItem = {
  product_id: string
  quantity: number
  unit_price: number
  name: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseTableLabel(raw: unknown): string | null {
  const t = String(raw ?? '').trim()
  if (!t) return null
  if (t.length > 42) return null
  return t
}

function parseSectorLabel(raw: unknown): string {
  const t = String(raw ?? '').trim()
  if (!t) return 'salão'
  const normalized = t.toLowerCase()
  if (normalized === 'varanda') return 'varanda'
  return 'salão'
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
  if (!hasFeature(plan, 'waiter')) {
    return NextResponse.json(
      { error: 'Recurso disponível apenas no plano Pro.' },
      { status: 403 }
    )
  }

  let body: {
    table?: string
    sector?: string
    customer_name?: string | null
    payment_method?: string | null
    notes?: string | null
    items?: BodyItem[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const table = parseTableLabel(body.table)
  const sector = parseSectorLabel(body.sector)
  if (!table) {
    return NextResponse.json(
      { error: 'Informe a mesa para registrar o pedido.' },
      { status: 400 }
    )
  }

  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    return NextResponse.json(
      { error: 'Adicione ao menos um item.' },
      { status: 400 }
    )
  }

  const storeId = gate.ctx.storeId
  const supabase = await createClient()

  const productIds = items.map((i) => String(i.product_id ?? '')).filter(Boolean)
  const { data: prodOk, error: prodErr } = await supabase
    .from('products')
    .select('id, name')
    .eq('store_id', storeId)
    .in('id', productIds)

  if (prodErr) {
    return NextResponse.json(
      { error: 'Não foi possível validar os produtos.' },
      { status: 500 }
    )
  }

  const allowed = new Set((prodOk ?? []).map((p) => String(p.id)))
  const cleanItems = items
    .filter((i) => allowed.has(String(i.product_id)))
    .map((i) => ({
      product_id: String(i.product_id),
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

  const total = round2(
    cleanItems.reduce((sum, line) => sum + line.unit_price * line.quantity, 0)
  )
  const itemsSummary = cleanItems.map((i) => `${i.quantity}x ${i.name}`).join(', ')

  const extraNotes = String(body.notes ?? '').trim()
  const noteLines = [`[Mesa ${table}]`, `[Setor ${sector}]`]
  if (extraNotes) noteLines.push(extraNotes)
  const notes = noteLines.join('\n')

  const payment =
    typeof body.payment_method === 'string' && body.payment_method.trim()
      ? body.payment_method.trim()
      : 'cash'

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      store_id: storeId,
      customer_name: body.customer_name?.trim() || null,
      total,
      status: 'pending',
      source: 'waiter',
      payment_method: payment,
      items_summary: itemsSummary,
      notes,
    })
    .select('id')
    .single()

  if (orderErr || !order?.id) {
    return NextResponse.json(
      { error: orderErr?.message ?? 'Não foi possível criar o pedido.' },
      { status: 500 }
    )
  }

  const rows = cleanItems.map((i) => ({
    order_id: String(order.id),
    product_id: i.product_id,
    quantity: i.quantity,
    price: i.unit_price,
    unit_price: i.unit_price,
    name: i.name,
  }))
  const { error: itemsErr } = await supabase.from('order_items').insert(rows)

  if (itemsErr) {
    await supabase.from('orders').delete().eq('id', String(order.id))
    return NextResponse.json(
      { error: itemsErr.message || 'Não foi possível gravar os itens.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    orderId: String(order.id),
    order: {
      id: String(order.id),
      customer_name: body.customer_name?.trim() || null,
      total,
      status: 'pending',
      source: 'waiter',
      payment_method: payment,
      items_summary: itemsSummary,
      notes,
      created_at: new Date().toISOString(),
    },
  })
}

