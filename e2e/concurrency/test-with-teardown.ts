import { test as base, expect } from '@playwright/test'
import { runConcurrencyTeardown } from './teardown'

export const test = base

test.afterEach(async () => {
  await runConcurrencyTeardown()
})

export { expect }
