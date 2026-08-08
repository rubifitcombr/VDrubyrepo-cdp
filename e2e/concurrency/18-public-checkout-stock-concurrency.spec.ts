import { test, expect } from './test-with-teardown'
import {
  buildPublicCheckoutBody,
  clearProductStock,
  countOkResponses,
  countStatus,
  pickActiveCheckoutProduct,
  postPublicCheckout,
  readProductStockQuantity,
  setProductStockQuantity,
} from './helpers'
import { trackOrderForTeardown, trackProductStockClearOnTeardown } from './teardown'

test.describe('Stock público — checkout', () => {
  test('dois checkouts concorrentes do último item: só um sucesso', async ({
    request,
  }) => {
    const product = await pickActiveCheckoutProduct()
    const body = buildPublicCheckoutBody(product)
    trackProductStockClearOnTeardown(product.productId)

    try {
      await setProductStockQuantity(product.productId, 1)

      const responses = await Promise.all([
        postPublicCheckout(request, body),
        postPublicCheckout(request, body),
      ])

      if (countOkResponses(responses) !== 1) {
        const bodies = await Promise.all(responses.map((r) => r.text()))
        throw new Error(
          `Esperado 1 sucesso; status ${responses.map((r) => r.status()).join('/')}: ${bodies.join(' | ')}`
        )
      }
      expect(countStatus(responses, 409)).toBe(1)

      const success = responses.find((r) => r.ok())
      if (success) {
        const okJson = (await success.json()) as { orderId?: string }
        trackOrderForTeardown(okJson.orderId ?? null)
      }

      const failed = responses.find((r) => r.status() === 409)
      expect(failed).toBeTruthy()
      const failJson = (await failed!.json()) as { error?: string }
      expect(String(failJson.error ?? '')).toMatch(/stock|estoque/i)

      expect(await readProductStockQuantity(product.productId)).toBe(0)
    } finally {
      await clearProductStock(product.productId)
    }
  })
})
