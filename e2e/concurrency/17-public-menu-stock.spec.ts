import { test, expect } from '@playwright/test'
import { E2E_STORE_SLUG } from '../fixtures/store'
import {
  buildPublicCheckoutBody,
  clearProductStock,
  pickActiveCheckoutProduct,
  postPublicCheckout,
  readProductStockQuantity,
  setProductStockQuantity,
} from './helpers'

test.describe('Stock público — cardápio', () => {
  test('produto esgotado fica visível e desabilitado; 2 checkouts concorrentes do último item', async ({
    page,
    request,
  }) => {
    const product = await pickActiveCheckoutProduct()

    try {
      await setProductStockQuantity(product.productId, 0)
      await page.goto(`/${E2E_STORE_SLUG}`)
      await expect(
        page.getByTestId(`storefront-out-of-stock-${product.productId}`)
      ).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText(product.name).first()).toBeVisible()

      await setProductStockQuantity(product.productId, 1)
      const body = buildPublicCheckoutBody(product)

      const [first, second] = await Promise.all([
        postPublicCheckout(request, body),
        postPublicCheckout(request, body),
      ])

      const okCount = [first, second].filter((r) => r.ok()).length
      const conflictCount = [first, second].filter((r) => r.status() === 409).length
      expect(okCount).toBe(1)
      expect(conflictCount).toBe(1)

      const failed = first.ok() ? second : first
      const failJson = (await failed.json()) as { error?: string }
      expect(String(failJson.error ?? '')).toMatch(/stock|estoque/i)

      expect(await readProductStockQuantity(product.productId)).toBe(0)
    } finally {
      await clearProductStock(product.productId)
    }
  })
})
