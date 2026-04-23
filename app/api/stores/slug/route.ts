import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import { resolveUniqueStoreSlug } from '@/lib/store-slug.server'
import { slugifyStoreSlug } from '@/lib/store-slug'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    }

    const body = (await req.json()) as { storeId?: string; slug?: string }
    const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : ''
    const wanted = typeof body.slug === 'string' ? body.slug.trim() : ''
    if (!storeId || !wanted) {
      return NextResponse.json({ error: 'storeId e slug são obrigatórios.' }, { status: 400 })
    }

    const svc = tryCreateServiceRoleClient()
    const db = svc ?? supabase

    const { data: owned, error: ownErr } = await db
      .from('stores')
      .select('id')
      .eq('id', storeId)
      .eq('owner_id', user.id)
      .maybeSingle()
    if (ownErr || !owned?.id) {
      return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })
    }

    const uniqueSlug = await resolveUniqueStoreSlug(db, slugifyStoreSlug(wanted), storeId)
    const { data: updated, error: upErr } = await db
      .from('stores')
      .update({ slug: uniqueSlug })
      .eq('id', storeId)
      .eq('owner_id', user.id)
      .select('slug')
      .single()

    if (upErr) {
      return NextResponse.json(
        { error: upErr.message || 'Não foi possível atualizar o slug.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, slug: String(updated.slug ?? uniqueSlug) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
