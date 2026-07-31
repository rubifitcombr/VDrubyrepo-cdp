import { NextResponse } from 'next/server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { denyStaffWaiterPanelWrites } from '@/lib/waiter-staff-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'
import { ORDER_SELECT, mapStoreOrderRow } from '@/lib/store-order'
import { buildWaiterNotes } from '@/lib/waiter-order-notes'
import { createClient } from '@/lib/supabase/server'
import { buildItemsSummaryWithLineTotals } from '@/lib/print/items-summary-format'
import { isSupabaseRlsViolation } from '@/lib/supabase-rls-error'
import { tryAutoThermalPrint } from '@/services/thermal-print.server'
import { resolveGarcomForOrder } from '@/services/store-garcons.server'
import {
  merchantHasScaleIntegration,
} from '@/lib/merchant-api-gate.server'
import {
  mapPricedLinesToOrderItemRows,
  pricePdvLinesFromCatalog,
} from '@/lib/pdv-price.server'

type BodyItem = {
  product_id: string
  quantity: number
  unit_price: number
  name: string
  unit_type?: 'unit' | 'weight'
  addons?: unknown
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
  if (!t) return 'Salão'
  if (t.length > 40) return 'Salão'
  return t
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMenuKey(gate.ctx.store, user.email, 'garcom')
  if (deny) return deny

  const denyStaff = denyStaffWaiterPanelWrites(gate.ctx.store, user.email)
  if (denyStaff) return denyStaff

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

  const hasWeightItems = items.some((i) => i.unit_type === 'weight')
  if (hasWeightItems && !merchantHasScaleIntegration(gate.ctx.store, user.email)) {
    return NextResponse.json(
      {
        error:
          'Produtos por peso exigem o plano Pro em operação presencial ou híbrida.',
      },
      { status: 403 }
    )
  }

  const storeId = gate.ctx.storeId
  const supabase = await createClient()

  const priced = await pricePdvLinesFromCatalog(
    supabase,
    storeId,
    items.map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
      name: i.name,
      unit_type: i.unit_type,
      addons: i.addons,
    })),
    'dine_in'
  )
  if (!priced.ok) {
    return NextResponse.json({ error: priced.error }, { status: priced.status })
  }
  const cleanItems = priced.lines

  const gross = round2(
    cleanItems.reduce((sum, line) => sum + line.unit_price * line.quantity, 0)
  )
  const discountBrl = round2(Math.max(0, Number(body.discount_brl) || 0))
  const total = round2(Math.max(0, gross - discountBrl))
  const itemsSummary = buildItemsSummaryWithLineTotals(cleanItems)

  const extraNotes = String(body.notes ?? '').trim()
  const notes = buildWaiterNotes(table, sector, extraNotes, discountBrl)

  const payment =
    typeof body.payment_method === 'string' && body.payment_method.trim()
      ? body.payment_method.trim()
      : null

  const garcom = await resolveGarcomForOrder(
    supabase,
    storeId,
    typeof body.garcom_id === 'string' ? body.garcom_id : null
  )

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
      garcom_id: garcom.garcom_id,
      garcom_nome: garcom.garcom_nome,
    })
    .select('id')
    .single()

  if (orderErr || !order?.id) {
    if (isSupabaseRlsViolation(orderErr?.message)) {
      return NextResponse.json(
        {
          error:
            'Não foi possível lançar o pedido: loja inactiva, plano vencido ou permissões em falta na base de dados.',
        },
        { status: 403 }
      )
    }
    return NextResponse.json(
      { error: orderErr?.message ?? 'Não foi possível criar o pedido.' },
      { status: 500 }
    )
  }

  const orderId = String(order.id)

  const rows = mapPricedLinesToOrderItemRows(orderId, cleanItems)
  const { error: itemsErr } = await supabase.from('order_items').insert(rows)

  if (itemsErr) {
    await supabase.from('orders').delete().eq('id', orderId)
    return NextResponse.json(
      { error: itemsErr.message || 'Não foi possível gravar os itens.' },
      { status: 500 }
    )
  }

  const { data: full, error: fullErr } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .single()

  void tryAutoThermalPrint({
    storeId,
    orderId,
    orderSource: 'waiter',
  })

  if (fullErr || !full) {
    return NextResponse.json({
      ok: true,
      orderId,
      order: {
        id: orderId,
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

  return NextResponse.json({
    ok: true,
    orderId,
    order: mapStoreOrderRow(full as Record<string, unknown>),
  })
}

