import { NextResponse } from 'next/server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'
import { getOpenCaixaTurno } from '@/services/caixa-turnos.server'
import { createClient } from '@/lib/supabase/server'

function parseMoney(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v * 100) / 100
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.').trim())
    if (Number.isFinite(n) && n >= 0) return Math.round(n * 100) / 100
  }
  return 0
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMenuKey(gate.ctx.store, user.email, 'caixa')
  if (deny) return deny

  let body: { fundoInicial?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const fundoInicial = parseMoney(body.fundoInicial ?? 0)
  const operador =
    (typeof user.email === 'string' && user.email.trim()) ||
    (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
    'operador'

  const supabase = await createClient()
  const storeId = gate.ctx.storeId

  const existing = await getOpenCaixaTurno(supabase, storeId)
  if (existing) {
    return NextResponse.json(
      { error: 'Já existe um turno aberto para esta loja.' },
      { status: 409 }
    )
  }

  const { data, error } = await supabase
    .from('caixas_turnos')
    .insert({
      store_id: storeId,
      operador,
      fundo_inicial: fundoInicial,
      status: 'aberto',
    })
    .select('*')
    .single()

  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json(
        {
          error:
            'Tabelas de caixa não encontradas. Aplica a migração SQL em supabase/migrations no teu projeto Supabase.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: error.message ?? 'Não foi possível abrir o turno.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, turno: data })
}
