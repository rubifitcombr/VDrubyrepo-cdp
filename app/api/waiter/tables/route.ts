import { NextResponse } from 'next/server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { denyStaffWaiterPanelWrites } from '@/lib/waiter-staff-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'

type TableInput = {
  id?: string
  name?: string
  ambiente?: string
  sort_order?: number
  active?: boolean
}

function publicDbError(message: string): string {
  if (/row-level security|violates row-level security policy/i.test(message)) {
    return 'Sem permissão para alterar mesas. Aplica as políticas RLS em sql/store_tables.sql no Supabase.'
  }
  return message
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
    .select('id, store_id, name, ambiente, active, sort_order')
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

  return NextResponse.json({ tables: data ?? [] })
}

export async function PUT(request: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMenuKey(gate.ctx.store, user.email, 'garcom')
  if (deny) return deny

  const denyStaff = denyStaffWaiterPanelWrites(gate.ctx.store, user.email)
  if (denyStaff) return denyStaff

  let body: { tables?: TableInput[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const rows = Array.isArray(body.tables) ? body.tables : []
  const storeId = gate.ctx.storeId
  const supabase = await createClient()

  const cleaned = rows
    .map((t, idx) => ({
      name: String(t.name ?? '').trim(),
      ambiente: String(t.ambiente ?? 'Salão').trim() || 'Salão',
      sort_order: Math.round(Number(t.sort_order) ?? idx),
      active: t.active !== false,
    }))
    .filter((t) => t.name.length > 0 && t.name.length <= 42)

  const { error: delErr } = await supabase.from('store_tables').delete().eq('store_id', storeId)
  if (delErr) {
    if (/does not exist|relation|schema cache/i.test(delErr.message)) {
      return NextResponse.json(
        {
          error:
            'Tabela store_tables não existe. Executa o SQL em sql/store_tables.sql no Supabase.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: publicDbError(delErr.message) }, { status: 500 })
  }

  if (cleaned.length === 0) {
    return NextResponse.json({ ok: true, tables: [] })
  }

  const insertRows = cleaned.map((t) => ({
    store_id: storeId,
    name: t.name,
    ambiente: t.ambiente,
    sort_order: t.sort_order,
    active: t.active,
  }))

  const { data: inserted, error: insErr } = await supabase
    .from('store_tables')
    .insert(insertRows)
    .select('id, store_id, name, ambiente, active, sort_order')

  if (insErr) {
    return NextResponse.json(
      { error: publicDbError(insErr.message ?? 'Erro ao guardar mesas.') },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, tables: inserted ?? [] })
}
