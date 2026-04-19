import { isVyriaAdminPanelUser } from '@/lib/admin-panel-user'
import { createClient } from '@/lib/supabase/server'
import {
  type VyriaPanelMode,
  VYRIA_PANEL_MODE_COOKIE,
} from '@/lib/vyria-panel-mode'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !isVyriaAdminPanelUser(user.id)) {
    return NextResponse.json({ error: 'Proibido' }, { status: 403 })
  }

  let body: { mode?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const mode: VyriaPanelMode | null =
    body.mode === 'admin' || body.mode === 'lojista' ? body.mode : null
  if (!mode) {
    return NextResponse.json(
      { error: 'mode deve ser "admin" ou "lojista"' },
      { status: 400 }
    )
  }

  const cookieStore = await cookies()
  cookieStore.set(VYRIA_PANEL_MODE_COOKIE, mode, {
    path: '/',
    maxAge: 60 * 60 * 24 * 400,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  })

  return NextResponse.json({ ok: true, mode })
}
