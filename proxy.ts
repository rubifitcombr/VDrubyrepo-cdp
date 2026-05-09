import { isAuthPortalHost } from '@/lib/auth-portal-host'
import { APP_RESERVED_FIRST_SEGMENTS } from '@/lib/app-reserved-routes'
import { createServerClient } from '@supabase/ssr'
import { isVyriaAdminPanelUser } from '@/lib/admin-panel-user'
import {
  parseVyriaPanelMode,
  VYRIA_PANEL_MODE_COOKIE,
} from '@/lib/vyria-panel-mode'
import { verificarAcessoLojista } from '@/middleware/verificarAcesso'
import { NextResponse, type NextRequest } from 'next/server'

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

  const segments = rawPath.split('/').filter(Boolean)
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

  const p = rawPath
  const isAuthPage = p === '/login' || p === '/register'
  const vyriaPanelMode = parseVyriaPanelMode(
    request.cookies.get(VYRIA_PANEL_MODE_COOKIE)?.value
  )
  const vyriaInAdminMode =
    !!user &&
    isVyriaAdminPanelUser(user.id) &&
    vyriaPanelMode === 'admin'

  if (isAuthPage && user) {
    if (vyriaInAdminMode) {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
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

  if (merchantShell && user) {
    const skipLojistaCheck =
      isVyriaAdminPanelUser(user.id) && vyriaPanelMode === 'admin'
    if (!skipLojistaCheck) {
      const access = await verificarAcessoLojista(user.id)
      if (!access.ok) {
        return NextResponse.redirect(new URL(access.redirectPath, request.url))
      }
    }
  }

  if (merchantShell && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', p)
    return NextResponse.redirect(url)
  }

  /** Cardápio público /[slug]: evita CDN/browser servir 404 ou HTML antigo em mobile. */
  const slugSegments = rawPath.split('/').filter(Boolean)
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

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
