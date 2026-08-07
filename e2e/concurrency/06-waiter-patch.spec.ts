import { test, expect } from '@playwright/test'
import {
  countStatus,
  E2E_STORE_ID,
  getSupabaseAdmin,
  readE2eTestData,
} from './helpers'
import { WAITER_PENDING_CAIXA_MARKER } from '../../lib/waiter-order-notes'

test.describe('Grupo A #6 — garçom PATCH comanda', () => {
  test('duas requisições concorrentes após encaminhar ao caixa: ambas rejeitadas', async ({
    request,
  }) => {
    const sb = getSupabaseAdmin()
    readE2eTestData()

    const { data: product } = await sb
      .from('products')
      .select('id, name, price')
      .eq('store_id', E2E_STORE_ID)
      .eq('active', true)
      .limit(1)
      .maybeSingle()

    expect(product?.id).toBeTruthy()

    const orderId = crypto.randomUUID()
    const tableLabel = '99'
    const notes = `Mesa: ${tableLabel}\nSetor: Salão`

    const { error: insErr } = await sb.from('orders').insert({
      id: orderId,
      store_id: E2E_STORE_ID,
      customer_name: `Comanda · Mesa ${tableLabel}`,
      status: 'preparing',
      source: 'waiter',
      total: Number(product!.price) || 10,
      payment_method: 'cash',
      notes,
    })
    expect(insErr).toBeNull()

    const { error: itemErr } = await sb.from('order_items').insert({
      order_id: orderId,
      product_id: product!.id,
      name: String(product!.name),
      quantity: 1,
      unit_price: Number(product!.price) || 10,
      price: Number(product!.price) || 10,
    })
    expect(itemErr).toBeNull()

    const patchBody = {
      table: tableLabel,
      sector: 'Salão',
      items: [
        {
          product_id: product!.id,
          quantity: 1,
          unit_price: Number(product!.price) || 10,
          name: String(product!.name),
        },
      ],
      customer_name: `Comanda · Mesa ${tableLabel}`,
    }

    const caixaNotes = `${notes}\n${WAITER_PENDING_CAIXA_MARKER} (${new Date().toISOString()})`

    const [r1, r2] = await Promise.all([
      (async () => {
        await sb
          .from('orders')
          .update({ notes: caixaNotes })
          .eq('id', orderId)
          .eq('store_id', E2E_STORE_ID)
        return request.patch(`/api/waiter/orders/${orderId}`, { data: patchBody })
      })(),
      request.patch(`/api/waiter/orders/${orderId}`, { data: patchBody }),
    ])

    expect(countStatus([r1, r2], 409)).toBe(2)

    const { data: after } = await sb
      .from('orders')
      .select('notes, total')
      .eq('id', orderId)
      .single()

    expect(String(after?.notes ?? '')).toContain(WAITER_PENDING_CAIXA_MARKER)

    await sb.from('order_items').delete().eq('order_id', orderId)
    await sb.from('orders').delete().eq('id', orderId)
  })
})
