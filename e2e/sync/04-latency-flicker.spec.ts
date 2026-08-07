import { test, expect } from '@playwright/test'
import { readE2eTestData } from '../helpers/test-data'
import { getSupabaseAdmin } from '../helpers/supabase-admin'

function e2eOrderSourceForStore(operationMode: string): string {
  return operationMode === 'presencial' ? 'pdv' : 'menu_link'
}

test.describe('TESTE 4 — Sem flicker com API lenta (12s)', () => {
  test('Overlay optimista mantém estado durante delay de 12s na API', async ({
    page,
  }) => {
    const data = readE2eTestData()
    const sb = getSupabaseAdmin()
    const delayMs = 12_000
    const orderSource = e2eOrderSourceForStore(data.operationMode)

    const { data: order, error: createError } = await sb
      .from('orders')
      .insert({
        store_id: data.storeId,
        customer_name: 'E2E Flicker Test',
        status: 'preparing',
        source: orderSource,
        total: 10,
        payment_method: 'cash',
      })
      .select('id')
      .single()

    if (createError || !order?.id) {
      throw new Error(`Falha ao criar pedido E2E: ${createError?.message}`)
    }

    const orderId = String(order.id)

    await page.route('**/api/orders/status', async (route) => {
      const request = route.request()
      if (request.method() !== 'POST') {
        await route.continue()
        return
      }
      let body: { orderId?: string; status?: string } = {}
      try {
        body = request.postDataJSON() as {
          orderId?: string
          status?: string
        }
      } catch {
        await route.continue()
        return
      }
      if (body?.orderId !== orderId || body?.status !== 'ready') {
        await route.continue()
        return
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    try {
      await page.goto('/dashboard/orders')
      const card = page.locator(`#order-card-${orderId}`)
      await expect(
        card,
        `Pedido E2E ${orderId} deve aparecer no kanban antes da acção`
      ).toBeVisible({ timeout: 30_000 })

      const readyButton = card.getByRole('button', { name: /^✓ Pronto$/i })
      await expect(
        readyButton,
        'Card em preparo deve expor acção "✓ Pronto"'
      ).toBeVisible()

      const statusResponse = page.waitForResponse(
        (res) =>
          res.url().includes('/api/orders/status') &&
          res.request().method() === 'POST',
        { timeout: delayMs + 15_000 }
      )
      await readyButton.click()

      await expect(
        card,
        'Imediatamente após marcar pronto, o card deve reflectir status ready (overlay optimista)'
      ).toHaveAttribute('data-status', 'ready', { timeout: 5_000 })

      const regressions: string[] = []
      const pollEnd = Date.now() + 10_000
      while (Date.now() < pollEnd) {
        const status = (await card.getAttribute('data-status'))?.toLowerCase() ?? ''
        if (status === 'preparing') {
          regressions.push(
            `UI regressou para data-status="preparing" com ${pollEnd - Date.now()}ms restantes no poll`
          )
        }
        await page.waitForTimeout(400)
      }

      expect(
        regressions,
        `Durante 10s com API atrasada ${delayMs}ms, o card não deve voltar a "preparing" após mostrar ready`
      ).toHaveLength(0)

      const apiRes = await statusResponse
      expect(
        apiRes.ok(),
        `A API /api/orders/status deve completar com 2xx após o delay artificial (${apiRes.status()})`
      ).toBeTruthy()

      await expect(
        card,
        'Após a API completar (~12s), o pedido deve permanecer em ready'
      ).toHaveAttribute('data-status', 'ready', { timeout: 5_000 })
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await sb.from('orders').delete().eq('id', orderId)
    }
  })
})
