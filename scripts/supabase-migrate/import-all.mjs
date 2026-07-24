#!/usr/bin/env node
/**
 * Importa .migration-export/*.json para o projeto NOVO.
 * Pré-requisito: schema aplicado (migrações) no projeto novo.
 *
 * Uso: node scripts/supabase-migrate/import-all.mjs
 */
import {
  TABLE_EXPORT_ORDER,
  createSvc,
  readJson,
  readProjectConfig,
  upsertBatches,
} from './lib.mjs'

function applyOwnerMap(stores) {
  const map = readJson('owner-map')
  if (!map || typeof map !== 'object') return stores
  return stores.map((row) => {
    if (!row || typeof row !== 'object') return row
    const ownerId = row.owner_id
    if (ownerId && map[ownerId]) {
      return { ...row, owner_id: map[ownerId] }
    }
    return row
  })
}

const cfg = readProjectConfig('new')
if (!cfg.url || !cfg.serviceKey) {
  console.error(
    'Define SUPABASE_NEW_URL e SUPABASE_NEW_SERVICE_ROLE_KEY no .env.local'
  )
  process.exit(1)
}

console.log(`\n=== Import ${cfg.label}: ${cfg.url} ===\n`)
const svc = createSvc(cfg.url, cfg.serviceKey)

// 1) Auth — só se exportou auth_users e NÃO usou pg_dump de passwords
const authUsers = readJson('auth_users')
if (Array.isArray(authUsers) && authUsers.length > 0) {
  console.log('--- auth.users (Admin API — passwords novas ou reset) ---')
  console.log(
    '○ AVISO: para manter passwords, importe auth via pg_dump-auth.sql em vez deste passo.\n'
  )
  let created = 0
  let skipped = 0
  for (const u of authUsers) {
    const email = u.email?.trim()
    if (!email) {
      skipped += 1
      continue
    }
    const tempPassword = `Vyria-Mig-${crypto.randomUUID().slice(0, 12)}!`
    const { error } = await svc.auth.admin.createUser({
      id: u.id,
      email,
      email_confirm: true,
      user_metadata: u.user_metadata ?? {},
      app_metadata: u.app_metadata ?? {},
      password: tempPassword,
    })
    if (error) {
      if (/already|exists|duplicate/i.test(error.message)) {
        skipped += 1
      } else {
        console.log(`✗ ${email}: ${error.message}`)
      }
    } else {
      created += 1
    }
  }
  console.log(`✓ auth criados: ${created}, ignorados/duplicados: ${skipped}`)
  console.log('  → Envia "recuperar senha" aos lojistas ou reimporte via pg_dump.\n')
}

for (const table of TABLE_EXPORT_ORDER) {
  let rows = readJson(table)
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log(`○ ${table}: sem ficheiro ou vazio — ignorado`)
    continue
  }
  if (table === 'stores') {
    rows = applyOwnerMap(rows)
  }
  process.stdout.write(`${table} (${rows.length})... `)
  try {
    const n = await upsertBatches(svc, table, rows)
    console.log(`✓ ${n}`)
  } catch (e) {
    console.log(`✗ ${e.message}`)
    process.exitCode = 1
  }
}

console.log('\nImport concluído. Valida com: node scripts/supabase-schema-audit.mjs')
