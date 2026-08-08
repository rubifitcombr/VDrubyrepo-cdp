import { test, expect } from './test-with-teardown'
import { CAIXA_PAYMENT_CLOSE_MARKER } from '../../lib/cashier-comanda-close'
import { rollbackCashierOrderCloseClaim } from '../../lib/order-payment-close-rollback'
import { E2E_STORE_ID, getSupabaseAdmin } from './helpers'
import { trackOrderForTeardown } from './teardown'

test.describe('Suspeito #15 — rollback fecho comanda (caixa)', () => {
  test('dois rollbacks concorrentes: só um reverte o claim de pagamento', async () => {
    const sb = getSupabaseAdmin()
    const orderId = crypto.randomUUID()
    const originalNotes = 'Mesa: 88\nSetor: Salão'
    const closeLine = `${CAIXA_PAYMENT_CLOSE_MARKER}${new Date().toISOString()} (cash)`
    const closedNotes = `${originalNotes}\n${closeLine}`

    const { error: insErr } = await sb.from('orders').insert({
      id: orderId,
      store_id: E2E_STORE_ID,
      customer_name: 'E2E Rollback Caixa',
      status: 'delivered',
      source: 'waiter',
      total: 22,
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
      rollbackCashierOrderCloseClaim(sb, E2E_STORE_ID, orderId, patch),
      rollbackCashierOrderCloseClaim(sb, E2E_STORE_ID, orderId, patch),
    ])

    expect([r1, r2].filter(Boolean).length).toBe(1)

    const { data: after } = await sb
      .from('orders')
      .select('status, notes')
      .eq('id', orderId)
      .single()

    expect(String(after?.status)).toBe('preparing')
    expect(String(after?.notes ?? '')).toBe(originalNotes)
    expect(String(after?.notes ?? '')).not.toContain(CAIXA_PAYMENT_CLOSE_MARKER)

    await sb.from('orders').delete().eq('id', orderId)
  })
})
