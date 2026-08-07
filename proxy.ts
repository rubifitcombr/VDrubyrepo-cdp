import { isAuthPortalHost } from '@/lib/auth-portal-host'
import { APP_RESERVED_FIRST_SEGMENTS } from '@/lib/app-reserved-routes'
import { createServerClient } from '@supabase/ssr'
import { isVyriaAdminPanelUser } from '@/lib/admin-panel-user'
import {
  parseVyriaPanelMode,
  VYRIA_PANEL_MODE_COOKIE,
} from '@/lib/vyria-panel-mode'
import { isMerchantApiContractGatePath } from '@/lib/annual-contract-gates'
import { IMPERSONATION_ACTIVE_COOKIE } from '@/lib/impersonation'
import { openImpersonationContextEdge } from '@/lib/impersonation-open.edge'
import {
  verificarLojistaGatesEdge,
  type LojistaGateResult,
} from '@/middleware/verificarLojistaGates.edge'
import {
  checkEdgeRateLimit,
  clientIpFromEdgeRequest,
} from '@/lib/rate-limit.edge'
import { guardIpAccess } from '@/lib/ip-abuse-guard'
import { applySecurityHeaders } from '@/lib/security-headers.edge'
import { supabaseServerGlobalOptions } from '@/lib/supabase/client-options'
import { NextResponse, type NextRequest } from 'next/server'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function secure(response: NextResponse): NextResponse {
  applySecurityHeaders(response, IS_PRODUCTION)
  return response
}

function pathnameWithoutTrailingSlash(pathname: string) {
  return pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname
}

function clientIpFromRequest(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || ''
}

/** Opt-in: ADMIN_IP_ALLOWLIST=ip1,ip2 (vírgula). Vazio = sem restrição. */
function adminIpAllowed(request: NextRequest): boolean {
  const raw = process.env.ADMIN_IP_ALLOWLIST?.trim()
  if (!raw) return true
  const allow = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
  if (allow.size === 0) return true
  const ip = clientIpFromRequest(request)
  return ip !== '' && allow.has(ip)
}

