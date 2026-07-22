import type { NextResponse } from 'next/server'

/**
 * Cabeçalhos de segurança (Edge/proxy).
 * Nota: DevTools do browser não podem ser desativados de forma fiável —
 * a proteção real é servidor + RLS + segredos só no backend.
 */
export function applySecurityHeaders(
  response: NextResponse,
  production: boolean
): void {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-DNS-Prefetch-Control', 'off')
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  response.headers.set(
    'Permissions-Policy',
    [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'interest-cohort=()',
    ].join(', ')
  )

  if (production) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    )
    response.headers.set('Content-Security-Policy', buildContentSecurityPolicy())
  }
}

function buildContentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    // Next.js App Router (hydration) — sem unsafe-eval quebra em muitos deploys.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com",
    "frame-src 'self' https://pay.cakto.com.br https://*.cakto.com.br",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    'upgrade-insecure-requests',
  ].join('; ')
}

export function expectedSecurityHeaderChecks(production: boolean): Array<{
  name: string
  get: (headers: Headers) => string | null
  ok: (value: string | null) => boolean
}> {
  const checks = [
    {
      name: 'X-Frame-Options',
      get: (h: Headers) => h.get('x-frame-options'),
      ok: (v: string | null) => v === 'DENY',
    },
    {
      name: 'X-Content-Type-Options',
      get: (h: Headers) => h.get('x-content-type-options'),
      ok: (v: string | null) => v === 'nosniff',
    },
    {
      name: 'Referrer-Policy',
      get: (h: Headers) => h.get('referrer-policy'),
      ok: (v: string | null) => v === 'strict-origin-when-cross-origin',
    },
    {
      name: 'Cross-Origin-Opener-Policy',
      get: (h: Headers) => h.get('cross-origin-opener-policy'),
      ok: (v: string | null) => v === 'same-origin',
    },
  ]
  if (production) {
    checks.push({
      name: 'Strict-Transport-Security',
      get: (h: Headers) => h.get('strict-transport-security'),
      ok: (v: string | null) => typeof v === 'string' && v.includes('max-age'),
    })
    checks.push({
      name: 'Content-Security-Policy',
      get: (h: Headers) => h.get('content-security-policy'),
      ok: (v: string | null) => typeof v === 'string' && v.includes("default-src 'self'"),
    })
  }
  return checks
}
