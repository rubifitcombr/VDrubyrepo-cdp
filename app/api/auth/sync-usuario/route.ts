import { NextResponse } from 'next/server'
import { getUser } from '@/services/auth.server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'

export const dynamic = 'force-dynamic'

/**
 * Garante linha em public.usuarios após registo/login (fallback se o trigger em auth.users falhar).
 * Requer sessão; usa service role no servidor (nunca expõe a chave ao cliente).
 */
export async function POST() {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const svc = tryCreateServiceRoleClient()
  if (!svc) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { error } = await svc.from('usuarios').upsert(
    {
      id: user.id,
      email: user.email ?? null,
    },
    { onConflict: 'id' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
