import { test, expect } from './test-with-teardown'
import {
  clearProductStock,
  E2E_STORE_ID,
  getSupabaseAdmin,
  readProductStockQuantity,
  setProductStockQuantity,
} from './helpers'
import {
  trackOrderForTeardown,
  trackProductStockClearOnTeardown,
} from './teardown'
import {
  notesIndicateWaiterReleasedToCaixa,
  WAITER_PENDING_CAIXA_MARKER,
} from '../../lib/waiter-order-notes'

type ItemRow = {
  product_id: string
  quantity: number
  unit_price: number
  name: string
}

async function setupSalonOrder(sb: ReturnType<typeof getSupabaseAdmin>, product: ItemRow) {
  const orderId = crypto.randomUUID()
  const tableLabel = '88'
  const notes = `Mesa: ${tableLabel}\nSetor: Salão`

  await setProductStockQuantity(product.product_id, 5)
  trackProductStockClearOnTeardown(product.product_id)

  const { error: insErr } = await sb.from('orders').insert({
    id: orderId,
    store_id: E2E_STORE_ID,
    customer_name: `Comanda · Mesa ${tableLabel}`,
    status: 'preparing',
    source: 'waiter',
    total: product.unit_price,
    payment_method: 'cash',
    notes,
  })
  expect(insErr).toBeNull()
  trackOrderForTeardown(orderId)

  const { error: itemErr } = await sb.from('order_items').insert({
    order_id: orderId,
    product_id: product.product_id,
    name: product.name,
    quantity: 1,
    unit_price: product.unit_price,
    price: product.unit_price,
  })
  expect(itemErr).toBeNull()

  await sb
    .from('store_product_stock')
    .update({
      quantity: 4,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', E2E_STORE_ID)
    .eq('product_id', product.product_id)

  return { orderId, tableLabel, notes }
}

function buildPatchBody(tableLabel: string, product: ItemRow) {
  return {
    table: tableLabel,
    sector: 'Salão',
    items: [
      {
        product_id: product.product_id,
        quantity: 2,
        unit_price: product.unit_price,
        name: product.name,
      },
    ],
    customer_name: `Comanda · Mesa ${tableLabel}`,
  }
}

async function readOrderItems(sb: ReturnType<typeof getSupabaseAdmin>, orderId: string) {
  const { data } = await sb
    .from('order_items')
    .select('product_id, quantity, unit_price, name')
    .eq('order_id', orderId)
  return (data ?? []) as ItemRow[]
}

function orderIsBlocked(order: { status?: string | null; notes?: string | null }) {
  return (
    notesIndicateWaiterReleasedToCaixa(order.notes) ||
    String(order.status ?? '').toLowerCase() === 'cancelled'
  )
}

test.describe('Grupo 1 — PATCH garçom vs handoff/cancel', () => {
  test('corrida PATCH + handoff ao caixa: comanda bloqueada não altera itens nem stock', async ({
    request,
  }) => {
    const sb = getSupabaseAdmin()
    const { data: product } = await sb
      .from('products')
      .select('id, name, price')
      .eq('store_id', E2E_STORE_ID)
      .eq('active', true)
      .limit(1)
      .maybeSingle()
    expect(product?.id).toBeTruthy()

    const row: ItemRow = {
      product_id: String(product!.id),
      name: String(product!.name),
      quantity: 1,
      unit_price: Number(product!.price) || 10,
    }

    const { orderId, tableLabel } = await setupSalonOrder(sb, row)
    const baselineItems = await readOrderItems(sb, orderId)
    const baselineStock = await readProductStockQuantity(row.product_id)
    expect(baselineStock).toBe(4)

    const patchBody = buildPatchBody(tableLabel, row)

    const [patchRes, handoffRes] = await Promise.all([
      request.patch(`/api/waiter/orders/${orderId}`, { data: patchBody }),
      request.post('/api/waiter/orders/checkout', {
        data: { orderId, mode: 'cashier' },
      }),
    ])

    const { data: afterOrder } = await sb
      .from('orders')
      .select('status, notes, total')
      .eq('id', orderId)
      .single()

    expect(afterOrder).toBeTruthy()
    const blocked = orderIsBlocked(afterOrder!)
    const afterItems = await readOrderItems(sb, orderId)
    const afterStock = await readProductStockQuantity(row.product_id)

    if (blocked) {
      expect(Number(afterItems[0]?.quantity ?? 0)).toBe(1)
      expect(afterStock).toBe(4)
      expect(patchRes.ok()).toBe(false)
    } else {
      expect(handoffRes.status()).toBe(409)
    }

    expect(
      blocked || Number(afterItems[0]?.quantity) === 2
    ).toBeTruthy()

    await sb.from('order_items').delete().eq('order_id', orderId)
    await sb.from('orders').delete().eq('id', orderId)
    await clearProductStock(row.product_id)
  })

  test('corrida PATCH + cancelamento: comanda bloqueada não aplica edição de itens', async ({
    request,
  }) => {
    const sb = getSupabaseAdmin()
    const { data: product } = await sb
      .from('products')
      .select('id, name, price')
      .eq('store_id', E2E_STORE_ID)
      .eq('active', true)
      .limit(1)
      .maybeSingle()
    expect(product?.id).toBeTruthy()

    const row: ItemRow = {
      product_id: String(product!.id),
      name: String(product!.name),
      quantity: 1,
      unit_price: Number(product!.price) || 10,
    }

    const { orderId, tableLabel } = await setupSalonOrder(sb, row)
    await readOrderItems(sb, orderId)

    const patchBody = buildPatchBody(tableLabel, row)

    const [patchRes, cancelRes] = await Promise.all([
      request.patch(`/api/waiter/orders/${orderId}`, { data: patchBody }),
      request.post('/api/orders/status', {
        data: { orderId, status: 'cancelled' },
      }),
    ])

    const { data: afterOrder } = await sb
      .from('orders')
      .select('status, notes')
      .eq('id', orderId)
      .single()

    const blocked = orderIsBlocked(afterOrder ?? {})
    const afterItems = await readOrderItems(sb, orderId)

    if (String(afterOrder?.status).toLowerCase() === 'cancelled') {
      expect(Number(afterItems[0]?.quantity ?? 0)).toBe(1)
      expect(patchRes.ok()).toBe(false)
    } else if (blocked) {
      expect(Number(afterItems[0]?.quantity ?? 0)).toBe(1)
    }

    expect(cancelRes.ok() || patchRes.ok()).toBeTruthy()

    await sb.from('order_items').delete().eq('order_id', orderId)
    await sb.from('orders').delete().eq('id', orderId)
    await clearProductStock(row.product_id)
  })

  test('advance/confirm bloqueados após handoff (orders/status)', async ({ request }) => {
    const sb = getSupabaseAdmin()
    const orderId = crypto.randomUUID()
    const notes = `Mesa: 77\nSetor: Salão\n${WAITER_PENDING_CAIXA_MARKER} (${new Date().toISOString()})`

    const { error: insErr } = await sb.from('orders').insert({
      id: orderId,
      store_id: E2E_STORE_ID,
      customer_name: 'Comanda · Mesa 77',
      status: 'ready',
      source: 'waiter',
      total: 12,
      notes,
    })
    expect(insErr).toBeNull()
    trackOrderForTeardown(orderId)

    const [advanceRes, confirmRes] = await Promise.all([
      request.post('/api/orders/status', {
        data: { orderId, status: 'confirmed' },
      }),
      request.post('/api/orders/status', {
        data: { orderId, status: 'preparing' },
      }),
    ])

    expect(advanceRes.status()).toBe(409)
    expect(confirmRes.status()).toBe(409)

    await sb.from('orders').delete().eq('id', orderId)
  })
})
