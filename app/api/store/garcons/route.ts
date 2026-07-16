import { NextRequest, NextResponse } from 'next/server'
import { gateMerchantGarconsManagement } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'
import {
  insertGarcom,
  listGarconsForStore,
  updateGarcom,
} from '@/services/store-garcons.server'
import { createClient } from '@/lib/supabase/server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'

function parseEmail(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const v = String(raw).trim()
  if (!v) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null
  return v
}

async function garconsDbClient() {
  return tryCreateServiceRoleClient() ?? (await createClient())
}

function missingGarconsTableMessage(msg: string): boolean {
  return /relation|does not exist|42P01/i.test(msg)
}

function garconsDbErrorResponse(msg: string, status = 500) {
  if (missingGarconsTableMessage(msg)) {
    return NextResponse.json(
      {
        error:
          'Tabela store_garcons não existe. Executa scripts/supabase-store-garcons.sql no Supabase.',
        missingTable: true,
      },
      { status: 503 }
    )
  }
  return NextResponse.json({ error: msg }, { status })
}

export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantGarconsManagement(gate.ctx.store, user.email)
  if (deny) return deny

  const supabase = await garconsDbClient()
  try {
    const items = await listGarconsForStore(supabase, gate.ctx.storeId)
    return NextResponse.json({ ok: true, garcons: items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    if (missingGarconsTableMessage(msg)) {
      return NextResponse.json({ ok: true, garcons: [], missingTable: true })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantGarconsManagement(gate.ctx.store, user.email)
  if (deny) return deny

  let body: { nome?: unknown; email?: unknown; telefone?: unknown; pin?: unknown; pin_ativo?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const nome = typeof body.nome === 'string' ? body.nome.trim() : ''
  if (!nome) {
    return NextResponse.json({ error: 'Nome obrigatório.' }, { status: 400 })
  }

  const emailRaw = typeof body.email === 'string' ? body.email.trim() : ''
  const email = emailRaw ? parseEmail(emailRaw) : null
  if (emailRaw && !email) {
    return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
  }

  const telefone =
    typeof body.telefone === 'string' && body.telefone.trim()
      ? body.telefone.trim()
      : null

  const supabase = await garconsDbClient()
  try {
    const row = await insertGarcom(supabase, gate.ctx.storeId, {
      nome,
      email,
      telefone,
      pin: body.pin,
      pin_ativo: body.pin_ativo,
    })
    return NextResponse.json({ ok: true, garcom: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    return garconsDbErrorResponse(msg)
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantGarconsManagement(gate.ctx.store, user.email)
  if (deny) return deny

  let body: {
    id?: unknown
    nome?: unknown
    email?: unknown
    telefone?: unknown
    ativo?: unknown
    pin?: unknown
    pin_ativo?: unknown
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
    email: string | null
    telefone: string | null
    ativo: boolean
    pin: string | null
    pin_ativo: boolean
  }> = {}

  if (typeof body.nome === 'string') patch.nome = body.nome
  if (body.email === null) patch.email = null
  if (typeof body.email === 'string') {
    const trimmed = body.email.trim()
    if (!trimmed) patch.email = null
    else {
      const parsed = parseEmail(trimmed)
      if (!parsed) {
        return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
      }
      patch.email = parsed
    }
  }
  if (body.telefone === null || typeof body.telefone === 'string') {
    patch.telefone = body.telefone === null ? null : body.telefone.trim() || null
  }
  if (typeof body.ativo === 'boolean') patch.ativo = body.ativo
  if (body.pin === null || typeof body.pin === 'string') {
    patch.pin = body.pin === null ? null : body.pin
  }
  if (typeof body.pin_ativo === 'boolean') patch.pin_ativo = body.pin_ativo

  const supabase = await garconsDbClient()
  try {
    const row = await updateGarcom(supabase, gate.ctx.storeId, id, patch)
    return NextResponse.json({ ok: true, garcom: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    return garconsDbErrorResponse(msg)
  }
}
