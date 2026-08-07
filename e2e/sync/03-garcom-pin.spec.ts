import { test, expect } from '@playwright/test'
import { readE2eTestData } from '../helpers/test-data'
import {
  readGarcomMapSnapshot,
  readGarcomSessionName,
  submitGarcomPin,
} from '../helpers/garcom-pin'

test.describe('TESTE 3 — PIN garçom entre abas', () => {
  test('Sessão PIN partilhada entre páginas e mapa idêntico', async ({
    browser,
  }) => {
    const data = readE2eTestData()
    expect(
      data.garcoms.length,
      'A loja de teste precisa de pelo menos 2 garçons com PIN activo'
    ).toBeGreaterThanOrEqual(2)

    const garcomX = data.garcoms[0]!
    const garcomY = data.garcoms[1]!

    const context = await browser.newContext({
      storageState: 'e2e/.auth/user.json',
    })
    const pageA = await context.newPage()
    const pageB = await context.newPage()

    await pageA.goto('/dashboard/garcom')
    await submitGarcomPin(pageA, garcomX.pin)
    const nameA = await readGarcomSessionName(pageA)
    expect(
      nameA.toLowerCase(),
      `Página A deve mostrar o garçom ${garcomX.nome} após PIN`
    ).toContain(garcomX.nome.toLowerCase().split(' ')[0] ?? garcomX.nome.toLowerCase())

    await pageB.goto('/dashboard/garcom')
    await pageB.reload()
    const nameB1 = await readGarcomSessionName(pageB)
    expect(
      nameB1,
      'Página B deve reconhecer a sessão PIN da página A sem pedir PIN novamente'
    ).toBe(nameA)

    const mapA1 = await readGarcomMapSnapshot(pageA)
    const mapB1 = await readGarcomMapSnapshot(pageB)
    expect(
      mapB1,
      'Mapa de mesas deve ser idêntico nas duas páginas com a mesma sessão PIN'
    ).toBe(mapA1)

    await pageA.getByRole('button', { name: /trocar pin/i }).click()
    await pageA.waitForURL('**/dashboard/garcom**', { timeout: 15_000 })
    await submitGarcomPin(pageA, garcomY.pin)
    const nameA2 = await readGarcomSessionName(pageA)
    expect(
      nameA2.toLowerCase(),
      `Após trocar PIN, página A deve mostrar ${garcomY.nome}`
    ).toContain(garcomY.nome.toLowerCase().split(' ')[0] ?? garcomY.nome.toLowerCase())

    await pageB.reload()
    const nameB2 = await readGarcomSessionName(pageB)
    expect(
      nameB2,
      'Página B deve reflectir a troca de garçom após reload'
    ).toBe(nameA2)

    const mapA2 = await readGarcomMapSnapshot(pageA)
    const mapB2 = await readGarcomMapSnapshot(pageB)
    expect(mapB2, 'Mapa deve permanecer sincronizado após troca de PIN').toBe(mapA2)

    await context.close()
  })
})
