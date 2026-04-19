import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { fetchLojistasForAdmin } from '@/lib/admin-lojistas-query.server'

export async function GET(req: NextRequest) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { searchParams } = new URL(req.url)
  const filtro = searchParams.get('filtro') ?? 'todos'
  const q = searchParams.get('q') ?? ''

  try {
    const { metrics, lojistas } = await fetchLojistasForAdmin(ctx.svc, {
      filtro,
      q,
    })
    return NextResponse.json({ ok: true, metrics, lojistas })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao listar'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
