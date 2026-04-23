import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isVyriaAdminPanelUser } from '@/lib/admin-panel-user'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import { buildUniqueSlugPlanForAllStores } from '@/lib/store-slug.server'

export const dynamic = 'force-dynamic'

type StoreRow = {
  id: string
  name: string | null
  slug: string | null
}

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }
    if (!isVyriaAdminPanelUser(user.id)) {
      return NextResponse.json({ error: 'Proibido.' }, { status: 403 })
    }

    const svc = tryCreateServiceRoleClient()
    if (!svc) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY não configurada.' },
        { status: 503 }
      )
    }

    const { data, error } = await svc
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

      const { error: upErr } = await svc
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

    return NextResponse.json({
      ok: true,
      total: rows.length,
      updated,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
