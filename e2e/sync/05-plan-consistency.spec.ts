import { test, expect } from '@playwright/test'
import { readE2eTestData } from '../helpers/test-data'

test.describe('TESTE 5 — Plano consistente dashboard vs público', () => {
  test('Autoatendimento público alinha com plano efectivo da loja', async ({
    page,
    context,
  }) => {
    const data = readE2eTestData()

    await page.goto('/dashboard/garcom')
    const garcomLoaded = await page
      .getByTestId('garcom-table-map')
      .isVisible({ timeout: 15_000 })
      .catch(() => false)
    const pinGate = await page
      .getByTestId('garcom-pin-input')
      .isVisible({ timeout: 3_000 })
      .catch(() => false)

    const dashboardHasGarcom =
      garcomLoaded || pinGate || /\/dashboard\/garcom/.test(page.url())

    expect(
      dashboardHasGarcom,
      `Loja plano "${data.plano}" deve permitir aceder ao módulo Garçom no dashboard`
    ).toBeTruthy()

    const publicPage = await context.newPage()
    await publicPage.goto(`/${data.slug}?auto=1`)

    if (data.publicDineInAllowed) {
      await expect(
        publicPage.getByText(/autoatendimento|pedido na mesa/i).first(),
        'Com publicDineInCheckoutAllowed=true, o cardápio ?auto=1 deve mostrar autoatendimento'
      ).toBeVisible({ timeout: 30_000 })
      await expect(
        publicPage.getByText(/autoatendimento indisponível/i),
        'Não deve mostrar banner de indisponível quando o plano permite QR/autoatendimento'
      ).toHaveCount(0)
    } else {
      await expect(
        publicPage.getByText(/autoatendimento indisponível/i),
        'Com publicDineInCheckoutAllowed=false, ?auto=1 deve indicar indisponibilidade'
      ).toBeVisible({ timeout: 30_000 })
    }

    await publicPage.close()
  })
})
