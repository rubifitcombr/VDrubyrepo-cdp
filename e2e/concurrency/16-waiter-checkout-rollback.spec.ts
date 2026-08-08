import { test, expect } from './test-with-teardown'
import { rollbackWaiterOrderCloseClaim } from '../../lib/order-payment-close-rollback'
import { GARCOM_PAYMENT_CLOSE_MARKER } from '../../lib/waiter-order-notes'
import { E2E_STORE_ID, getSupabaseAdmin } from './helpers'
import { trackOrderForTeardown } from './teardown'

test.describe('Suspeito #16 — rollback fecho comanda (garçom)', () => {
  test('dois rollbacks concorrentes: só um reverte o claim de pagamento', async () => {
    const sb = getSupabaseAdmin()
    const orderId = crypto.randomUUID()
    const originalNotes = 'Mesa: 77\nSetor: Salão'
    const closeLine = `${GARCOM_PAYMENT_CLOSE_MARKER}${new Date().toISOString()} (cash)`
    const closedNotes = `${originalNotes}\n${closeLine}`

    const { error: insErr } = await sb.from('orders').insert({
      id: orderId,
      store_id: E2E_STORE_ID,
      customer_name: 'E2E Rollback Garçom',
      status: 'delivered',
      source: 'waiter',
      total: 19,
      payment_method: 'cash',
      notes: closedNotes,
      caixa_turno_id: null,
    })
    expect(insErr).toBeNull()
    trackOrderForTeardown(orderId)

    const patch = {
      status: 'preparing',
      payment_method: null,
      notes: originalNotes,
      caixa_turno_id: null,
    }

    const [r1, r2] = await Promise.all([
      rollbackWaiterOrderCloseClaim(sb, E2E_STORE_ID, orderId, patch),
      rollbackWaiterOrderCloseClaim(sb, E2E_STORE_ID, orderId, patch),
    ])

    expect([r1, r2].filter(Boolean).length).toBe(1)

    const { data: after } = await sb
      .from('orders')
      .select('status, notes')
      .eq('id', orderId)
      .single()

    expect(String(after?.status)).toBe('preparing')
    expect(String(after?.notes ?? '')).toBe(originalNotes)
    expect(String(after?.notes ?? '')).not.toContain(GARCOM_PAYMENT_CLOSE_MARKER)

    await sb.from('orders').delete().eq('id', orderId)
  })
})
