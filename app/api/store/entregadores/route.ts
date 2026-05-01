import { NextRequest, NextResponse } from 'next/server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'
import {
  insertEntregador,
  listEntregadoresForStore,
  updateEntregador,
} from '@/services/store-entregadores.server'
import { createClient } from '@/lib/supabase/server'
import type { EntregadorTipo } from '@/lib/entregas-types'

export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const supabase = await createClient()
  try {
    const items = await listEntregadoresForStore(supabase, gate.ctx.storeId)
    const sorted = [...items].sort((a, b) => {
      if (a.ativo !== b.ativo) return a.ativo ? -1 : 1
      return a.nome.localeCompare(b.nome, 'pt')
    })
    return NextResponse.json({ ok: true, entregadores: sorted })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    if (/relation|does not exist|42P01/i.test(msg)) {
      return NextResponse.json({ ok: true, entregadores: [], missingTable: true })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  let body: { nome?: unknown; telefone?: unknown; tipo?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const nome = typeof body.nome === 'string' ? body.nome.trim() : ''
  if (!nome) {
    return NextResponse.json({ error: 'Nome obrigatório.' }, { status: 400 })
  }
  const telefone =
    typeof body.telefone === 'string' && body.telefone.trim()
      ? body.telefone.trim()
      : null
  const t = String(body.tipo ?? 'fixo').toLowerCase()
  const tipo: EntregadorTipo = t === 'autonomo' ? 'autonomo' : 'fixo'

  const supabase = await createClient()
  try {
    const row = await insertEntregador(supabase, gate.ctx.storeId, {
      nome,
      telefone,
      tipo,
    })
    return NextResponse.json({ ok: true, entregador: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  let body: {
    id?: unknown
    nome?: unknown
    telefone?: unknown
    tipo?: unknown
    ativo?: unknown
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id) return NextResponse.json({ error: 'ID em falta.' }, { status: 400 })

  const patch: Partial<{
    nome: string
    telefone: string | null
    tipo: EntregadorTipo
    ativo: boolean
  }> = {}
  if (typeof body.nome === 'string') patch.nome = body.nome
  if (body.telefone === null || typeof body.telefone === 'string') {
    patch.telefone = body.telefone === null ? null : body.telefone.trim() || null
  }
  if (typeof body.tipo === 'string') {
    patch.tipo = body.tipo.toLowerCase() === 'autonomo' ? 'autonomo' : 'fixo'
  }
  if (typeof body.ativo === 'boolean') patch.ativo = body.ativo

  const supabase = await createClient()
  try {
    const row = await updateEntregador(supabase, gate.ctx.storeId, id, patch)
    return NextResponse.json({ ok: true, entregador: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
