import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { isVyriaAdminPanelUser } from '@/lib/admin-panel-user'
import {
  IMPERSONATION_ACTIVE_COOKIE,
  IMPERSONATION_RESTORE_COOKIE,
} from '@/lib/impersonation'
import { VYRIA_PANEL_MODE_COOKIE } from '@/lib/vyria-panel-mode'

/**
 * Termina a impersonation e restaura a sessão do admin a partir do refresh
 * token guardado no cookie httpOnly. Validamos que a sessão restaurada é mesmo
 * a do utilizador do painel admin antes de devolver o controlo.
 *
 * Fica fora de `/api/admin/*` de propósito: durante a impersonation a sessão
 * ativa é a do lojista, e o proxy bloqueia `/api/admin` para quem não está em
 * modo admin. A rota auto-protege-se pelo cookie de restauro.
 */
export async function POST() {
  const cookieStore = await cookies()
  const restoreToken = cookieStore.get(IMPERSONATION_RESTORE_COOKIE)?.value ?? ''

  const clearImpersonationCookies = () => {
    cookieStore.delete(IMPERSONATION_RESTORE_COOKIE)
    cookieStore.delete(IMPERSONATION_ACTIVE_COOKIE)
  }

  if (!restoreToken) {
    clearImpersonationCookies()
    return NextResponse.json(
      { error: 'Não há sessão de admin para restaurar. Faz login novamente.' },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: restoreToken,
  })

  const restoredUser = data?.user ?? null
  if (error || !restoredUser || !isVyriaAdminPanelUser(restoredUser.id)) {
    // Não conseguimos voltar com segurança: encerrar tudo e pedir login.
    await supabase.auth.signOut()
    clearImpersonationCookies()
    return NextResponse.json(
      {
        error:
          'Não foi possível restaurar a sessão de admin. Inicia sessão novamente no painel.',
        redirectTo: '/login?next=/admin/lojistas',
      },
      { status: 401 }
    )
  }

  clearImpersonationCookies()
  cookieStore.set(VYRIA_PANEL_MODE_COOKIE, 'admin', {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  return NextResponse.json({ ok: true, redirectTo: '/admin/lojistas' })
}
