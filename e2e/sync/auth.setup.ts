import { test as setup, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { loadE2eTestData } from '../helpers/supabase-admin'
import { loginOwnerViaMagicLink } from '../helpers/auth'

const authFile = path.join(process.cwd(), 'e2e/.auth/user.json')
const testDataFile = path.join(process.cwd(), 'e2e/.auth/test-data.json')

setup('autenticar lojista E2E via magic link', async ({ page, baseURL }) => {
  mkdirSync(path.dirname(authFile), { recursive: true })

  const testData = await loadE2eTestData()
  writeFileSync(testDataFile, JSON.stringify(testData, null, 2), 'utf8')

  await loginOwnerViaMagicLink(page, testData.ownerEmail, baseURL!)

  await expect(
    page,
    'Após login, o browser deve estar no dashboard autenticado'
  ).toHaveURL(/\/dashboard/, { timeout: 30_000 })

  await page.context().storageState({ path: authFile })
})
