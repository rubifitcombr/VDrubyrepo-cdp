#!/usr/bin/env node
/**
 * Smoke test local — rotas públicas, proxy, cron auth, env obrigatórias.
 * Uso: node scripts/smoke-health-check.mjs [BASE_URL]
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const __dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dir, '..')

function loadEnvLocal() {
  const path = resolve(root, '.env.local')
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i <= 0) continue
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

const env = loadEnvLocal()

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VYRIA_PUBLIC_URL',
  'NEXT_PUBLIC_VYRIA_PUBLIC_URL',
  'CRON_SECRET',
  'IMPERSONATION_COOKIE_SECRET',
  'VYRIA_RAZAO_SOCIAL',
  'VYRIA_CNPJ',
  'VYRIA_TERMOS_URL',
  'ADMIN_EMAIL',
]

const RECOMMENDED_ENV = [
  'VYRIA_ADMIN_USER_ID',
  'VYRIA_FORO_COMARCA',
  'VYRIA_EMAIL_JURIDICO',
  'RESEND_API_KEY',
  'RESEND_FROM',
  'NEXT_PUBLIC_ADMIN_WHATSAPP',
  'WEB_PUSH_VAPID_SUBJECT',
  'NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY',
  'WEB_PUSH_VAPID_PRIVATE_KEY',
]

const DASHBOARD_SHELL_PATHS = [
  '/dashboard',
  '/dashboard/orders',
  '/dashboard/menu',
  '/dashboard/settings',
  '/dashboard/planos',
  '/dashboard/fiscal',
  '/dashboard/caixa',
]

const ADMIN_PATHS = ['/admin', '/admin/lojistas']

const PUBLIC_PAGES = [
  '/',
  '/login',
  '/register',
  '/login/recuperar',
  '/blog',
  '/acesso-suspenso',
]

const PROTECTED_REDIRECTS = [
  { path: '/dashboard', expect: /\/login/ },
  { path: '/admin', expect: /\/login/ },
]

async function fetchStatus(path, opts = {}) {
  const url = `${BASE}${path}`
  try {
    const res = await fetch(url, { redirect: 'manual', ...opts })
    return { path, status: res.status, location: res.headers.get('location') || '' }
  } catch (e) {
    return { path, status: 0, error: e.message }
  }
}

async function main() {
  console.log(`\n=== Vyria smoke check — ${BASE} ===\n`)

  // Env
  console.log('--- Variáveis de ambiente (.env.local) ---')
  let envOk = true
  for (const key of REQUIRED_ENV) {
    const ok = Boolean(env[key]?.trim())
    if (!ok) envOk = false
    console.log(`${ok ? '✓' : '✗'} ${key}${ok ? '' : ' (em falta)'}`)
  }
  for (const key of RECOMMENDED_ENV) {
    const ok = Boolean(env[key]?.trim())
    console.log(`${ok ? '✓' : '○'} ${key}${ok ? '' : ' (recomendado)'}`)
  }

  // Supabase ping
  console.log('\n--- Supabase ---')
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
        headers: {
          apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
      })
      console.log(`${r.status < 500 ? '✓' : '✗'} REST API responde (${r.status})`)
    } catch (e) {
      console.log(`✗ REST API: ${e.message}`)
      envOk = false
    }
  }

  // Public pages
  console.log('\n--- Páginas públicas ---')
  let pagesOk = true
  for (const path of PUBLIC_PAGES) {
    const r = await fetchStatus(path)
    const ok = r.status === 200
    if (!ok) pagesOk = false
    console.log(`${ok ? '✓' : '✗'} ${path} → ${r.status}${r.error ? ` (${r.error})` : ''}`)
  }

  // Protected redirects
  console.log('\n--- Rotas protegidas (sem sessão) ---')
  for (const { path, expect } of PROTECTED_REDIRECTS) {
    const r = await fetchStatus(path)
    const ok = r.status >= 300 && r.status < 400 && expect.test(r.location)
    console.log(`${ok ? '✓' : '✗'} ${path} → ${r.status} ${r.location || r.error || ''}`)
    if (!ok) pagesOk = false
  }

  // APIs without auth
  console.log('\n--- APIs (sem sessão) ---')
  const postLogin = await fetch(`${BASE}/api/auth/post-login-redirect`, { redirect: 'manual' })
  console.log(`${postLogin.status === 401 ? '✓' : '✗'} GET /api/auth/post-login-redirect → ${postLogin.status} (esperado 401)`)

  const cronNoAuth = await fetch(`${BASE}/api/cron/verificar-vencimentos`)
  console.log(`${cronNoAuth.status === 403 || cronNoAuth.status === 401 ? '✓' : '✗'} GET /api/cron/verificar-vencimentos sem token → ${cronNoAuth.status} (esperado 401 ou 403)`)

  if (env.CRON_SECRET) {
    const cronAuth = await fetch(`${BASE}/api/cron/verificar-vencimentos`, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    })
    const cronOk = cronAuth.status === 200
    console.log(`${cronOk ? '✓' : '✗'} GET /api/cron/verificar-vencimentos com CRON_SECRET → ${cronAuth.status}`)
    if (!cronOk) {
      try {
        const body = await cronAuth.text()
        if (body) console.log(`    resposta: ${body.slice(0, 120)}`)
      } catch {}
    }
  }

  // Dashboard shell (must redirect to login, never 500)
  console.log('\n--- Dashboard (sem sessão → login) ---')
  for (const path of DASHBOARD_SHELL_PATHS) {
    const r = await fetchStatus(path)
    const ok = r.status >= 300 && r.status < 400 && /\/login/.test(r.location)
    if (!ok) pagesOk = false
    console.log(`${ok ? '✓' : '✗'} ${path} → ${r.status} ${r.location || r.error || ''}`)
  }

  for (const path of ADMIN_PATHS) {
    const r = await fetchStatus(path)
    const ok = r.status >= 300 && r.status < 400 && /\/login/.test(r.location)
    if (!ok) pagesOk = false
    console.log(`${ok ? '✓' : '✗'} ${path} → ${r.status} ${r.location || r.error || ''}`)
  }

  // Resend key sanity
  console.log('\n--- Integrações ---')
  const resendKey = env.RESEND_API_KEY?.trim() || ''
  if (!resendKey) {
    console.log('○ RESEND_API_KEY em falta — emails desativados')
  } else if (!/^re_[A-Za-z0-9]/.test(resendKey)) {
    console.log('✗ RESEND_API_KEY parece placeholder (deve começar com re_)')
    envOk = false
  } else {
    try {
      const rr = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${resendKey}` },
      })
      console.log(`${rr.status === 200 ? '✓' : '✗'} Resend API → ${rr.status}`)
      if (rr.status !== 200) envOk = false
    } catch (e) {
      console.log(`✗ Resend API: ${e.message}`)
      envOk = false
    }
  }

  // Proxy must not 500 on login page
  const login = await fetch(`${BASE}/login`)
  const loginOk = login.status === 200
  console.log(`\n--- Proxy / login ---`)
  console.log(`${loginOk ? '✓' : '✗'} /login não retorna 500 (${login.status})`)

  const summary = envOk && pagesOk && loginOk
  console.log(`\n=== Resultado: ${summary ? 'OK (base)' : 'PROBLEMAS DETECTADOS'} ===`)
  console.log('Fluxos com sessão (login, dashboard, admin, checkout) requerem teste manual no browser.\n')
  process.exit(summary ? 0 : 1)
}

main()
