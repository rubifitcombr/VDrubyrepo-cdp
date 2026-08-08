import { test, expect } from './test-with-teardown'
import { execSync } from 'child_process'
import path from 'path'
import { earnLoyaltyForDeliveredOrder } from '../../lib/loyalty-earn-delivered-order'
import { E2E_STORE_ID, getSupabaseAdmin } from './helpers'
import { trackLoyaltyTestForTeardown } from './teardown'

test.describe('Grupo B #5 — loyalty earn', () => {
  test.beforeAll(() => {
    const script = path.resolve(process.cwd(), 'scripts/apply-concurrency-migration.mjs')
    try {
      execSync(`node "${script}"`, { stdio: 'pipe', env: process.env })
    } catch (e) {
      console.warn('[migration]', e)
    }
  })

  test('dois créditos concorrentes: só uma linha earn no ledger', async () => {
    const sb = getSupabaseAdmin()
    const orderId = crypto.randomUUID()
    const phone = '+5511999990001'

    await sb.from('store_loyalty_config').upsert(
      {
        store_id: E2E_STORE_ID,
        enabled: true,
        points_per_real: 1,
        welcome_bonus_points: 0,
        redeem_cents_per_point: 100,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'store_id' }
    )

    const { error: orderErr } = await sb.from('orders').insert({
      id: orderId,
      store_id: E2E_STORE_ID,
      customer_name: 'E2E Loyalty Concurrency',
      customer_phone: phone,
      status: 'delivered',
      source: 'pdv',
      total: 42,
      payment_method: 'cash',
    })
    expect(orderErr).toBeNull()
    trackLoyaltyTestForTeardown(orderId, phone)

    await Promise.all([
      earnLoyaltyForDeliveredOrder(sb, {
        store_id: E2E_STORE_ID,
        order_id: orderId,
        customer_phone: phone,
        customer_name: 'E2E Loyalty Concurrency',
        order_total: 42,
      }),
      earnLoyaltyForDeliveredOrder(sb, {
        store_id: E2E_STORE_ID,
        order_id: orderId,
        customer_phone: phone,
        customer_name: 'E2E Loyalty Concurrency',
        order_total: 42,
      }),
    ])

    const { count } = await sb
      .from('loyalty_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', E2E_STORE_ID)
      .eq('order_id', orderId)
      .eq('kind', 'earn')

    expect(count).toBe(1)

    await sb.from('loyalty_ledger').delete().eq('order_id', orderId)
    await sb.from('loyalty_accounts').delete().eq('store_id', E2E_STORE_ID).eq('customer_phone', phone)
    await sb.from('orders').delete().eq('id', orderId)
  })
})
