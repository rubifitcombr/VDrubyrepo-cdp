#!/usr/bin/env node
/**
 * Checklist de release — plano Master (WhatsApp, fidelidade, marketing).
 * Uso: node scripts/test-master-release.mjs
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnvLocal() {
  const path = resolve(root, '.env.local')
  try {
    const raw = readFileSync(path, 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
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
  } catch {
  }
}

loadEnvLocal()

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000'
const results = []

function pass(name, detail = '') {
  results.push({ ok: true, name, detail })
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail = '') {
  results.push({ ok: false, name, detail })
  console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`)
}

function warn(name, detail = '') {
  results.push({ ok: 'warn', name, detail })
  console.log(`⚠️  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function checkEnv() {
  const required = [
    'META_APP_ID',
    'META_APP_SECRET',
    'WHATSAPP_VERIFY_TOKEN',
    'WHATSAPP_TOKEN_ENCRYPTION_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
  ]
  for (const k of required) {
    if (process.env[k]?.trim()) pass(`ENV ${k}`)
    else fail(`ENV ${k}`, 'em falta')
  }

  if (process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim()) {
    pass('ENV WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID', 'Embedded Signup activo')
  } else {
    warn(
      'ENV WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID',
      'em falta — lojistas usam ligação manual até configurar na Meta'
    )
  }
}

function createDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function checkDb() {
  const db = createDb()
  if (!db) {
    fail('DB', 'Supabase não configurado')
    return
  }

  const tables = [
    'store_whatsapp_config',
    'whatsapp_messages',
    'whatsapp_webhook_events',
    'store_loyalty_config',
    'loyalty_accounts',
    'loyalty_ledger',
    'store_whatsapp_contacts',
    'store_marketing_config',
    'marketing_campaigns',
    'marketing_sends',
  ]

  for (const t of tables) {
    const { error } = await db.from(t).select('*', { count: 'exact', head: true })
    if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
      fail(`Tabela ${t}`, 'não existe — aplicar migration no Supabase')
    } else if (error) {
      warn(`Tabela ${t}`, error.message)
    } else {
      pass(`Tabela ${t}`)
    }
  }

  const { data: stores, error: storesErr } = await db
    .from('stores')
    .select('id, name, plano, plan')
    .order('created_at', { ascending: false })
    .limit(20)

  if (storesErr) {
    fail('Lojas', storesErr.message)
    return
  }

  const master = (stores || []).filter((s) => {
    const p = String(s.plano || s.plan || 'start').toLowerCase()
    return p === 'master'
  })

  if (master.length) {
    pass('Lojas Master', `${master.length}: ${master.map((s) => s.name).join(', ')}`)
  } else {
    warn('Lojas Master', 'nenhuma — definir plano master no /admin')
  }

  const { data: wa, error: waErr } = await db
    .from('store_whatsapp_config')
    .select('status, phone_number_id, display_phone_e164, webhook_verified_at, stores(name)')
    .limit(10)

  if (waErr) {
    warn('WhatsApp config', waErr.message)
  } else if (!wa?.length) {
    warn('WhatsApp ligado', 'nenhuma loja conectada')
  } else {
    for (const row of wa) {
      const name = row.stores?.name || 'loja'
      const detail = `status=${row.status} phone=${row.display_phone_e164 || row.phone_number_id || '?'}`
      if (row.status === 'active') pass(`WhatsApp: ${name}`, detail)
      else warn(`WhatsApp: ${name}`, detail)
    }
  }
}

async function checkWebhook() {
  const token = process.env.WHATSAPP_VERIFY_TOKEN?.trim()
  if (!token) return

  try {
    const url = `${BASE_URL}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=VYRIA_RELEASE_TEST`
    const res = await fetch(url)
    const body = await res.text()
    if (res.status === 200 && body === 'VYRIA_RELEASE_TEST') {
      pass('Webhook GET (verificação Meta)', BASE_URL)
    } else {
      fail('Webhook GET', `HTTP ${res.status} body=${body.slice(0, 80)}`)
    }
  } catch (e) {
    fail('Webhook GET', `servidor offline? ${e instanceof Error ? e.message : e}`)
  }
}

async function checkApiAuth() {
  const endpoints = [
    '/api/master/whatsapp/config',
    '/api/master/loyalty/config',
    '/api/master/marketing/config',
    '/api/master/whatsapp/embedded-config',
  ]
  for (const path of endpoints) {
    try {
      const res = await fetch(`${BASE_URL}${path}`)
      if (res.status === 401) pass(`API auth ${path}`, '401 sem sessão (ok)')
      else warn(`API auth ${path}`, `HTTP ${res.status}`)
    } catch (e) {
      fail(`API auth ${path}`, e instanceof Error ? e.message : String(e))
    }
  }
}

async function checkPages() {
  const pages = [
    '/dashboard/master',
    '/dashboard/master/whatsapp',
    '/dashboard/master/fidelidade',
    '/dashboard/master/marketing',
  ]
  for (const path of pages) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, { redirect: 'manual' })
      if (res.status === 200 || res.status === 307 || res.status === 302) {
        pass(`Página ${path}`, `HTTP ${res.status}`)
      } else {
        warn(`Página ${path}`, `HTTP ${res.status}`)
      }
    } catch (e) {
      fail(`Página ${path}`, e instanceof Error ? e.message : String(e))
    }
  }
}

async function checkProductionWebhook() {
  const token = process.env.WHATSAPP_VERIFY_TOKEN?.trim()
  const prodUrl = process.env.VYRIA_PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_VYRIA_PUBLIC_URL?.trim()
  if (!token || !prodUrl) {
    warn('Webhook produção', 'VYRIA_PUBLIC_URL não definido')
    return
  }

  const bases = [prodUrl.replace(/\/$/, '')]
  if (!bases[0].includes('www.')) {
    bases.push(bases[0].replace('://', '://www.'))
  }

  for (const base of bases) {
    try {
      const url = `${base}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=VYRIA_PROD`
      const res = await fetch(url, { redirect: 'follow' })
      const body = await res.text()
      if (res.status === 200 && body === 'VYRIA_PROD') {
        pass('Webhook produção', base)
        return
      }
      if (res.status === 404 || body.includes('could not be found')) {
        fail('Webhook produção', `${base} → 404 (código Master ainda não deployado?)`)
      } else {
        warn('Webhook produção', `${base} → HTTP ${res.status}`)
      }
    } catch (e) {
      warn('Webhook produção', e instanceof Error ? e.message : String(e))
    }
  }
}

async function main() {
  console.log('\n=== Vyria Master — teste de release ===\n')
  await checkEnv()
  await checkDb()
  await checkWebhook()
  await checkProductionWebhook()
  await checkApiAuth()
  await checkPages()

  const failed = results.filter((r) => r.ok === false)
  const warned = results.filter((r) => r.ok === 'warn')
  console.log('\n--- Resumo ---')
  console.log(`Passou: ${results.filter((r) => r.ok === true).length}`)
  console.log(`Avisos: ${warned.length}`)
  console.log(`Falhas: ${failed.length}`)

  if (failed.length) {
    console.log('\nCorrija as falhas antes de liberar para usuários.')
    process.exit(1)
  }
  if (warned.length) {
    console.log('\nHá avisos — revise antes do go-live.')
  } else {
    console.log('\nTudo OK para testes manuais no painel.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
