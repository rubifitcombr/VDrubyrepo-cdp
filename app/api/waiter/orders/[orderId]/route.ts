import { NextResponse } from 'next/server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { denyStaffWaiterPanelWrites } from '@/lib/waiter-staff-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { ORDER_SELECT, mapStoreOrderRow } from '@/lib/store-order'
import {
  buildWaiterNotes,
  extractUserNotes,
  isSalonMapOrderSource,
  notesIndicateWaiterReleasedToCaixa,
  parseSectorFromNotes,
  parseTableFromNotes,
} from '@/lib/waiter-order-notes'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'
import { buildItemsSummaryWithLineTotals } from '@/lib/print/items-summary-format'
import { resolveGarcomForOrder } from '@/services/store-garcons.server'

type BodyItem = {
  product_id: string
  quantity: number
  unit_price: number
  name: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const EDITABLE = new Set(['pending', 'preparing', 'ready', 'confirmed'])

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ orderId: string }> }
) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMenuKey(gate.ctx.store, user.email, 'garcom')
  if (deny) return deny

  const { orderId } = await ctx.params
  const id = String(orderId ?? '').trim()
  if (!id) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })

  const supabase = await createClient()
  const { data: order, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .eq('store_id', gate.ctx.storeId)
    .maybeSingle()

  if (error || !order) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  }
  const mapped = mapStoreOrderRow(order as Record<string, unknown>)
  if (!isSalonMapOrderSource(mapped.source)) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  }

  const { data: items, error: iErr } = await supabase
    .from('order_items')
    .select('id, product_id, quantity, unit_price, price, name')
    .eq('order_id', id)

  if (iErr) {
    return NextResponse.json({ error: iErr.message }, { status: 500 })
  }

  return NextResponse.json({
    order: mapped,
    items: items ?? [],
  })
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> }
) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMenuKey(gate.ctx.store, user.email, 'garcom')
  if (deny) return deny

  const denyStaff = denyStaffWaiterPanelWrites(gate.ctx.store, user.email)
  if (denyStaff) return denyStaff

  const { orderId } = await ctx.params
  const id = String(orderId ?? '').trim()
  if (!id) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })

  let body: {
    table?: string
    sector?: string
    customer_name?: string | null
    payment_method?: string | null
    notes?: string | null
    items?: BodyItem[]
    discount_brl?: unknown
    garcom_id?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const supabase = await createClient()
  const storeId = gate.ctx.storeId

  const { data: existing, error: fErr } = await supabase
    .from('orders')
    .select('id, status, notes, source')
    .eq('id', id)
    .eq('store_id', storeId)
    .maybeSingle()

  if (fErr || !existing) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  }
  if (!isSalonMapOrderSource(existing.source as string | null)) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  }

  if (notesIndicateWaiterReleasedToCaixa(existing.notes as string | null)) {
    return NextResponse.json(
      {
        error:
          'Esta comanda está no Caixa para pagamento e não pode ser editada pelo Garçom.',
      },
      { status: 409 }
    )
  }

  const st = String(existing.status ?? '').trim().toLowerCase()
  if (!EDITABLE.has(st)) {
    return NextResponse.json(
      { error: 'Este pedido já não pode ser editado.' },
      { status: 409 }
    )
  }

  const table =
    typeof body.table === 'string' && body.table.trim()
      ? body.table.trim().slice(0, 42)
      : parseTableFromNotes(existing.notes as string) || ''
  if (!table) {
    return NextResponse.json({ error: 'Mesa inválida.' }, { status: 400 })
  }

  const sector =
    typeof body.sector === 'string' && body.sector.trim()
      ? body.sector.trim().slice(0, 40)
      : parseSectorFromNotes(existing.notes as string)

  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    return NextResponse.json({ error: 'Adiciona ao menos um item.' }, { status: 400 })
  }

  const discountBrl = round2(
    Math.max(0, Number(body.discount_brl) || 0)
  )

  const productIds = items.map((i) => String(i.product_id ?? '')).filter(Boolean)
  const { data: prodOk, error: prodErr } = await supabase
    .from('products')
    .select('id, name')
    .eq('store_id', storeId)
    .in('id', productIds)

  if (prodErr) {
    return NextResponse.json({ error: 'Não foi possível validar os produtos.' }, { status: 500 })
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
    return NextResponse.json({ error: 'Nenhum item válido.' }, { status: 400 })
  }

  const gross = round2(
    cleanItems.reduce((sum, line) => sum + line.unit_price * line.quantity, 0)
  )
  const total = round2(Math.max(0, gross - discountBrl))
  const itemsSummary = buildItemsSummaryWithLineTotals(cleanItems)

  const userNotes =
    typeof body.notes === 'string' ? body.notes.trim() : extractUserNotes(existing.notes as string)
  const notes = buildWaiterNotes(table, sector, userNotes, discountBrl)

  const payment =
    typeof body.payment_method === 'string' && body.payment_method.trim()
      ? body.payment_method.trim()
      : 'cash'

  const garcom = await resolveGarcomForOrder(
    supabase,
    storeId,
    typeof body.garcom_id === 'string' ? body.garcom_id : null
  )

  const { error: delItems } = await supabase.from('order_items').delete().eq('order_id', id)
  if (delItems) {
    return NextResponse.json({ error: delItems.message }, { status: 500 })
  }

  const rows = cleanItems.map((i) => ({
    order_id: id,
    product_id: i.product_id,
    quantity: i.quantity,
    price: i.unit_price,
    unit_price: i.unit_price,
    name: i.name,
  }))
  const { error: insItems } = await supabase.from('order_items').insert(rows)
  if (insItems) {
    return NextResponse.json({ error: insItems.message ?? 'Erro ao gravar itens.' }, { status: 500 })
  }

  const { error: upErr } = await supabase
    .from('orders')
    .update({
      customer_name: body.customer_name?.trim() || null,
      total,
      items_summary: itemsSummary,
      notes,
      payment_method: payment,
      ...(typeof body.garcom_id === 'string'
        ? { garcom_id: garcom.garcom_id, garcom_nome: garcom.garcom_nome }
        : {}),
    })
    .eq('id', id)
    .eq('store_id', storeId)

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const { data: fresh, error: frErr } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .single()

  if (frErr || !fresh) {
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({
    ok: true,
    order: mapStoreOrderRow(fresh as Record<string, unknown>),
  })
}
