import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { fetchLojistaDetail } from '@/lib/admin-lojistas-query.server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const detail = await fetchLojistaDetail(ctx.svc, id)
  if (!detail) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, ...detail })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id } = await params
  let body: { name?: string; phone?: string }
  try {
    body = (await req.json()) as { name?: string; phone?: string }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string') {
    patch.name = body.name.trim().slice(0, 200)
  }
  if (typeof body.phone === 'string') {
    patch.phone = body.phone.trim().slice(0, 80)
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
  }

  const { error } = await ctx.svc.from('stores').update(patch).eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const detail = await fetchLojistaDetail(ctx.svc, id)
  return NextResponse.json({ ok: true, lojista: detail?.lojista })
}
