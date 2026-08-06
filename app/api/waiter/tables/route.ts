import { NextResponse } from 'next/server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'
import {
  STORE_TABLES_SELECT,
  buildStoreTableInsertRow,
  mapActiveStoreTableRows,
  mapStoreTableRow,
  type StoreTableRow,
} from '@/lib/store-tables'

type TableInput = {
  id?: string
  name?: string
  ambiente?: string
  sort_order?: number
  active?: boolean
}

function publicDbError(message: string): string {
  if (/row-level security|violates row-level security policy/i.test(message)) {
    return 'Sem permissão para alterar mesas. Aplica a migração supabase/migrations/20260725190000_salao_mesas_schema.sql no Supabase.'
  }
  return message
}

function tableIdentityKey(ambiente: string, name: string): string {
  return `${ambiente.trim().toLowerCase()}::${name.trim().toLowerCase()}`
}

export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMenuKey(gate.ctx.store, user.email, 'garcom')
  if (deny) return deny

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('store_tables')
    .select(STORE_TABLES_SELECT)
    .eq('store_id', gate.ctx.storeId)
    .order('ambiente', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    if (/does not exist|relation|schema cache/i.test(error.message)) {
      return NextResponse.json({ tables: [], missingTable: true })
    }
    return NextResponse.json({ error: publicDbError(error.message) }, { status: 500 })
  }

  return NextResponse.json({
    tables: mapActiveStoreTableRows((data as Record<string, unknown>[] | null) ?? []),
  })
}

export async function PUT(request: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMenuKey(gate.ctx.store, user.email, 'garcom')
  if (deny) return deny

  // Mesas/setores servem também ao QR de autoatendimento (Growth+); não aplicar denyStaffWaiterPanelWrites aqui.

  let body: { tables?: TableInput[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const inputRows = Array.isArray(body.tables) ? body.tables : []
  const storeId = gate.ctx.storeId
  const supabase = await createClient()

  const cleaned = inputRows
    .map((t, idx) => {
      const sortRaw = Number(t.sort_order)
      return {
        id: typeof t.id === 'string' ? t.id.trim() : '',
        name: String(t.name ?? '').trim(),
        ambiente: String(t.ambiente ?? 'Salão').trim() || 'Salão',
        sort_order: Number.isFinite(sortRaw) ? Math.round(sortRaw) : idx,
        active: t.active !== false,
      }
    })
    .filter((t) => t.name.length > 0 && t.name.length <= 42)

  const { data: existingRows, error: loadErr } = await supabase
    .from('store_tables')
    .select(STORE_TABLES_SELECT)
    .eq('store_id', storeId)

  if (loadErr) {
    if (/does not exist|relation|schema cache/i.test(loadErr.message)) {
      return NextResponse.json(
        {
          error:
            'Tabela store_tables não existe. Aplica a migração supabase/migrations/20260725190000_salao_mesas_schema.sql no Supabase.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: publicDbError(loadErr.message) }, { status: 500 })
  }

  const existing = (existingRows ?? []).map((row) =>
    mapStoreTableRow(row as Record<string, unknown>)
  )
  const byId = new Map<string, StoreTableRow>()
  const byKey = new Map<string, StoreTableRow>()
  for (const row of existing) {
    byId.set(row.id, row)
    byKey.set(tableIdentityKey(row.ambiente, row.name), row)
  }

  const keptIds = new Set<string>()
  const resultTables: StoreTableRow[] = []

  for (const t of cleaned) {
    const key = tableIdentityKey(t.ambiente, t.name)
    const match =
      (t.id && byId.get(t.id)) || byKey.get(key) || null

    if (match) {
      const { data: updated, error: upErr } = await supabase
        .from('store_tables')
        .update({
          nome: t.name,
          name: t.name,
          ambiente: t.ambiente,
          sort_order: t.sort_order,
          ativo: t.active,
          active: t.active,
        })
        .eq('id', match.id)
        .eq('store_id', storeId)
        .select(STORE_TABLES_SELECT)
        .single()

      if (upErr || !updated) {
        return NextResponse.json(
          { error: publicDbError(upErr?.message ?? 'Erro ao actualizar mesa.') },
          { status: 500 }
        )
      }

      const mapped = mapStoreTableRow(updated as Record<string, unknown>)
      keptIds.add(mapped.id)
      byKey.set(tableIdentityKey(mapped.ambiente, mapped.name), mapped)
      resultTables.push(mapped)
      continue
    }

    const { data: inserted, error: insErr } = await supabase
      .from('store_tables')
      .insert(buildStoreTableInsertRow(storeId, t))
      .select(STORE_TABLES_SELECT)
      .single()

    if (insErr || !inserted) {
      return NextResponse.json(
        { error: publicDbError(insErr?.message ?? 'Erro ao criar mesa.') },
        { status: 500 }
      )
    }

    const mapped = mapStoreTableRow(inserted as Record<string, unknown>)
    keptIds.add(mapped.id)
    byKey.set(tableIdentityKey(mapped.ambiente, mapped.name), mapped)
    resultTables.push(mapped)
  }

  const toDelete = existing.filter((row) => !keptIds.has(row.id)).map((row) => row.id)
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('store_tables')
      .delete()
      .eq('store_id', storeId)
      .in('id', toDelete)

    if (delErr) {
      return NextResponse.json({ error: publicDbError(delErr.message) }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    tables: mapActiveStoreTableRows(
      resultTables.map((row) => row as unknown as Record<string, unknown>)
    ),
  })
}
