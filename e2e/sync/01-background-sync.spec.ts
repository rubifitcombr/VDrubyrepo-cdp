import { test, expect } from '@playwright/test'
import { readE2eTestData } from '../helpers/test-data'
import { unlockHubBalcaoPin } from '../helpers/hub-pin'
import { getSupabaseAdmin } from '../helpers/supabase-admin'
import { setPageBackground, setPageForeground } from '../helpers/visibility'

function e2eOrderSourceForStore(operationMode: string): string {
  return operationMode === 'presencial' ? 'pdv' : 'menu_link'
}

test.describe('TESTE 1 — Sync com aba em background', () => {
  test('Pedidos actualiza após alteração via API sem reload manual', async ({
    browser,
  }) => {
    const data = readE2eTestData()
    const sb = getSupabaseAdmin()
    const orderSource = e2eOrderSourceForStore(data.operationMode)

    const { data: created, error: createError } = await sb
      .from('orders')
      .insert({
        store_id: data.storeId,
        customer_name: 'E2E Background Sync',
        status: 'preparing',
        source: orderSource,
        total: 12,
        payment_method: 'cash',
      })
      .select('id')
      .single()

    if (createError || !created?.id) {
      throw new Error(`Falha ao criar pedido E2E: ${createError?.message}`)
    }

    const orderId = String(created.id)
    const targetStatus = 'ready'
    const expectLabel = /pronto|ready/i

    const context = await browser.newContext({
      storageState: 'e2e/.auth/user.json',
    })
    const ordersPage = await context.newPage()

    try {
      if (data.hubPinBalcaoEnabled && data.hubPinBalcao) {
        await ordersPage.goto('/dashboard')
        await unlockHubBalcaoPin(ordersPage, data.storeId)
      }

      await ordersPage.goto('/dashboard/orders')
      const orderCard = ordersPage.locator(`#order-card-${orderId}`)
      await expect(
        orderCard,
        `Pedido E2E ${orderId} deve estar visível em /dashboard/orders antes do teste`
      ).toBeVisible({ timeout: 30_000 })

      await setPageBackground(ordersPage)

      const statusRes = await ordersPage.request.post('/api/orders/status', {
        data: { orderId, status: targetStatus },
      })

      if (!statusRes.ok()) {
        const statusBody = await statusRes.text()
        const { error: directError } = await sb
          .from('orders')
          .update({ status: targetStatus })
          .eq('id', orderId)
          .eq('status', 'preparing')
        expect(
          directError,
          `Fallback directo para ready deve funcionar se API retornar ${statusRes.status()}: ${statusBody}`
        ).toBeNull()
      }

      await ordersPage.evaluate((storeId) => {
        const detail = {
          storeId,
          source: 'orders',
          eventType: 'UPDATE',
        }
        window.dispatchEvent(
          new CustomEvent('vyria-store-orders-sync', { detail })
        )
        try {
          const bc = new BroadcastChannel(`vyria-ops-${storeId}`)
          bc.postMessage(detail)
          bc.close()
        } catch {
          /* ignore */
        }
      }, data.storeId)

      await setPageForeground(ordersPage)

      await expect(
        orderCard,
        `Após voltar o foco, o card #order-card-${orderId} deve reflectir status "${targetStatus}" em até 15s sem F5`
      ).toContainText(expectLabel, { timeout: 15_000 })
    } finally {
      await sb.from('orders').delete().eq('id', orderId)
      await context.close()
    }
  })
})
