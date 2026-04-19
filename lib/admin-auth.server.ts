import 'server-only'

import { isVyriaAdminPanelUser } from '@/lib/admin-panel-user'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

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

  let svc: SupabaseClient
  try {
    svc = createServiceRoleClient()
  } catch {
    return {
      ok: false,
      response: Response.json(
        { error: 'Servidor sem SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
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
