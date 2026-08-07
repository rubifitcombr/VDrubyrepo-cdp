import { test, expect } from '@playwright/test'
import { readE2eTestData } from '../helpers/test-data'
import {
  readGarcomSessionName,
  submitGarcomPin,
} from '../helpers/garcom-pin'
import { E2E_STORE_ID } from '../fixtures/store'

function dispatchPinSync(page: import('@playwright/test').Page) {
  return page.evaluate((storeId) => {
    window.dispatchEvent(
      new CustomEvent('vyria-garcom-pin-session-sync', { detail: { storeId } })
    )
  }, E2E_STORE_ID)
}

test.describe('Grupo 2 — sync sessão PIN garçom', () => {
  test('troca de garçom noutra aba actualiza badge sem reload', async ({
    browser,
  }) => {
    const data = readE2eTestData()
    expect(data.garcoms.length).toBeGreaterThanOrEqual(2)
    const garcomX = data.garcoms[0]!
    const garcomY = data.garcoms[1]!

    const context = await browser.newContext({
      storageState: 'e2e/.auth/user.json',
    })
    const pageA = await context.newPage()
    const pageB = await context.newPage()

    await pageA.goto('/dashboard/garcom')
    await submitGarcomPin(pageA, garcomX.pin)
    const nameA1 = await readGarcomSessionName(pageA)

    await pageB.goto('/dashboard/garcom')
    await expect(pageB.getByTestId('garcom-session-badge')).toHaveText(
      new RegExp(garcomX.nome.split(' ')[0]!, 'i')
    )

    await Promise.all([
      pageB.evaluate(
        ({ storeId, garcomId, nome }) => {
          const key = `vyria-garcom-session:${storeId}`
          window.localStorage.setItem(
            key,
            JSON.stringify({
              garcomId,
              nome,
              expiresAt: Date.now() + 12 * 60 * 60 * 1000,
            })
          )
          window.dispatchEvent(
            new CustomEvent('vyria-garcom-pin-session-sync', {
              detail: { storeId },
            })
          )
        },
        { storeId: E2E_STORE_ID, garcomId: garcomY.id, nome: garcomY.nome }
      ),
      expect(pageA.getByTestId('garcom-session-badge')).toHaveText(
        new RegExp(garcomY.nome.split(' ')[0]!, 'i'),
        { timeout: 10_000 }
      ),
    ])

    const nameA2 = await readGarcomSessionName(pageA)
    expect(nameA2).not.toBe(nameA1)
    expect(nameA2.toLowerCase()).toContain(
      garcomY.nome.toLowerCase().split(' ')[0] ?? ''
    )

    await context.close()
  })

  test('limpar sessão noutra aba bloqueia salão sem reload', async ({
    browser,
  }) => {
    const data = readE2eTestData()
    const garcom = data.garcoms[0]!

    const context = await browser.newContext({
      storageState: 'e2e/.auth/user.json',
    })
    const pageA = await context.newPage()
    const pageB = await context.newPage()

    await pageA.goto('/dashboard/garcom')
    await submitGarcomPin(pageA, garcom.pin)
    await expect(pageA.getByTestId('garcom-table-map')).toBeVisible()

    await pageB.goto('/dashboard/garcom')
    await expect(pageB.getByTestId('garcom-table-map')).toBeVisible()

    await pageB.evaluate((storeId) => {
      window.localStorage.removeItem(`vyria-garcom-session:${storeId}`)
    }, E2E_STORE_ID)

    await Promise.all([
      dispatchPinSync(pageB),
      expect(pageA.getByRole('dialog')).toBeVisible({ timeout: 10_000 }),
    ])

    await expect(pageA.getByTestId('garcom-session-badge')).toHaveCount(0)
    await expect(pageA.getByTestId('garcom-table-map')).toHaveCount(0)

    await context.close()
  })
})
