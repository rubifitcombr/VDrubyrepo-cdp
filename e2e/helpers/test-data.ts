import { readFileSync } from 'fs'
import path from 'path'
import type { E2eTestData } from '../fixtures/store'

export function readE2eTestData(): E2eTestData {
  const raw = readFileSync(
    path.join(process.cwd(), 'e2e/.auth/test-data.json'),
    'utf8'
  )
  return JSON.parse(raw) as E2eTestData
}
