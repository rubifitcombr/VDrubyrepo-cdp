import { createServerClient } from '@supabase/ssr'
import { isVyriaAdminPanelUser } from '@/lib/admin-panel-user'
import { verificarAcessoLojista } from '@/middleware/verificarAcesso'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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

  const p = request.nextUrl.pathname

  if (p.startsWith('/api/admin')) {
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    if (!isVyriaAdminPanelUser(user.id)) {
      return NextResponse.json({ error: 'Proibido' }, { status: 403 })
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
  }

  if (p.startsWith('/dashboard') && user) {
    if (!isVyriaAdminPanelUser(user.id)) {
      const access = await verificarAcessoLojista(user.id)
      if (!access.ok) {
        return NextResponse.redirect(new URL(access.redirectPath, request.url))
      }
    }
  }

  if (p.startsWith('/dashboard') && !user) {
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
