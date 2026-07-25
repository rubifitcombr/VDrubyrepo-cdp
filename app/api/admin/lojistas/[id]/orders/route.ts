import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { fetchStoreOrdersForAdmin } from '@/lib/admin-orders-query.server'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id: storeId } = await params
  if (!storeId || storeId.startsWith('orphan:')) {
    return NextResponse.json({ error: 'Loja inválida.' }, { status: 400 })
  }

  const { data: store } = await ctx.svc
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .maybeSingle()

  if (!store) {
    return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })
  }

  const url = new URL(req.url)
  const page = Number(url.searchParams.get('page') || '1')
  const limit = Number(url.searchParams.get('limit') || '50')

  try {
    const result = await fetchStoreOrdersForAdmin(ctx.svc, storeId, {
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 50,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('[admin/lojistas/orders]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao carregar pedidos.' },
      { status: 500 }
    )
  }
}
