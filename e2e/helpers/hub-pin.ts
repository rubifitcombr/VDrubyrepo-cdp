import type { Page } from '@playwright/test'

export function hubPinUnlockStorageKey(
  storeId: string,
  shortcut: 'balcao' | 'cozinha' | 'administracao'
): string {
  return `vyria-hub-pin:${storeId}:${shortcut}`
}

/** Desbloqueia atalho Balcão (Caixa/PDV) sem UI — espelha `rememberHubPinUnlock`. */
export async function unlockHubBalcaoPin(
  page: Page,
  storeId: string
): Promise<void> {
  const key = hubPinUnlockStorageKey(storeId, 'balcao')
  await page.evaluate((storageKey) => {
    window.sessionStorage.setItem(storageKey, 'ok')
  }, key)
}
