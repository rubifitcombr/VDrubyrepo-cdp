import { test, expect } from '@playwright/test'
import {
  countOkResponses,
  countStatus,
  E2E_STORE_ID,
  getSupabaseAdmin,
  readE2eTestData,
} from './helpers'

test.describe('Grupo 3 — comanda duplicada no POST garçom', () => {
  test('dois POST concorrentes com mesmo nome na mesa: só um sucesso', async ({
    request,
  }) => {
    const data = readE2eTestData()
    expect(data.garcoms[0]?.id).toBeTruthy()

    const sb = getSupabaseAdmin()

    const { data: storeTable } = await sb
      .from('store_tables')
      .select('id, name, ambiente')
      .eq('store_id', E2E_STORE_ID)
      .eq('active', true)
      .order('sort_order')
      .limit(1)
      .maybeSingle()

    expect(storeTable?.id).toBeTruthy()

    const { data: product } = await sb
      .from('products')
      .select('id, name, price, dine_in_price, delivery_price')
      .eq('store_id', E2E_STORE_ID)
      .eq('active', true)
      .limit(1)
      .maybeSingle()

    expect(product?.id).toBeTruthy()

    const tableName = String(storeTable!.name)
    const sector = String(storeTable!.ambiente ?? 'Salão')
    const unitPrice = Number(product!.dine_in_price ?? product!.price) || 10
    const comandaName = `Comanda · Mesa ${tableName}`

    const body = {
      table: tableName,
      sector,
      customer_name: comandaName,
      payment_method: 'cash',
      garcom_id: data.garcoms[0]!.id,
      items: [
        {
          product_id: product!.id,
          quantity: 1,
          unit_price: unitPrice,
          name: String(product!.name),
        },
      ],
    }

    const post = (clientRequestId: string) =>
      request.post('/api/waiter/orders', {
        data: { ...body, client_request_id: clientRequestId },
      })

    const responses = await Promise.all([
      post(crypto.randomUUID()),
      post(crypto.randomUUID()),
    ])

    if (countOkResponses(responses) !== 1) {
      const bodies = await Promise.all(responses.map((r) => r.text()))
      throw new Error(
        `Esperado 1 sucesso; status ${responses.map((r) => r.status()).join('/')}: ${bodies.join(' | ')}`
      )
    }

    expect(countOkResponses(responses)).toBe(1)
    expect(countStatus(responses, 409)).toBe(1)

    const failed = responses.find((r) => r.status() === 409)
    const failJson = (await failed!.json()) as { error?: string }
    expect(String(failJson.error ?? '')).toMatch(/comanda|nome|mesa/i)

    const { data: openRows } = await sb
      .from('orders')
      .select('id')
      .eq('store_id', E2E_STORE_ID)
      .eq('salon_table_id', storeTable!.id)
      .ilike('customer_name', comandaName)
      .in('status', ['pending', 'preparing', 'ready', 'confirmed'])

    expect((openRows ?? []).length).toBe(1)

    for (const row of openRows ?? []) {
      await sb.from('order_items').delete().eq('order_id', row.id)
      await sb.from('orders').delete().eq('id', row.id)
    }
  })
})
