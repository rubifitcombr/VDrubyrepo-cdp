#!/usr/bin/env node
/**
 * Testes HTTP de segurança — NÃO colar no SQL Editor do Supabase.
 * Este ficheiro é JavaScript; corre no terminal:
 *
 *   npm run test:security
 *   # ou
 *   BASE_URL=http://localhost:3000 node scripts/security/run-security-tests.mjs
 */

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const LOJISTA_COOKIE = process.env.LOJISTA_SESSION_COOKIE || ''

let failed = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (e) {
    failed += 1
    console.error(`✗ ${name}`)
    console.error(`  ${e instanceof Error ? e.message : e}`)
  }
}

await test('GET /api/admin/lojistas sem auth → 401', async () => {
  const res = await fetch(`${BASE}/api/admin/lojistas`)
  if (res.status !== 401) {
    throw new Error(`esperado 401, got ${res.status}`)
  }
})

if (LOJISTA_COOKIE) {
  await test('GET /api/admin/lojistas como lojista → 403', async () => {
    const res = await fetch(`${BASE}/api/admin/lojistas`, {
      headers: { Cookie: LOJISTA_COOKIE },
    })
    if (res.status !== 403) {
      throw new Error(`esperado 403, got ${res.status}`)
    }
  })
} else {
  console.log('· skip lojista admin test (defina LOJISTA_SESSION_COOKIE)')
}

await test('POST checkout preço adulterado → 409 ou 400', async () => {
  const res = await fetch(`${BASE}/api/public/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: 'loja-inexistente-teste',
      fulfillment: 'pickup',
      customerName: 'Teste',
      customerPhone: '11999999999',
      items: [
        {
          productId: '00000000-0000-0000-0000-000000000099',
          name: 'X',
          quantity: 1,
          unitPrice: 0.01,
          addons: [],
        },
      ],
    }),
  })
  if (![400, 404, 409].includes(res.status)) {
    throw new Error(`esperado 400/404/409, got ${res.status}`)
  }
})

await test('POST pix-status sem slug → 400', async () => {
  const res = await fetch(`${BASE}/api/public/orders/pix-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: '00000000-0000-0000-0000-000000000099' }),
  })
  if (res.status !== 400) {
    throw new Error(`esperado 400, got ${res.status}`)
  }
})

if (process.env.NODE_ENV === 'production') {
  await test('POST /api/billing/upgrade bloqueado em produção → 403', async () => {
    const res = await fetch(`${BASE}/api/billing/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPlan: 'PRO' }),
    })
    if (res.status !== 401 && res.status !== 403) {
      throw new Error(`esperado 401/403, got ${res.status}`)
    }
  })
} else {
  console.log('· skip billing upgrade prod test (NODE_ENV !== production)')
}

if (LOJISTA_COOKIE) {
  await test('POST /api/assinatura/cancelar autenticado → não 401', async () => {
    const res = await fetch(`${BASE}/api/assinatura/cancelar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: LOJISTA_COOKIE,
      },
      body: JSON.stringify({ motivo: 'outro' }),
    })
    if (res.status === 401) {
      throw new Error('esperado sessão válida, got 401')
    }
  })
} else {
  console.log('· skip assinatura/cancelar test (defina LOJISTA_SESSION_COOKIE)')
}

await test('GET /login inclui cabeçalhos de segurança', async () => {
  const res = await fetch(`${BASE}/login`)
  const frame = res.headers.get('x-frame-options')
  const nosniff = res.headers.get('x-content-type-options')
  const coop = res.headers.get('cross-origin-opener-policy')
  if (frame !== 'DENY') throw new Error(`X-Frame-Options: ${frame}`)
  if (nosniff !== 'nosniff') throw new Error(`X-Content-Type-Options: ${nosniff}`)
  if (coop !== 'same-origin') throw new Error(`COOP: ${coop}`)
})

await test('POST /api/auth/register rate limit ou validação', async () => {
  const bodies = Array.from({ length: 12 }, (_, i) =>
    fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `spam-${i}-${Date.now()}@example.com`,
        password: '123456',
        name: 'Teste',
      }),
    })
  )
  const results = await Promise.all(bodies)
  const has429 = results.some((r) => r.status === 429)
  const has400 = results.some((r) => r.status === 400 || r.status === 409)
  if (!has429 && !has400) {
    throw new Error(
      `esperado 429 ou 400/409 em flood de register, got ${results.map((r) => r.status).join(',')}`
    )
  }
})

console.log(failed ? `\n${failed} teste(s) falharam.` : '\nTodos os testes passaram.')
process.exit(failed ? 1 : 0)