export async function proxy(request: NextRequest) {
  const rawPath = request.nextUrl.pathname
  const host =
    request.headers.get('host')?.split(':')[0]?.toLowerCase() ?? ''

  if (isAuthPortalHost(host)) {
    const path = rawPath === '' ? '/' : rawPath
    if (path === '/') {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return secure(NextResponse.redirect(url))
    }
  }

  const p = pathnameWithoutTrailingSlash(rawPath)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', p)

  const ip = clientIpFromEdgeRequest(request)
  const blocked = guardIpAccess(ip)
  if (!blocked.ok) {
    return secure(
      NextResponse.json(
        { error: blocked.message },
        { status: 403, headers: { 'Retry-After': String(blocked.retryAfterSec) } }
      )
    )
  }

  if (p.startsWith('/api/public/')) {
    const rl = checkEdgeRateLimit(ip, 'public', 40, 60_000)
    if (!rl.ok) {
      const status = rl.guard?.status === 403 ? 403 : 429
      return secure(
        NextResponse.json(
          { error: rl.guard?.message || 'Demasiados pedidos. Tenta novamente dentro de momentos.' },
          { status, headers: { 'Retry-After': String(rl.retryAfterSec) } }
        )
      )
    }
  } else if (p.startsWith('/api/')) {
    const rl = checkEdgeRateLimit(ip, 'api', 180, 60_000)
    if (!rl.ok) {
      const status = rl.guard?.status === 403 ? 403 : 429
      return secure(
        NextResponse.json(
          { error: rl.guard?.message || 'Demasiados pedidos. Tenta novamente dentro de momentos.' },
          { status, headers: { 'Retry-After': String(rl.retryAfterSec) } }
        )
      )
    }
  }

  const segments = p.split('/').filter(Boolean)
  if (segments.length >= 1) {
    const first = segments[0]
    const firstLower = first.toLowerCase()
    if (
      APP_RESERVED_FIRST_SEGMENTS.has(firstLower) &&
      first !== firstLower
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/' + [firstLower, ...segments.slice(1)].join('/')
      return secure(NextResponse.redirect(url))
    }
  }

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  })
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!supabaseUrl || !supabaseAnonKey) {
    return secure(supabaseResponse)
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    ...supabaseServerGlobalOptions(),
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 30,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({
          request: { headers: requestHeaders },
        })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isPasswordRedefinePage =
    p === '/login/redefinir-senha' || p.startsWith('/login/redefinir-senha/')
  const isRecuperarSenhaPage =
    p === '/login/recuperar' || p.startsWith('/login/recuperar/')
  const isLoginPage = p === '/login' || p.startsWith('/login/')
  const isAuthPage =
    isLoginPage ||
    p === '/register' ||
    p.startsWith('/register/') ||
    isRecuperarSenhaPage ||
    isPasswordRedefinePage
  const vyriaPanelMode = parseVyriaPanelMode(
    request.cookies.get(VYRIA_PANEL_MODE_COOKIE)?.value
  )
  const vyriaInAdminMode =
    !!user &&
    isVyriaAdminPanelUser(user.id) &&
    vyriaPanelMode === 'admin'
  const impersonating = await openImpersonationContextEdge(
    request.cookies.get(IMPERSONATION_ACTIVE_COOKIE)?.value
  )

  /**
   * IMPERSONAÇÃO / MODO ADMIN — não confundir com lojista normal.
   * `skipMerchantGates` é true quando:
   * - Utilizador Vyria em modo admin (`vyria_panel_mode=admin`), ou
   * - Cookie de impersonação activo (admin a ver painel como lojista).
   * Nestes casos: contrato anual, lojista inactivo e gates de API merchant
   * são ignorados. O plano efectivo continua a vir da loja impersonada.
   */
  const skipMerchantGates =
    !!user && (vyriaInAdminMode || Boolean(impersonating))

  const merchantShell = p.startsWith('/dashboard') || p.startsWith('/planos')

  async function gateFor(pathname: string): Promise<LojistaGateResult> {
    if (!user || skipMerchantGates) return { ok: true }
    return verificarLojistaGatesEdge(user.id, pathname, supabase)
  }

  if (isAuthPage && user && !isPasswordRedefinePage) {
    if (vyriaInAdminMode) {
      return secure(NextResponse.redirect(new URL('/admin', request.url)))
    }
    const gate = await gateFor('/dashboard')
    if (!gate.ok && gate.kind === 'contract') {
      return secure(NextResponse.redirect(new URL(gate.path, request.url)))
    }
    if (!gate.ok && gate.kind === 'redirect') {
      return secure(NextResponse.redirect(new URL(gate.path, request.url)))
    }
    return secure(NextResponse.redirect(new URL('/dashboard', request.url)))
  }

  if (p.startsWith('/api/admin') || p.startsWith('/admin')) {
    if (!adminIpAllowed(request)) {
      if (p.startsWith('/api/admin')) {
        return secure(NextResponse.json({ error: 'Proibido' }, { status: 403 }))
      }
      return secure(NextResponse.redirect(new URL('/dashboard', request.url)))
    }
  }

  if (p.startsWith('/api/admin')) {
    if (!user) {
      return secure(NextResponse.json({ error: 'Não autenticado' }, { status: 401 }))
    }
    if (!isVyriaAdminPanelUser(user.id)) {
      return secure(NextResponse.json({ error: 'Proibido' }, { status: 403 }))
    }
    if (!vyriaInAdminMode) {
      return secure(
        NextResponse.json(
          { error: 'Ativa o modo admin para usar esta API.' },
          { status: 403 }
        )
      )
    }
    return secure(supabaseResponse)
  }

  if (p.startsWith('/admin')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', p)
      return secure(NextResponse.redirect(url))
    }
    if (!isVyriaAdminPanelUser(user.id)) {
      return secure(NextResponse.redirect(new URL('/dashboard', request.url)))
    }
    if (!vyriaInAdminMode) {
      return secure(NextResponse.redirect(new URL('/dashboard', request.url)))
    }
  }

  if (merchantShell && user) {
    if (!skipMerchantGates) {
      const gate = await gateFor(p)
      if (!gate.ok) {
        return secure(NextResponse.redirect(new URL(gate.path, request.url)))
      }
    }
  }

  if (user && !skipMerchantGates && isMerchantApiContractGatePath(p)) {
    const gate = await gateFor(p)
    if (!gate.ok && gate.kind === 'contract') {
      return secure(
        NextResponse.json(
          { error: 'contrato_pendente', redirect: gate.path },
          { status: 403 }
        )
      )
    }
    if (!gate.ok) {
      return secure(
        NextResponse.json(
          { error: 'acesso_bloqueado', redirect: gate.path },
          { status: 403 }
        )
      )
    }
  }

  if (merchantShell && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', p.startsWith('/dashboard') ? p : '/dashboard')
    return secure(NextResponse.redirect(url))
  }

  const slugSegments = p.split('/').filter(Boolean)
  if (
    slugSegments.length === 1 &&
    !slugSegments[0].includes('.') &&
    !APP_RESERVED_FIRST_SEGMENTS.has(slugSegments[0].toLowerCase())
  ) {
    supabaseResponse.headers.set(
      'Cache-Control',
      user
        ? 'private, no-store, max-age=0, must-revalidate'
        : 'public, s-maxage=30, stale-while-revalidate=120'
    )
  }

  if (
    p.startsWith('/dashboard') ||
    p === '/sw.js' ||
    p.startsWith('/api/health/build')
  ) {
    supabaseResponse.headers.set(
      'Cache-Control',
      'private, no-store, max-age=0, must-revalidate'
    )
  }

  return secure(supabaseResponse)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
