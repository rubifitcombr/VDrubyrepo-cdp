import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { buildUniqueSlugPlanForAllStores } from '@/lib/store-slug.server'
import { insertAdminLogFromRequest } from '@/services/admin-logs.server'

export const dynamic = 'force-dynamic'

type StoreRow = {
  id: string
  name: string | null
  slug: string | null
}

export async function POST(req: Request) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { data, error } = await ctx.svc
    .from('stores')
    .select('id, name, slug')
    .order('id', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = ((data as StoreRow[] | null) ?? []).map((row) => ({
    id: String(row.id),
    name: row.name ?? null,
    slug: row.slug ?? null,
  }))
  const plan = buildUniqueSlugPlanForAllStores(rows)

  let updated = 0
  for (const row of rows) {
    const next = plan.get(row.id)
    if (!next) continue
    const current = (row.slug ?? '').trim()
    if (current === next) continue

    const { error: upErr } = await ctx.svc
      .from('stores')
      .update({ slug: next })
      .eq('id', row.id)
    if (upErr) {
      return NextResponse.json(
        {
          error: `Falha ao atualizar slug da loja ${row.id}: ${upErr.message}`,
        },
        { status: 500 }
      )
    }
    updated += 1
  }

  try {
    await insertAdminLogFromRequest(ctx.svc, req, {
      adminId: ctx.user.id,
      lojistaId: '00000000-0000-0000-0000-000000000000',
      acao: 'repair_slugs',
      detalhes: `Slugs reparados: ${updated}/${rows.length} lojas`,
    })
  } catch {
    /* log opcional */
  }

  return NextResponse.json({
    ok: true,
    total: rows.length,
    updated,
  })
}
