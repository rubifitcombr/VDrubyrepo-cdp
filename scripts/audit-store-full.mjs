#!/usr/bin/env node
/**
 * Auditoria ponta a ponta por loja (DB + HTTP).
 *
 * Uso:
 *   node scripts/audit-store-full.mjs --slug=arcano
 *   node scripts/audit-store-full.mjs --all
 *   TEST_BASE_URL=https://www.acesseseusistemavyria.online node scripts/audit-store-full.mjs --all
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000'

const OPEN_SALON_STATUSES = ['pending', 'preparing', 'ready', 'confirmed']
const SALON_SOURCES = ['waiter', 'autoatendimento']

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
  } catch {
    /* */
  }
}
loadEnv()

function parseArgs() {
  const args = process.argv.slice(2)
  let slug = null
  let all = false
  let exclude = new Set()
  for (const a of args) {
    if (a === '--all') all = true
    else if (a.startsWith('--slug=')) slug = a.slice(7).trim()
    else if (a.startsWith('--exclude=')) {
      for (const s of a.slice(10).split(',')) exclude.add(s.trim())
    }
  }
  return { slug, all, exclude }
}

function paymentRegistered(notes) {
  const text = String(notes ?? '')
  return (
    /\[Caixa\] Fechado em /i.test(text) ||
    /\[PDV\] Recebido em /i.test(text) ||
    /\[Garçom\] Recebido em /i.test(text)
  )
}

