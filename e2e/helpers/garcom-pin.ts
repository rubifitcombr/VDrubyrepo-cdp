import type { Page } from '@playwright/test'

export async function submitGarcomPin(page: Page, pin: string): Promise<void> {
  const modal = page.getByRole('dialog')
  await modal.waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('garcom-pin-input').fill(pin)
  await page.getByTestId('garcom-pin-submit').click()
  await page.getByTestId('garcom-table-map').waitFor({ state: 'visible', timeout: 30_000 })
}

export async function readGarcomSessionName(page: Page): Promise<string> {
  const badge = page.getByTestId('garcom-session-badge')
  await badge.waitFor({ state: 'visible', timeout: 15_000 })
  const text = await badge.innerText()
  const match = text.match(/Garçom:\s*(.+)/i)
  return (match?.[1] ?? text).trim()
}

export async function readGarcomMapSnapshot(page: Page): Promise<string> {
  const map = page.getByTestId('garcom-table-map')
  await map.waitFor({ state: 'visible', timeout: 30_000 })
  return map.innerText()
}
