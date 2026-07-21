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
import { verificarLojistaGatesEdge } from '@/middleware/verificarLojistaGates.edge'
import { NextResponse, type NextRequest } from 'next/server'

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
      return NextResponse.redirect(url)
    }
  }

  const p = pathnameWithoutTrailingSlash(rawPath)

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
      return NextResponse.redirect(url)
    }
  }

  let supabaseResponse = NextResponse.next({ request })
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 30,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
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

  if (isAuthPage && user && !isPasswordRedefinePage) {
    if (vyriaInAdminMode) {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    const gate = await verificarLojistaGatesEdge(user.id, '/dashboard', supabase)
    if (!gate.ok && gate.kind === 'contract') {
      return NextResponse.redirect(new URL(gate.path, request.url))
    }
    if (!gate.ok && gate.kind === 'redirect') {
      return NextResponse.redirect(new URL(gate.path, request.url))
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (p.startsWith('/api/admin') || p.startsWith('/admin')) {
    if (!adminIpAllowed(request)) {
      if (p.startsWith('/api/admin')) {
        return NextResponse.json({ error: 'Proibido' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  if (p.startsWith('/api/admin')) {
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    if (!isVyriaAdminPanelUser(user.id)) {
      return NextResponse.json({ error: 'Proibido' }, { status: 403 })
    }
    if (!vyriaInAdminMode) {
      return NextResponse.json(
        { error: 'Ativa o modo admin para usar esta API.' },
        { status: 403 }
      )
    }
    return supabaseResponse
  }

  if (p.startsWith('/admin')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', p)
      return NextResponse.redirect(url)
    }
    if (!isVyriaAdminPanelUser(user.id)) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    if (!vyriaInAdminMode) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  const merchantShell = p.startsWith('/dashboard') || p.startsWith('/planos')
  const skipMerchantGates =
    !!user && (vyriaInAdminMode || Boolean(impersonating))

  if (merchantShell && user) {
    if (!skipMerchantGates) {
      const gate = await verificarLojistaGatesEdge(user.id, p, supabase)
      if (!gate.ok) {
        return NextResponse.redirect(new URL(gate.path, request.url))
      }
    }
  }

  if (user && !skipMerchantGates && isMerchantApiContractGatePath(p)) {
    const gate = await verificarLojistaGatesEdge(user.id, p, supabase)
    if (!gate.ok && gate.kind === 'contract') {
      return NextResponse.json(
        { error: 'contrato_pendente', redirect: gate.path },
        { status: 403 }
      )
    }
    if (!gate.ok) {
      return NextResponse.json({ error: 'acesso_bloqueado', redirect: gate.path }, { status: 403 })
    }
  }

  if (merchantShell && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', p.startsWith('/dashboard') ? p : '/dashboard')
    return NextResponse.redirect(url)
  }

  const slugSegments = p.split('/').filter(Boolean)
  if (
    slugSegments.length === 1 &&
    !slugSegments[0].includes('.') &&
    !APP_RESERVED_FIRST_SEGMENTS.has(slugSegments[0].toLowerCase())
  ) {
    supabaseResponse.headers.set(
      'Cache-Control',
      'private, no-store, max-age=0, must-revalidate'
    )
  }

  supabaseResponse.headers.set('x-pathname', p)

  supabaseResponse.headers.set('X-Frame-Options', 'DENY')
  supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff')
  supabaseResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  if (process.env.NODE_ENV === 'production') {
    supabaseResponse.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