function parseTableFromNotes(notes) {
  const m = String(notes ?? '').match(/\[Mesa\]\s*([^\n\[]+)/i)
  return m?.[1]?.trim() || null
}

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

function mkAudit(slug, name) {
  const findings = []
  const pass = (id, detail = '') => findings.push({ level: 'ok', id, detail })
  const warn = (id, detail = '') => findings.push({ level: 'warn', id, detail })
  const fail = (id, detail = '') => findings.push({ level: 'fail', id, detail })
  const info = (id, detail = '') => findings.push({ level: 'info', id, detail })
  return { slug, name, findings, pass, warn, fail, info }
}

async function auditStore(sb, store) {
  const audit = mkAudit(store.slug, store.name)
  const { pass, warn, fail, info } = audit
  const storeId = store.id
  const slug = store.slug
  const mode = String(store.operation_mode ?? '').toLowerCase()
  const salao = store.salao_attendance_mode
  const plan = String(store.plano ?? '').toLowerCase()

  info(
    'perfil',
    `${plan} · ${mode || '—'} · salão=${salao || '—'} · contrato=${store.contrato_aceite_em ? 'sim' : 'não'}`
  )

  // Owner email
  if (store.owner_id) {
    const { data: owner } = await sb.auth.admin.getUserById(store.owner_id)
    if (owner?.user?.email) info('titular', owner.user.email)
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { count: productsActive } = await sb
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('active', true)
  const { count: productsInactive } = await sb
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('active', false)

  productsActive > 0
    ? pass('produtos-activos', String(productsActive))
    : fail('produtos-activos', '0 produtos activos')

  if ((productsInactive ?? 0) > 0) {
    info('produtos-inactivos', String(productsInactive))
  }

  const { count: tables } = await sb
    .from('store_tables')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)

  const isSalon =
    mode === 'presencial' ||
    mode === 'hibrido' ||
    salao === 'waiter' ||
    salao === 'self_service'

  if (isSalon || salao === 'waiter') {
    ;(tables ?? 0) >= 1
      ? pass('mesas-configuradas', String(tables))
      : warn('mesas-configuradas', '0 mesas — mapa salão vazio')
  } else {
    info('mesas-configuradas', String(tables ?? 0))
  }

  const { data: garcons } = await sb
    .from('store_garcons')
    .select('id, nome, pin_ativo, ativo, telefone')
    .eq('store_id', storeId)
    .eq('ativo', true)

  const garconsList = garcons ?? []
  if (salao === 'waiter' || (isSalon && plan === 'pro' && mode !== 'delivery')) {
    garconsList.length > 0
      ? pass('garcons-activos', String(garconsList.length))
      : warn('garcons-activos', 'nenhum garçom activo')
  } else {
    info('garcons-activos', String(garconsList.length))
  }

  const nomeCounts = new Map()
  for (const g of garconsList) {
    const k = String(g.nome ?? '').trim().toLowerCase()
    nomeCounts.set(k, (nomeCounts.get(k) ?? 0) + 1)
  }
  const dupNames = [...nomeCounts.entries()].filter(([, c]) => c > 1)
  if (dupNames.length > 0) {
    warn(
      'garcons-nomes-duplicados',
      dupNames.map(([n, c]) => `${n}×${c}`).join(', ')
    )
  } else if (garconsList.length > 0) {
    pass('garcons-nomes-unicos', 'OK')
  }

  const pinCount = garconsList.filter((g) => g.pin_ativo).length
  if (salao === 'waiter' && pinCount > 0) {
    pass('garcons-com-pin', String(pinCount))
  } else if (salao === 'waiter') {
    warn('garcons-com-pin', 'modo waiter sem PIN activo')
  }

  const { data: openSalonOrders } = await sb
    .from('orders')
    .select(
      'id, status, source, customer_name, notes, total, garcom_id, caixa_turno_id, salon_table_id, created_at'
    )
    .eq('store_id', storeId)
    .in('source', SALON_SOURCES)
    .in('status', OPEN_SALON_STATUSES)
    .is('caixa_turno_id', null)

  const salonOpen = openSalonOrders ?? []
  salonOpen.length > 0
    ? info('comandas-abertas-salao', String(salonOpen.length))
    : pass('comandas-abertas-salao', '0')

  const unnamed = salonOpen.filter((o) => !o.customer_name?.trim())
  if (unnamed.length > 1) {
    warn('comandas-sem-nome', `${unnamed.length} sem customer_name`)
  } else if (unnamed.length === 1) {
    info('comandas-sem-nome', '1 sem nome')
  } else if (salonOpen.length > 0) {
    pass('comandas-com-nome', 'todas nomeadas')
  }

  const nullGarcom = salonOpen.filter((o) => !o.garcom_id && o.source === 'waiter')
  if (nullGarcom.length > 0) {
    warn('comandas-garcom-nulo', `${nullGarcom.length} comandas waiter sem garcom_id`)
  }

  const { count: orders30d } = await sb
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .gte('created_at', thirtyDaysAgo)

  const { data: sourceRows } = await sb
    .from('orders')
    .select('source')
    .eq('store_id', storeId)
    .gte('created_at', thirtyDaysAgo)

  const bySource = {}
  for (const r of sourceRows ?? []) {
    const s = String(r.source ?? 'unknown')
    bySource[s] = (bySource[s] ?? 0) + 1
  }
  info(
    'pedidos-30d',
    `${orders30d ?? 0} (${Object.entries(bySource)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ') || 'nenhum'})`
  )

  const { count: missingSalonTable } = await sb
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .in('source', SALON_SOURCES)
    .is('salon_table_id', null)

  const { count: totalSalonOrders } = await sb
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .in('source', SALON_SOURCES)

  if ((totalSalonOrders ?? 0) > 0) {
    const pct = Math.round(((missingSalonTable ?? 0) / totalSalonOrders) * 100)
    if ((missingSalonTable ?? 0) > 10) {
      warn('salon-table-id-ausente', `${missingSalonTable}/${totalSalonOrders} (${pct}%)`)
    } else if ((missingSalonTable ?? 0) > 0) {
      info('salon-table-id-ausente', `${missingSalonTable}/${totalSalonOrders}`)
    } else {
      pass('salon-table-id', 'todos preenchidos')
    }
  }

  const productIds =
    (
      await sb.from('products').select('id').eq('store_id', storeId).eq('active', true)
    ).data?.map((p) => p.id) ?? []

  const { count: addonGroups } = await sb
    .from('addon_groups')
    .select('id', { count: 'exact', head: true })
    .in('product_id', productIds.slice(0, 500))

  if ((addonGroups ?? 0) > 0) {
    pass('grupos-adicionais', String(addonGroups))
    const { data: addonGroupRows } = await sb
      .from('addon_groups')
      .select('id, product_id, name, required, min_select, max_select')
      .in('product_id', productIds.slice(0, 500))
    const groupIds = (addonGroupRows ?? []).map((g) => g.id)
    const { data: addonItemRows } = groupIds.length
      ? await sb.from('addon_items').select('group_id').in('group_id', groupIds)
      : { data: [] }
    const itemCountByGroup = new Map()
    for (const row of addonItemRows ?? []) {
      itemCountByGroup.set(row.group_id, (itemCountByGroup.get(row.group_id) ?? 0) + 1)
    }
    const brokenRequired = (addonGroupRows ?? []).filter(
      (g) => g.required && !(itemCountByGroup.get(g.id) > 0)
    )
    if (brokenRequired.length > 0) {
      warn('addon-grupos-obrigatorios-vazios', String(brokenRequired.length))
    } else {
      pass('addon-grupos-obrigatorios', 'OK')
    }
  } else {
    info('grupos-adicionais', '0')
  }

  let legacyAddonLines = 0
  for (const o of salonOpen.slice(0, 20)) {
    const { data: items } = await sb
      .from('order_items')
      .select('name, addons')
      .eq('order_id', o.id)
    for (const it of items ?? []) {
      const hasBracket = /\s\[[^\]]+\]/.test(String(it.name ?? ''))
      const addons = Array.isArray(it.addons) ? it.addons : []
      if (hasBracket && addons.length === 0) legacyAddonLines++
    }
  }
  if (legacyAddonLines > 0) {
    warn('addon-json-legado', `${legacyAddonLines} linha(s) com nome [adicional] sem JSON`)
  }

  const { data: turno } = await sb
    .from('caixa_turnos')
    .select('id, aberto_em')
    .eq('store_id', storeId)
    .is('fechado_em', null)
    .maybeSingle()
  turno ? info('turno-caixa', `aberto desde ${turno.aberto_em}`) : info('turno-caixa', 'fechado')

  const { data: allOrders } = await sb
    .from('orders')
    .select('id, source, status, notes, customer_name, payment_method, total')
    .eq('store_id', storeId)
    .in('source', ['pdv', 'waiter', 'autoatendimento'])
    .neq('status', 'cancelled')

  const caixaOpen = (allOrders ?? []).filter((o) => !paymentRegistered(o.notes))
  info('comandas-caixa-abertas', String(caixaOpen.length))

  const { data: splitOrders } = await sb
    .from('orders')
    .select('id')
    .eq('store_id', storeId)
    .eq('payment_method', 'split')
    .limit(50)

  let splitMissing = 0
  for (const o of splitOrders ?? []) {
    const { count } = await sb
      .from('order_payments')
      .select('*', { count: 'exact', head: true })
      .eq('order_id', o.id)
    if (!count) splitMissing++
  }
  if (splitMissing > 0) {
    fail('split-sem-pagamentos', `${splitMissing} pedido(s) split sem order_payments`)
  } else if ((splitOrders ?? []).length > 0) {
    pass('split-pagamentos', 'OK')
  }

  const { count: promos } = await sb
    .from('promotions')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('active', true)
  info('promocoes-activas', String(promos ?? 0))

  // HTTP E2E
  try {
    const pubPaths = [`/${slug}`, `/${slug}?auto=1`]
    if ((tables ?? 0) > 0) pubPaths.push(`/${slug}?auto=1&mesa=1`)

    for (const p of pubPaths) {
      const s = await status(p)
      ;[200, 307, 308].includes(s)
        ? pass(`http${p}`, String(s))
        : fail(`http${p}`, String(s))
    }

    const dashRoutes = [
      '/dashboard/garcom',
      '/dashboard/caixa',
      '/dashboard/pdv',
      '/dashboard/kds',
      '/dashboard/orders',
    ]
    for (const p of dashRoutes) {
      const s = await status(p)
      if (s === 404) fail(`http${p}`, '404')
      else if ([200, 307, 308].includes(s)) pass(`http${p}`, String(s))
      else warn(`http${p}`, String(s))
    }

    const { status: waSt } = await jsonFetch('/api/waiter/tables')
    waSt === 401 ? pass('api-waiter-tables-auth', '401') : fail('api-waiter-tables-auth', String(waSt))

    const { status: chkSt } = await jsonFetch('/api/waiter/orders/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    chkSt === 401 ? pass('api-waiter-checkout-auth', '401') : fail('api-waiter-checkout-auth', String(chkSt))

    if (productIds[0]) {
      const ar = await fetch(
        `${BASE}/api/public/product-addons?storeId=${storeId}&productId=${productIds[0]}`
      )
      ar.status === 200
        ? pass('api-product-addons', '200')
        : warn('api-product-addons', String(ar.status))
    }

    const cr = await fetch(`${BASE}/api/public/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, items: [] }),
    })
    cr.status === 400
      ? pass('api-checkout-validacao', 'rejeita vazio')
      : warn('api-checkout', String(cr.status))

    const html = await (await fetch(`${BASE}/${slug}`)).text()
    html.includes('Application error')
      ? fail('storefront-html', 'Application error')
      : pass('storefront-html', 'OK')
  } catch (e) {
    fail('http-e2e', e instanceof Error ? e.message : String(e))
  }

  // Schema sanity
  const { error: itemErr } = await sb.from('order_items').select('id, addons').limit(1).maybeSingle()
  if (itemErr && /addons|column/i.test(itemErr.message)) {
    fail('schema-order-items-addons', 'coluna em falta')
  } else {
    pass('schema-order-items-addons', 'OK')
  }

  if (!store.contrato_aceite_em && plan !== 'master') {
    warn('contrato-pendente', 'contrato não assinado')
  } else if (store.contrato_aceite_em) {
    pass('contrato', 'assinado')
  }

  return audit
}

function summarize(audit) {
  const ok = audit.findings.filter((f) => f.level === 'ok').length
  const warn = audit.findings.filter((f) => f.level === 'warn').length
  const fail = audit.findings.filter((f) => f.level === 'fail').length
  return { ok, warn, fail }
}

function printAudit(audit) {
  console.log(`\n${'═'.repeat(72)}`)
  console.log(`🏪 ${audit.name} · ${audit.slug}`)
  console.log('═'.repeat(72))
  for (const f of audit.findings) {
    const icon =
      f.level === 'ok' ? '✅' : f.level === 'warn' ? '⚠️ ' : f.level === 'fail' ? '❌' : 'ℹ️ '
    console.log(`${icon} ${f.id}${f.detail ? ` — ${f.detail}` : ''}`)
  }
  const s = summarize(audit)
  console.log(`\n── ${s.ok} OK · ${s.warn} avisos · ${s.fail} falhas ──`)
  return s
}

async function main() {
  const { slug, all, exclude } = parseArgs()
  console.log(`\n🔍 Auditoria Vyria — ${BASE}\n`)

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  let stores
  if (all) {
    const { data, error } = await sb.from('stores').select('*').order('name')
    if (error) throw error
    stores = (data ?? []).filter((s) => !exclude.has(s.slug))
  } else if (slug) {
    const { data, error } = await sb.from('stores').select('*').eq('slug', slug).maybeSingle()
    if (error) throw error
    if (!data) {
      console.error(`Loja não encontrada: ${slug}`)
      process.exit(1)
    }
    stores = [data]
  } else {
    console.error('Uso: --slug=xxx ou --all [--exclude=a,b]')
    process.exit(1)
  }

  const results = []
  for (const store of stores) {
    const audit = await auditStore(sb, store)
    const s = printAudit(audit)
    results.push({ slug: store.slug, name: store.name, ...s, audit })
  }

  if (results.length > 1) {
    console.log(`\n${'═'.repeat(72)}`)
    console.log('📊 RESUMO GERAL')
    console.log('═'.repeat(72))
    for (const r of results) {
      const flag = r.fail > 0 ? '❌' : r.warn > 0 ? '⚠️ ' : '✅'
      console.log(
        `${flag} ${r.name} (${r.slug}) — ${r.ok} OK · ${r.warn} avisos · ${r.fail} falhas`
      )
    }
    const totalFail = results.reduce((a, r) => a + r.fail, 0)
    console.log(`\n── ${results.length} lojas · ${totalFail} falhas totais ──\n`)
    process.exit(totalFail > 0 ? 1 : 0)
  }

  process.exit(results[0].fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
