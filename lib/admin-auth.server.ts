import 'server-only'

import { isVyriaAdminPanelUser } from '@/lib/admin-panel-user'
import { createClient } from '@/lib/supabase/server'
import {
  parseVyriaPanelMode,
  VYRIA_PANEL_MODE_COOKIE,
} from '@/lib/vyria-panel-mode'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

export async function requireAdminApi(): Promise<
  | { ok: true; user: User; svc: SupabaseClient }
  | { ok: false; response: Response }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: 'Não autenticado' }, { status: 401 }),
    }
  }

  if (!isVyriaAdminPanelUser(user.id)) {
    return {
      ok: false,
      response: Response.json({ error: 'Acesso negado' }, { status: 403 }),
    }
  }

  const cookieStore = await cookies()
  if (parseVyriaPanelMode(cookieStore.get(VYRIA_PANEL_MODE_COOKIE)?.value) !== 'admin') {
    return {
      ok: false,
      response: Response.json(
        { error: 'Ativa o modo admin para usar esta API.' },
        { status: 403 }
      ),
    }
  }

  const svc = tryCreateServiceRoleClient()
  if (!svc) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'Painel admin inacessível: falta a chave de serviço Supabase no servidor. Define SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE) juntamente com NEXT_PUBLIC_SUPABASE_URL — necessário para listar e gerir todas as lojas e utilizadores.',
          code: 'MISSING_SUPABASE_SERVICE_ROLE',
        },
        { status: 503 }
      ),
    }
  }

  return { ok: true, user, svc }
}

/** Para layouts server: redireciona em vez de Response. */
export async function requireAdminPage(): Promise<
  { ok: true; user: User; email: string | null } | { redirect: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { redirect: '/login' }

  if (!isVyriaAdminPanelUser(user.id)) {
    return { redirect: '/dashboard' }
  }

  const cookieStore = await cookies()
  if (parseVyriaPanelMode(cookieStore.get(VYRIA_PANEL_MODE_COOKIE)?.value) !== 'admin') {
    return { redirect: '/dashboard' }
  }

  const email = user.email ?? null
  return { ok: true, user, email }
}

export async function assertAdminLayout(): Promise<{
  user: User
  email: string | null
}> {
  const r = await requireAdminPage()
  if ('redirect' in r) {
    redirect(r.redirect)
  }
  return { user: r.user, email: r.email }
}
