#!/usr/bin/env node
/**
 * Smoke pós-deploy em produção — health, login, pedido, caixa, garçom, cardápio.
 * Uso: node scripts/prod-post-deploy-smoke.mjs
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const BASE = (process.env.SMOKE_BASE_URL || 'https://www.acesseseusistemavyria.online').replace(/\/$/, '')
const STORE_ID = 'e472b84e-32c1-4a9d-87fc-756b874f793a'
const SLUG = 'tudibom'
const EXPECT_COMMIT_PREFIX = process.env.SMOKE_EXPECT_COMMIT || '6a8cdf1'

const report = []

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

function pass(name, detail = '') {
  report.push({ ok: true, name, detail })
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail = '') {
  report.push({ ok: false, name, detail })
  console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`)
}

function supabaseProjectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  return new URL(url).hostname.split('.')[0]
}

function authCookieName() {
  return `sb-${supabaseProjectRef()}-auth-token`
}

async function createMagicLinkSession(email) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${BASE}/dashboard` },
  })
  if (error || !data?.properties?.hashed_token) {
    throw new Error(`generateLink: ${error?.message ?? 'sem token'}`)
  }
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'email',
  })
  if (verifyError || !verified.session) {
    throw new Error(`verifyOtp: ${verifyError?.message ?? 'sem sessão'}`)
  }
  return verified.session
}

async function injectSession(context, session) {
  const host = new URL(BASE).hostname
  const cookieValue = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  })
  await context.addCookies([
    {
      name: authCookieName(),
      value: cookieValue,
      domain: host,
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    },
  ])
}

loadEnv()

console.log(`\n🔥 Smoke pós-deploy — ${BASE}\n`)

// 1) health/build
try {
  const res = await fetch(`${BASE}/api/health/build`, { cache: 'no-store' })
  const body = await res.json()
  if (!res.ok) {
    fail('health/build', `HTTP ${res.status}`)
  } else if (!String(body.commit ?? '').startsWith(EXPECT_COMMIT_PREFIX)) {
    fail(
      'health/build',
      `commit=${body.commit ?? 'null'} (esperado prefixo ${EXPECT_COMMIT_PREFIX})`
    )
  } else {
    pass(
      'health/build',
      `commit=${String(body.commit).slice(0, 12)} · version=${body.dashboardClientVersion}`
    )
  }
} catch (e) {
  fail('health/build', e.message)
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { data: store } = await sb.from('stores').select('owner_id, hub_pin_balcao_enabled, hub_pin_balcao').eq('id', STORE_ID).single()
const { data: owner } = await sb.auth.admin.getUserById(String(store.owner_id))
const ownerEmail = owner?.user?.email
if (!ownerEmail) {
  fail('login (setup)', 'email do dono não encontrado')
  printSummary()
  process.exit(1)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext()
const page = await context.newPage()

let createdOrderId = null
let openedTurnoId = null

try {
  // 2) login
  try {
    const session = await createMagicLinkSession(ownerEmail)
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await injectSession(context, session)
    const sync = await page.request.post(`${BASE}/api/auth/sync-usuario`)
    if (!sync.ok()) throw new Error(`sync-usuario ${sync.status()}`)
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    if (!/\/dashboard/.test(page.url())) throw new Error(`URL inesperada: ${page.url()}`)
    pass('login', ownerEmail)
  } catch (e) {
    fail('login', e.message)
    throw e
  }

  // 3) criar pedido (service role + verificar no painel)
  try {
    const { data: created, error } = await sb
      .from('orders')
      .insert({
        store_id: STORE_ID,
        customer_name: 'Smoke pós-deploy',
        status: 'preparing',
        source: 'pdv',
        total: 9.9,
        payment_method: 'cash',
      })
      .select('id')
      .single()
    if (error || !created?.id) throw new Error(error?.message ?? 'insert falhou')
    createdOrderId = String(created.id)

    await page.goto(`${BASE}/dashboard/orders`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    const card = page.locator(`#order-card-${createdOrderId}`)
    await card.waitFor({ state: 'visible', timeout: 30_000 })
    pass('criar pedido', `id=${createdOrderId.slice(0, 8)}… visível em /dashboard/orders`)
  } catch (e) {
    fail('criar pedido', e.message)
  }

  // 4) abrir/fechar turno caixa
  try {
    if (store.hub_pin_balcao_enabled && store.hub_pin_balcao) {
      await page.evaluate(
        ([storeId]) => {
          window.sessionStorage.setItem(`vyria-hub-pin:${storeId}:balcao`, 'ok')
        },
        [STORE_ID]
      )
    }

    const { data: openBefore } = await sb
      .from('caixa_turnos')
      .select('id')
      .eq('store_id', STORE_ID)
      .is('fechado_em', null)
      .maybeSingle()

    if (openBefore?.id) {
      const closeRes = await page.request.post(`${BASE}/api/cashier/turno/close`, {
        data: { storeId: STORE_ID, turnoId: openBefore.id },
      })
      if (!closeRes.ok()) {
        throw new Error(`fechar turno existente ${closeRes.status()}: ${await closeRes.text()}`)
      }
    }

    const openRes = await page.request.post(`${BASE}/api/cashier/turno/open`, {
      data: { storeId: STORE_ID, openingCashBrl: 0 },
    })
    const openJson = await openRes.json().catch(() => ({}))
    if (!openRes.ok()) {
      throw new Error(`abrir turno ${openRes.status()}: ${JSON.stringify(openJson)}`)
    }
    openedTurnoId = openJson.turno?.id ?? openJson.id ?? null
    if (!openedTurnoId) {
      const { data: turno } = await sb
        .from('caixa_turnos')
        .select('id')
        .eq('store_id', STORE_ID)
        .is('fechado_em', null)
        .maybeSingle()
      openedTurnoId = turno?.id ?? null
    }
    if (!openedTurnoId) throw new Error('turno aberto não encontrado após API')

    const closeRes = await page.request.post(`${BASE}/api/cashier/turno/close`, {
      data: { storeId: STORE_ID, turnoId: openedTurnoId },
    })
    const closeJson = await closeRes.json().catch(() => ({}))
    if (!closeRes.ok()) {
      throw new Error(`fechar turno ${closeRes.status()}: ${JSON.stringify(closeJson)}`)
    }

    const { data: closed } = await sb
      .from('caixa_turnos')
      .select('fechado_em')
      .eq('id', openedTurnoId)
      .maybeSingle()
    if (!closed?.fechado_em) throw new Error('fechado_em ainda null na BD')
    pass('caixa turno', `abrir/fechar turno ${String(openedTurnoId).slice(0, 8)}…`)
    openedTurnoId = null
  } catch (e) {
    fail('caixa turno', e.message)
  }

  // 5) PIN garçom
  try {
    const { data: garcom } = await sb
      .from('store_garcons')
      .select('nome, pin')
      .eq('store_id', STORE_ID)
      .eq('ativo', true)
      .eq('pin_ativo', true)
      .limit(1)
      .maybeSingle()
    if (!garcom?.pin) throw new Error('nenhum garçom com PIN activo')

    await page.goto(`${BASE}/dashboard/garcom`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    const modal = page.getByRole('dialog')
    await modal.waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByTestId('garcom-pin-input').fill(String(garcom.pin))
    await page.getByTestId('garcom-pin-submit').click()
    await page.getByTestId('garcom-table-map').waitFor({ state: 'visible', timeout: 30_000 })
    const badge = await page.getByTestId('garcom-session-badge').innerText()
    pass('PIN garçom', `${garcom.nome} · badge="${badge.trim().slice(0, 40)}"`)
  } catch (e) {
    fail('PIN garçom', e.message)
  }

  // 6) cardápio público
  try {
    const res = await page.goto(`${BASE}/${SLUG}/menu`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })
    const status = res?.status() ?? 0
    const html = await page.content()
    if (status >= 400) throw new Error(`HTTP ${status}`)
    if (/application error|internal server error/i.test(html)) {
      throw new Error('página com erro de aplicação')
    }
    const hasMenuSignal =
      /tudibom|sanduicheria|card[aá]pio|adicionar/i.test(html) ||
      (await page.locator('button, a, [role="button"]').count()) > 0
    if (!hasMenuSignal) throw new Error('conteúdo do cardápio não detectado')
    pass('cardápio público', `GET /${SLUG}/menu → ${status}`)
  } catch (e) {
    fail('cardápio público', e.message)
  }
} finally {
  if (createdOrderId) {
    await sb.from('orders').delete().eq('id', createdOrderId)
  }
  if (openedTurnoId) {
    await page.request.post(`${BASE}/api/cashier/turno/close`, {
      data: { storeId: STORE_ID, turnoId: openedTurnoId },
    }).catch(() => {})
  }
  await browser.close()
}

function printSummary() {
  const failed = report.filter((r) => !r.ok).length
  const passed = report.filter((r) => r.ok).length
  console.log(`\n─── ${passed}/${report.length} OK${failed ? ` · ${failed} falha(s)` : ''} ───\n`)
}

printSummary()
process.exit(report.some((r) => !r.ok) ? 1 : 0)
