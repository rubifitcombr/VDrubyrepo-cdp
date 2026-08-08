import { existsSync, readFileSync } from 'fs'
import path from 'path'

/** Slugs de lojas reais — nunca rodar E2E aqui sem override explícito. */
export const BLOCKED_E2E_STORE_SLUGS = new Set([
  'tudibom',
  'secret-garden',
  'arcano',
  'donna-cereja',
  'zero62',
])

export type E2eStoreConfig = {
  storeId: string
  slug: string
}

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!existsSync(filePath)) return out
  const raw = readFileSync(filePath, 'utf8')
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

let envLoaded = false

/** Carrega `.env.local` (credenciais Supabase) + `.env.test` (loja E2E). */
export function loadE2eEnvFiles(): void {
  if (envLoaded) return
  const root = process.cwd()
  const merged = {
    ...parseEnvFile(path.join(root, '.env.local')),
    ...parseEnvFile(path.join(root, '.env.test')),
  }
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
  envLoaded = true
}

export function assertSafeE2eStoreSlug(slug: string): void {
  const normalized = slug.trim().toLowerCase()
  if (process.env.E2E_ALLOW_PRODUCTION_STORE === 'true') return
  if (BLOCKED_E2E_STORE_SLUGS.has(normalized)) {
    throw new Error(
      `Refusing to run E2E against production store slug "${slug}". ` +
        `Use E2E_STORE_SLUG=e2e-test-store in .env.test (run: npm run e2e:provision). ` +
        `Override only with E2E_ALLOW_PRODUCTION_STORE=true (not recommended).`
    )
  }
  if (normalized !== 'e2e-test-store') {
    throw new Error(
      `E2E_STORE_SLUG must be "e2e-test-store" (got "${slug}"). ` +
        `Run npm run e2e:provision to create the dedicated test store.`
    )
  }
}

export function getE2eStoreConfig(): E2eStoreConfig {
  loadE2eEnvFiles()
  const slug = String(process.env.E2E_STORE_SLUG ?? '').trim()
  const storeId = String(process.env.E2E_STORE_ID ?? '').trim()
  if (!slug || !storeId) {
    throw new Error(
      'E2E_STORE_SLUG and E2E_STORE_ID are required. ' +
        'Copy .env.test.example to .env.test and run: npm run e2e:provision'
    )
  }
  assertSafeE2eStoreSlug(slug)
  return { slug, storeId }
}
