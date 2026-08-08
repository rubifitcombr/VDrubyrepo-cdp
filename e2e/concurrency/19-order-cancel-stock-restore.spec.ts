import { test, expect } from './test-with-teardown'
import {
  buildPublicCheckoutBody,
  clearProductStock,
  countOkResponses,
  pickActiveCheckoutProduct,
  postPublicCheckout,
  readProductStockQuantity,
  setProductStockQuantity,
  getSupabaseAdmin,
  E2E_STORE_ID,
} from './helpers'
import { trackOrderForTeardown, trackProductStockClearOnTeardown } from './teardown'

test.describe('Stock público — cancelamento', () => {
  test('dois cancelamentos concorrentes repõem stock apenas uma vez', async ({
    request,
  }) => {
    const product = await pickActiveCheckoutProduct()
    const body = buildPublicCheckoutBody(product)
    const sb = getSupabaseAdmin()
    let orderId: string | null = null
    trackProductStockClearOnTeardown(product.productId)

    try {
      await setProductStockQuantity(product.productId, 1)

      const checkoutRes = await postPublicCheckout(request, body)
      expect(checkoutRes.ok()).toBeTruthy()
      const checkoutJson = (await checkoutRes.json()) as { orderId?: string }
      orderId = checkoutJson.orderId ? String(checkoutJson.orderId) : null
      expect(orderId).toBeTruthy()
      trackOrderForTeardown(orderId)
      expect(await readProductStockQuantity(product.productId)).toBe(0)

      const cancelResponses = await Promise.all([
        request.post('/api/orders/status', {
          data: { orderId, status: 'cancelled' },
        }),
        request.post('/api/orders/status', {
          data: { orderId, status: 'cancelled' },
        }),
      ])

      expect(countOkResponses(cancelResponses)).toBeGreaterThanOrEqual(1)
      expect(await readProductStockQuantity(product.productId)).toBe(1)

      const { data: order } = await sb
        .from('orders')
        .select('status')
        .eq('id', orderId!)
        .eq('store_id', E2E_STORE_ID)
        .single()
      expect(String(order?.status)).toBe('cancelled')
    } finally {
      if (orderId) {
        await sb.from('order_items').delete().eq('order_id', orderId)
        await sb.from('orders').delete().eq('id', orderId)
      }
      await clearProductStock(product.productId)
    }
  })
})
