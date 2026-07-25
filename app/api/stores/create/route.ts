import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import { resolveUniqueStoreSlug } from '@/lib/store-slug.server'
import { slugifyStoreSlug } from '@/lib/store-slug'
import { parseOperationModeInput } from '@/lib/merchant-operation-mode'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    }

    const body = (await req.json()) as {
      name?: string
      phone?: string
      operation_mode?: string | null
    }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const phone =
      typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null

    if (!name) {
      return NextResponse.json({ error: 'Nome da loja é obrigatório.' }, { status: 400 })
    }

    const mode = parseOperationModeInput(body.operation_mode)
    if (!mode) {
      return NextResponse.json(
        {
          error:
            'Modelo de operação é obrigatório. Escolhe delivery, presencial ou hibrido.',
        },
        { status: 400 }
      )
    }

    const svc = tryCreateServiceRoleClient()
    const db = svc ?? (await createClient())

    const { data: existing } = await db
      .from('stores')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle()
    if (existing?.id) {
      return NextResponse.json(
        { ok: true, id: String(existing.id), skipped: true },
        { status: 200 }
      )
    }

    const uniqueSlug = await resolveUniqueStoreSlug(db, slugifyStoreSlug(name))
    const row: Record<string, unknown> = {
      name,
      slug: uniqueSlug,
      owner_id: user.id,
      status: 'pendente',
      merchant_status: 'pendente',
      plano: 'growth',
      operation_mode: mode,
      ...(phone ? { phone } : {}),
    }
    let { data, error } = await db.from('stores').insert(row).select('id, slug').single()
    if (error && /merchant_status|column|schema cache/i.test(error.message)) {
      const { merchant_status: _m, ...withoutMerchant } = row
      void _m
      ;({ data, error } = await db
        .from('stores')
        .insert(withoutMerchant)
        .select('id, slug')
        .single())
    }

    if (error) {
      const msg = error.message || ''
      const missingCol =
        /operation_mode|column/i.test(msg) && /does not exist|schema cache/i.test(msg)
      return NextResponse.json(
        {
          error: missingCol
            ? 'Coluna operation_mode em falta na base de dados. Contacta o suporte Vyria.'
            : msg || 'Erro ao criar loja.',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
