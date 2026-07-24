#!/usr/bin/env node
/**
 * Exporta tabelas public.* do projeto ANTIGO para .migration-export/
 * Uso: node scripts/supabase-migrate/export-all.mjs
 */
import {
  TABLE_EXPORT_ORDER,
  createSvc,
  fetchAllRows,
  readProjectConfig,
  saveJson,
  ensureExportDir,
} from './lib.mjs'

const cfg = readProjectConfig('old')
if (!cfg.url || !cfg.serviceKey) {
  console.error('Define NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_OLD_*)')
  process.exit(1)
}

console.log(`\n=== Export ${cfg.label}: ${cfg.url} ===\n`)
ensureExportDir()
const svc = createSvc(cfg.url, cfg.serviceKey)

const summary = []

// Auth users (API — não traz password hash; use pg_dump-auth.sh para login preservado)
console.log('--- auth.users (Admin API) ---')
try {
  const users = []
  let page = 1
  while (true) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const batch = data?.users ?? []
    users.push(...batch)
    if (batch.length < 200) break
    page += 1
  }
  saveJson('auth_users', users)
  console.log(`✓ auth_users: ${users.length} utilizadores`)
  summary.push({ table: 'auth_users', ok: true, count: users.length })
} catch (e) {
  console.log(`✗ auth_users: ${e.message}`)
  summary.push({ table: 'auth_users', ok: false, error: e.message })
}

for (const table of TABLE_EXPORT_ORDER) {
  process.stdout.write(`${table}... `)
  try {
    const rows = await fetchAllRows(svc, table)
    saveJson(table, rows)
    console.log(`✓ ${rows.length}`)
    summary.push({ table, ok: true, count: rows.length })
  } catch (e) {
    console.log(`✗ ${e.message}`)
    summary.push({ table, ok: false, error: e.message })
  }
}

saveJson('_export_summary', summary)
const okCount = summary.filter((s) => s.ok).length
console.log(`\nConcluído: ${okCount}/${summary.length} blocos exportados → .migration-export/`)
if (summary.some((s) => !s.ok)) {
  console.log('\nSe REST falhar, use pg_dump (scripts/supabase-migrate/pgdump-all.sh).')
  process.exit(1)
}
