import { APP_RESERVED_FIRST_SEGMENTS } from '@/lib/app-reserved-routes'
import { createServerClient } from '@supabase/ssr'
import { isVyriaAdminPanelUser } from '@/lib/admin-panel-user'
import {
  parseVyriaPanelMode,
  VYRIA_PANEL_MODE_COOKIE,
} from '@/lib/vyria-panel-mode'
import { verificarAcessoLojista } from '@/middleware/verificarAcesso'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const rawPath = request.nextUrl.pathname
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
      // 30 dias para manter sessão entre fechamentos do navegador.
      lifetime: 60 * 60 * 24 * 30,
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

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
