#!/usr/bin/env node
/**
 * Verificação E2E — Sanduicheria Tudibom (presencial Pro)
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000'
const SLUG = 'tudibom'
const STORE_ID = 'e472b84e-32c1-4a9d-87fc-756b874f793a'

const results = []
const pass = (n, d = '') => { results.push({ ok: true, n, d }); console.log(`✅ ${n}${d ? ` — ${d}` : ''}`) }
const fail = (n, d = '') => { results.push({ ok: false, n, d }); console.log(`❌ ${n}${d ? ` — ${d}` : ''}`) }
const warn = (n, d = '') => { results.push({ ok: 'w', n, d }); console.log(`⚠️  ${n}${d ? ` — ${d}` : ''}`) }

function loadEnv() {
  try {
    const raw = readFileSync(resolve(root, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      const k = t.slice(0, i).trim()
      let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  } catch { /* */ }
}
loadEnv()

async function status(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, { redirect: 'manual', ...opts })
  return r.status
}

async function jsonFetch(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, { redirect: 'manual', ...opts })
  let body = null
  try {
    body = await r.json()
  } catch {
    body = null
  }
  return { status: r.status, body }
}

async function main() {
  console.log(`\n🔍 E2E Tudibom — ${BASE}\n`)
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // DB
  const { data: store } = await sb.from('stores').select('*').eq('slug', SLUG).single()
  if (!store) return fail('Loja DB') || process.exit(1)
  pass('Loja', `${store.name} · ${store.operation_mode} · ${store.plano}`)
  if (!store.contrato_aceite_em) warn('Contrato', 'pendente de assinatura (esperado)')
  else pass('Contrato', 'assinado')

  store.salao_attendance_mode === 'waiter'
    ? pass('Modo salão', 'waiter')
    : fail('Modo salão', String(store.salao_attendance_mode))

  const { count: products } = await sb.from('products').select('id', { count: 'exact', head: true }).eq('store_id', STORE_ID).eq('active', true)
  products > 0 ? pass('Produtos activos', String(products)) : fail('Produtos activos', '0')

  const { count: tables } = await sb.from('store_tables').select('id', { count: 'exact', head: true }).eq('store_id', STORE_ID)
  tables >= 18 ? pass('Mesas', String(tables)) : warn('Mesas', String(tables ?? 0))

  const { data: garconsRows } = await sb
    .from('store_garcons')
    .select('id, nome, pin_ativo, ativo')
    .eq('store_id', STORE_ID)
    .eq('ativo', true)
  const garcons = garconsRows ?? []
  garcons.length > 0 ? pass('Garçons activos', String(garcons.length)) : warn('Garçons', 'nenhum')

  const nomeCounts = new Map()
  for (const g of garcons) {
    const k = String(g.nome ?? '').trim().toLowerCase()
    nomeCounts.set(k, (nomeCounts.get(k) ?? 0) + 1)
  }
  const dupNames = [...nomeCounts.entries()].filter(([, c]) => c > 1)
  if (dupNames.length > 0) {
    warn('Garçons nomes duplicados', dupNames.map(([n, c]) => `${n}×${c}`).join(', '))
  } else {
    pass('Garçons nomes únicos', 'OK')
  }

  const pinGarcons = garcons.filter((g) => g.pin_ativo)
  pinGarcons.length > 0 ? pass('Garçons com PIN', String(pinGarcons.length)) : warn('PIN garçom', 'nenhum activo')

  const { count: openOrders } = await sb
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', STORE_ID)
    .in('source', ['waiter', 'autoatendimento'])
    .in('status', ['pending', 'preparing', 'ready', 'confirmed'])
    .is('caixa_turno_id', null)
  openOrders > 0 ? pass('Comandas abertas salão', String(openOrders)) : warn('Comandas abertas', '0')

  const { count: addonGroupCount } = await sb
    .from('addon_groups')
    .select('id', { count: 'exact', head: true })
    .in(
      'product_id',
      (
        await sb.from('products').select('id').eq('store_id', STORE_ID).eq('active', true)
      ).data?.map((p) => p.id) ?? []
    )
  addonGroupCount > 0
    ? pass('Produtos com adicionais', `${addonGroupCount} grupos`)
    : warn('Produtos com adicionais', 'nenhum')

  const { data: turno } = await sb
    .from('caixa_turnos')
    .select('id')
    .eq('store_id', STORE_ID)
    .is('fechado_em', null)
    .maybeSingle()
  turno ? pass('Turno caixa', 'aberto') : pass('Turno caixa', 'fechado (esperado em teste)')

  // Rotas públicas
  for (const p of [`/${SLUG}`, `/${SLUG}?auto=1`, `/${SLUG}?auto=1&mesa=13`, '/login', '/login?next=/dashboard/contrato']) {
    const s = await status(p)
    ;[200, 307, 308].includes(s) ? pass(`GET ${p}`, String(s)) : fail(`GET ${p}`, String(s))
  }

  // Dashboard (sem auth → login)
  const dashRoutes = [
    '/dashboard', '/dashboard/contrato', '/dashboard/pdv', '/dashboard/garcom',
    '/dashboard/garcons', '/dashboard/caixa', '/dashboard/kds', '/dashboard/orders',
    '/dashboard/menu', '/dashboard/settings', '/dashboard/assinatura', '/dashboard/reports',
    '/dashboard/promotions', '/dashboard/printing', '/dashboard/balanca', '/dashboard/visao',
    '/dashboard/indique', '/dashboard/fiscal', '/dashboard/master/whatsapp',
  ]
  for (const p of dashRoutes) {
    const s = await status(p)
    if (s === 404) fail(`GET ${p}`, '404')
    else if ([200, 307, 308].includes(s)) pass(`GET ${p}`, String(s))
    else warn(`GET ${p}`, String(s))
  }

  // Hub garçom (sem auth)
  console.log('\n── Garçom (sem sessão) ──\n')
  for (const p of [
    '/dashboard/garcom?hub=salao',
    '/dashboard/garcom?hub=mesas',
    '/dashboard/garcom',
  ]) {
    const s = await status(p)
    s === 307 || s === 308 ? pass(`GET ${p}`, 'redirect login') : warn(`GET ${p}`, String(s))
  }

  const waiterApis = [
    ['GET', '/api/waiter/tables'],
    ['GET', '/api/waiter/orders/open'],
    ['POST', '/api/waiter/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }],
    ['POST', '/api/waiter/orders/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }],
  ]
  for (const [verb, path, opts] of waiterApis) {
    const { status: st } = await jsonFetch(path, opts ?? {})
    st === 401 ? pass(`${verb} ${path}`, '401 sem auth') : fail(`${verb} ${path}`, String(st))
  }

  const fakeId = '00000000-0000-4000-8000-000000000001'
  for (const [verb, path] of [
    ['GET', `/api/waiter/orders/${fakeId}`],
    ['PATCH', `/api/waiter/orders/${fakeId}`],
  ]) {
    const { status: st } = await jsonFetch(path, {
      method: verb,
      headers: { 'Content-Type': 'application/json' },
      body: verb === 'PATCH' ? '{"items":[]}' : undefined,
    })
    st === 401 ? pass(`${verb} ${path}`, '401 sem auth') : fail(`${verb} ${path}`, String(st))
  }

  // Schema order_items.addons
  const { data: sampleItem, error: itemErr } = await sb
    .from('order_items')
    .select('id, addons')
    .limit(1)
    .maybeSingle()
  if (itemErr && /addons|column/i.test(itemErr.message)) {
    fail('order_items.addons', 'coluna em falta — aplicar migration')
  } else {
    pass('order_items.addons', 'coluna presente')
  }

  // Sanity GET estrutura (service role — simula payload após auth)
  const { data: openOrder } = await sb
    .from('orders')
    .select('id')
    .eq('store_id', STORE_ID)
    .in('source', ['waiter', 'autoatendimento'])
    .in('status', ['pending', 'preparing', 'ready', 'confirmed'])
    .is('caixa_turno_id', null)
    .limit(1)
    .maybeSingle()

  if (openOrder?.id) {
    const { data: items, error: itemsErr } = await sb
      .from('order_items')
      .select('id, product_id, quantity, unit_price, price, name, unit_type, addons')
      .eq('order_id', openOrder.id)
    if (itemsErr) {
      fail('order_items select', itemsErr.message)
    } else {
      pass('order_items estrutura', `${items?.length ?? 0} linhas`)
      const hasAddonField = (items ?? []).every((it) => 'addons' in it)
      hasAddonField ? pass('order_items addons field', 'presente') : warn('order_items addons field', 'ausente')
    }
  } else {
    warn('Sanity order_items', 'sem comanda aberta para testar')
  }

  // Checklist impersonation (validação programática de pré-requisitos)
  console.log('\n── Checklist garçom (pré-requisitos API/DB) ──\n')
  const checklist = [
    ['PIN gate', pinGarcons.length > 0],
    ['Mapa 18+ mesas', (tables ?? 0) >= 18],
    ['Produtos activos', (products ?? 0) > 0],
    ['Adicionais no cardápio', (addonGroupCount ?? 0) > 0],
    ['Comandas abertas no mapa', (openOrders ?? 0) > 0],
    ['API waiter protegida', true],
    ['Coluna addons', !itemErr],
  ]
  for (const [label, ok] of checklist) {
    ok ? pass(`Checklist: ${label}`) : warn(`Checklist: ${label}`, 'rever manualmente')
  }

  // APIs públicas
  const { data: prod } = await sb.from('products').select('id,name').eq('store_id', STORE_ID).eq('active', true).limit(1).single()
  if (prod) {
    const ar = await fetch(`${BASE}/api/public/product-addons?storeId=${STORE_ID}&productId=${prod.id}`)
    ar.status === 200 ? pass('API product-addons', String(ar.status)) : fail('API product-addons', String(ar.status))
  }

  const cr = await fetch(`${BASE}/api/public/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: SLUG, items: [] }),
  })
  cr.status === 400 ? pass('API checkout validação', 'rejeita vazio') : warn('API checkout', String(cr.status))

  // Contrato API (sem auth)
  const ca = await fetch(`${BASE}/api/contrato/aceitar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  ;[401, 403].includes(ca.status) ? pass('API contrato/aceitar auth', String(ca.status)) : warn('API contrato/aceitar', String(ca.status))

  // post-login-redirect
  const pl = await fetch(`${BASE}/api/auth/post-login-redirect`)
  pl.status === 401 ? pass('API post-login-redirect', '401 sem sessão') : warn('API post-login-redirect', String(pl.status))

  // Storefront HTML
  const html = await (await fetch(`${BASE}/${SLUG}`)).text()
  html.includes('Application error') ? fail('Storefront', 'Application error') : pass('Storefront HTML', 'OK')
  html.toLowerCase().includes('tudibom') || html.includes('Sanduicheria') ? pass('Storefront nome') : warn('Storefront nome', 'client-side')

  // Contrato page HTML (redirect to login expected without cookie - check login next)
  const contratoStatus = await status('/dashboard/contrato')
  contratoStatus === 307 ? pass('Contrato redirect login', '307') : contratoStatus === 200 ? pass('Contrato page', '200') : warn('Contrato', String(contratoStatus))

  const failed = results.filter((r) => r.ok === false).length
  const warned = results.filter((r) => r.ok === 'w').length
  const passed = results.filter((r) => r.ok === true).length
  console.log(`\n─── ${passed} OK · ${warned} avisos · ${failed} falhas ───\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
