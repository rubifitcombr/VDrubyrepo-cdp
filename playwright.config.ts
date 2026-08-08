import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '.env.local') })
dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true })

const port = process.env.PLAYWRIGHT_PORT || '3000'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`
const authFile = path.join(__dirname, 'e2e/.auth/user.json')

export default defineConfig({
  testDir: path.join(__dirname, 'e2e/sync'),
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    channel: 'chrome',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'sync',
      testMatch: /\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: authFile,
      },
    },
  ],
  webServer: {
    command: `npm run start -- -H 127.0.0.1 -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
