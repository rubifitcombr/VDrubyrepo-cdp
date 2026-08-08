#!/usr/bin/env node
/**
 * Cria ou atualiza a loja dedicada de E2E (slug e2e-test-store).
 * Nunca use loja de cliente real nos testes — ver e2e/README.md
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const E2E_SLUG = 'e2e-test-store'
const E2E_NAME = 'Vyria E2E Test Store'
const E2E_PRODUCT_NAME = 'E2E Produto Teste'
const DEFAULT_E2E_OWNER_EMAIL = 'vyria-e2e-automation@vyria.test'
const TABLE_NAMES = ['1', '2', '77', '88', '99']
const GARCOMS = [
  { nome: 'E2E Garçom A', pin: '1111' },
  { nome: 'E2E Garçom B', pin: '2222' },
]

function loadEnvFile(name) {
  const path = resolve(root, name)
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    out[k] = v
  }
  return out
}

function loadEnv() {
  const merged = { ...loadEnvFile('.env.local'), ...loadEnvFile('.env.test'), ...process.env }
  for (const [k, v] of Object.entries(merged)) {
    if (!process.env[k]) process.env[k] = v
  }
}

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios em .env.local')
  process.exit(1)
}

const sb = createClient(url, key)

async function ensureE2eOwnerUser() {
  const email = (process.env.E2E_OWNER_EMAIL || DEFAULT_E2E_OWNER_EMAIL).trim().toLowerCase()

  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`listUsers: ${error.message}`)

  const existing = (data?.users ?? []).find(
    (u) => String(u.email ?? '').toLowerCase() === email
  )
  if (existing?.id) {
    return { ownerId: existing.id, ownerEmail: email }
  }

  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: 'Vyria E2E Automation' },
  })
  if (createErr || !created.user?.id) {
    throw new Error(`createUser ${email}: ${createErr?.message ?? 'sem id'}`)
  }

  console.log(`✓ Conta Auth E2E criada: ${email}`)
  return { ownerId: created.user.id, ownerEmail: email }
}

async function resolveOwnerId() {
  return ensureE2eOwnerUser()
}

async function upsertStore(ownerId) {
  const { data: existing } = await sb
    .from('stores')
    .select('id, slug')
    .eq('slug', E2E_SLUG)
    .maybeSingle()

  const planoVence = new Date()
  planoVence.setUTCFullYear(planoVence.getUTCFullYear() + 2)
  const planoVenceEm = planoVence.toISOString().slice(0, 10)

  const payload = {
    name: E2E_NAME,
    slug: E2E_SLUG,
    owner_id: ownerId,
    status: 'ativo',
    plano: 'pro',
    plano_vence_em: planoVenceEm,
    billing_cycle: 'monthly',
    operation_mode: 'hibrido',
    salao_attendance_mode: 'waiter',
    hub_pin_balcao_enabled: true,
    hub_pin_balcao: '0000',
    auto_accept_orders: false,
    auto_notify_new_order: false,
    auto_close_outside_hours: false,
  }

  if (existing?.id) {
    const { error } = await sb.from('stores').update(payload).eq('id', existing.id)
    if (error) throw new Error(`update store: ${error.message}`)
    return String(existing.id)
  }

  const storeId = crypto.randomUUID()
  const { error } = await sb.from('stores').insert({ id: storeId, ...payload })
  if (error) throw new Error(`insert store: ${error.message}`)
  return storeId
}

async function seedTables(storeId) {
  const { data: rows } = await sb
    .from('store_tables')
    .select('id, name')
    .eq('store_id', storeId)

  const byName = new Map((rows ?? []).map((r) => [String(r.name), r]))
  for (let i = 0; i < TABLE_NAMES.length; i++) {
    const name = TABLE_NAMES[i]
    if (byName.has(name)) continue
    const { error } = await sb.from('store_tables').insert({
      store_id: storeId,
      name,
      nome: name,
      ambiente: 'Salão',
      active: true,
      ativo: true,
      sort_order: i + 1,
    })
    if (error) throw new Error(`insert table ${name}: ${error.message}`)
  }
}

async function seedGarcons(storeId) {
  for (const g of GARCOMS) {
    const { data: row } = await sb
      .from('store_garcons')
      .select('id')
      .eq('store_id', storeId)
      .eq('nome', g.nome)
      .maybeSingle()
    if (row?.id) {
      await sb
        .from('store_garcons')
        .update({ pin: g.pin, pin_ativo: true, ativo: true })
        .eq('id', row.id)
      continue
    }
    const { error } = await sb.from('store_garcons').insert({
      store_id: storeId,
      nome: g.nome,
      pin: g.pin,
      pin_ativo: true,
      ativo: true,
    })
    if (error) throw new Error(`insert garcom ${g.nome}: ${error.message}`)
  }
}

async function seedProduct(storeId) {
  const { data: row } = await sb
    .from('products')
    .select('id')
    .eq('store_id', storeId)
    .eq('name', E2E_PRODUCT_NAME)
    .maybeSingle()

  if (row?.id) {
    await sb
      .from('products')
      .update({ active: true, price: 10, dine_in_price: 10, delivery_price: 10 })
      .eq('id', row.id)
    return String(row.id)
  }

  const productId = crypto.randomUUID()
  const { error } = await sb.from('products').insert({
    id: productId,
    store_id: storeId,
    name: E2E_PRODUCT_NAME,
    category: 'E2E',
    price: 10,
    dine_in_price: 10,
    delivery_price: 10,
    active: true,
    sort_order: 1,
  })
  if (error) throw new Error(`insert product: ${error.message}`)
  return productId
}

async function seedReferralAccount(storeId) {
  const { data: row } = await sb
    .from('store_referral_accounts')
    .select('store_id')
    .eq('store_id', storeId)
    .maybeSingle()
  if (row) return
  const { error } = await sb.from('store_referral_accounts').insert({
    store_id: storeId,
    referral_code: 'E2ETEST01',
    points_balance: 0,
  })
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(`referral account: ${error.message}`)
  }
}

function writeEnvTest(storeId, ownerEmail) {
  const lines = [
    '# Gerado/atualizado por npm run e2e:provision — NÃO apontar para loja real.',
    `E2E_STORE_SLUG=${E2E_SLUG}`,
    `E2E_STORE_ID=${storeId}`,
    `E2E_OWNER_EMAIL=${ownerEmail}`,
    '',
    '# Nunca definir como true exceto em emergência auditada:',
    '# E2E_ALLOW_PRODUCTION_STORE=false',
    '',
  ]
  const outPath = resolve(root, '.env.test')
  writeFileSync(outPath, lines.join('\n'), 'utf8')
  console.log(`\n✅ Escrito ${outPath}`)
}

async function main() {
  const { ownerId, ownerEmail } = await resolveOwnerId()
  const storeId = await upsertStore(ownerId)
  await seedTables(storeId)
  await seedGarcons(storeId)
  const productId = await seedProduct(storeId)
  await seedReferralAccount(storeId)

  writeEnvTest(storeId, ownerEmail)

  console.log('\n=== Loja E2E provisionada ===')
  console.log(`slug:     ${E2E_SLUG}`)
  console.log(`store_id: ${storeId}`)
  console.log(`owner:    ${ownerEmail}`)
  console.log(`product:  ${productId}`)
  console.log(`mesas:    ${TABLE_NAMES.join(', ')}`)
  console.log(`garçons:  ${GARCOMS.map((g) => `${g.nome} (PIN ${g.pin})`).join(', ')}`)
  console.log(`hub PIN balcão: 0000`)
  console.log('\nPróximo passo: npm run test:concurrency -- e2e/concurrency/07-public-checkout-auto-accept.spec.ts')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
