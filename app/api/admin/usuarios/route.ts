import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { fetchAuthUsersForAdmin } from '@/lib/admin-auth-users.server'

export async function GET(req: NextRequest) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const q = req.nextUrl.searchParams.get('q') ?? ''

  try {
    const snapshot = await fetchAuthUsersForAdmin(ctx.svc, q)
    return NextResponse.json({ ok: true, ...snapshot })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao listar utilizadores Auth'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
