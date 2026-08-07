import { test, expect } from '@playwright/test'
import { acceptPublicOrderIfPending } from '../../lib/public-order-auto-accept'
import { E2E_STORE_ID, getSupabaseAdmin } from './helpers'

test.describe('Suspeito #7 — checkout público auto-aceite', () => {
  test('duas aceitações concorrentes: só uma transição pending→preparing', async () => {
    const sb = getSupabaseAdmin()
    const orderId = crypto.randomUUID()

    const { error: insErr } = await sb.from('orders').insert({
      id: orderId,
      store_id: E2E_STORE_ID,
      customer_name: 'E2E Auto Accept Concurrency',
      status: 'pending',
      source: 'menu_link',
      total: 18,
      payment_method: 'cash',
      delivery_address: 'Rua Teste 99',
    })
    expect(insErr).toBeNull()

    const [first, second] = await Promise.all([
      acceptPublicOrderIfPending(sb, E2E_STORE_ID, orderId),
      acceptPublicOrderIfPending(sb, E2E_STORE_ID, orderId),
    ])

    expect([first, second].filter(Boolean).length).toBe(1)

    const { data: after } = await sb
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single()

    expect(String(after?.status)).toBe('preparing')

    await sb.from('orders').delete().eq('id', orderId)
  })
})
