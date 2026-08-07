import { test, expect } from '@playwright/test'
import { DASHBOARD_CLIENT_VERSION } from '../../lib/dashboard-client-version'

test.describe('TESTE 2 — Versão do cliente', () => {
  test('Reload automático restaura versão após localStorage corrompido', async ({
    page,
  }) => {
    await page.goto('/dashboard/orders')
    const footer = page.getByTestId('dashboard-client-version-footer')
    await expect(
      footer,
      'Rodapé do dashboard deve expor a versão activa do cliente'
    ).toContainText(DASHBOARD_CLIENT_VERSION, { timeout: 30_000 })

    const versionKey = await page.evaluate(async () => {
      const buildRes = await fetch('/api/health/build', { cache: 'no-store' })
      const build = (await buildRes.json()) as {
        dashboardClientVersion?: string
        buildId?: string
      }
      return `${build.dashboardClientVersion ?? ''}:${build.buildId ?? ''}`
    })

    await page.evaluate(() => {
      window.localStorage.setItem('vyria-dashboard-client-version', 'stale:fake-build')
    })

    await page.reload({ waitUntil: 'domcontentloaded' })

    await page.waitForFunction(
      (expected) =>
        window.localStorage.getItem('vyria-dashboard-client-version') === expected,
      versionKey,
      { timeout: 60_000 }
    )

    await expect(
      footer,
      `Após reload automático, o rodapé deve voltar a mostrar ${DASHBOARD_CLIENT_VERSION}`
    ).toContainText(DASHBOARD_CLIENT_VERSION, { timeout: 30_000 })

    const stored = await page.evaluate(() =>
      window.localStorage.getItem('vyria-dashboard-client-version')
    )
    expect(
      stored,
      `localStorage deve guardar a chave de versão actual (${versionKey}), não o valor stale`
    ).toBe(versionKey)
  })
})
