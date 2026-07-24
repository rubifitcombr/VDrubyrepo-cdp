import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

export const EXPORT_DIR = resolve(process.cwd(), '.migration-export')

export function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i <= 0) continue
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

export function readProjectConfig(which) {
  loadEnvLocal()
  const isNew = which === 'new'
  const url = isNew
    ? process.env.SUPABASE_NEW_URL?.trim()
    : process.env.SUPABASE_OLD_URL?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey = isNew
    ? process.env.SUPABASE_NEW_SERVICE_ROLE_KEY?.trim()
    : process.env.SUPABASE_OLD_SERVICE_ROLE_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const anonKey = isNew
    ? process.env.SUPABASE_NEW_ANON_KEY?.trim()
    : process.env.SUPABASE_OLD_ANON_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  return { url, serviceKey, anonKey, label: isNew ? 'NOVO' : 'ANTIGO' }
}

export function createSvc(url, serviceKey) {
  if (!url || !serviceKey) {
    throw new Error('URL e SERVICE_ROLE_KEY são obrigatórios.')
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function ensureExportDir() {
  mkdirSync(EXPORT_DIR, { recursive: true })
}

export function saveJson(name, data) {
  ensureExportDir()
  const file = join(EXPORT_DIR, `${name}.json`)
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  return file
}

export function readJson(name) {
  const file = join(EXPORT_DIR, `${name}.json`)
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** Ordem respeitando FKs típicas do Vyria. */
export const TABLE_EXPORT_ORDER = [
  'usuarios',
  'stores',
  'categories',
  'products',
  'addon_groups',
  'addon_items',
  'store_promotions',
  'store_product_stock',
  'store_tables',
  'store_garcons',
  'store_entregadores',
  'suppliers',
  'store_fiscal_config',
  'orders',
  'order_items',
  'order_payments',
  'entregas',
  'caixas_turnos',
  'caixa_movimentacoes',
  'financial_entries',
  'faturas',
  'fiscal_invoices',
  'contrato_aceites',
  'admin_logs',
  'admin_notifications',
  'store_push_subscriptions',
]

export const STORAGE_BUCKETS = [
  'product-images',
  'contratos',
  'fiscal-invoices',
]

export async function fetchAllRows(svc, table, { pageSize = 500, timeoutMs = 90_000 } = {}) {
  const rows = []
  let from = 0
  while (true) {
    const query = svc.from(table).select('*').range(from, from + pageSize - 1)
    const result = await Promise.race([
      query,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout ${table}`)), timeoutMs)
      ),
    ])
    const { data, error } = result
    if (error) throw new Error(`${table}: ${error.message}`)
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return rows
}

export async function upsertBatches(svc, table, rows, { batchSize = 200 } = {}) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)
    const { error } = await svc.from(table).upsert(chunk, { onConflict: 'id' })
    if (error) throw new Error(`${table} upsert: ${error.message}`)
    inserted += chunk.length
  }
  return inserted
}

export function buildCombinedMigrationsSql() {
  const dir = resolve(process.cwd(), 'supabase/migrations')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  return files
    .map((f) => `-- ===== ${f} =====\n${readFileSync(join(dir, f), 'utf8')}`)
    .join('\n\n')
}
