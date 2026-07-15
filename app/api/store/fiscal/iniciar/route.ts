import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/services/auth.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { getStoreFiscalConfig } from '@/services/fiscal.server'
import { parseFiscalStatus } from '@/lib/fiscal'

async function requireOwnedStore(storeId: string) {
  const user = await getUser()
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 }),
    }
  }
  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return { ok: false as const, response: gate.response }
  if (storeId !== gate.ctx.storeId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Acesso negado à loja.' }, { status: 403 }),
    }
  }
  return { ok: true as const, storeId: gate.ctx.storeId }
}

/** Inicia o onboarding fiscal após a compra do add-on. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : ''
  if (!storeId) {
    return NextResponse.json({ error: 'storeId é obrigatório.' }, { status: 400 })
  }
  const owned = await requireOwnedStore(storeId)
  if (!owned.ok) return owned.response

  const sefazCredenciado = body.sefazCredenciado === true
  if (!sefazCredenciado) {
    return NextResponse.json(
      {
        error:
          'É necessário possuir credenciamento NFC-e na SEFAZ antes de continuar. Consulte o tutorial ou fale com suporte.',
      },
      { status: 422 }
    )
  }

  const svc = createServiceRoleClient()
  const current = await getStoreFiscalConfig(svc, storeId)
  const curStatus = parseFiscalStatus(current?.status)

  if (curStatus === 'ativo') {
    return NextResponse.json({ ok: true, status: 'ativo', alreadyActive: true })
  }
  if (curStatus === 'bloqueado') {
    return NextResponse.json(
      { error: 'Módulo fiscal bloqueado. Entre em contato com o suporte para reativar.' },
      { status: 403 }
    )
  }

  const nextStatus =
    curStatus === 'pending_review' ? 'pending_review' : 'aguardando_configuracao'

  const { error } = await svc.from('store_fiscal_config').upsert(
    {
      store_id: storeId,
      status: nextStatus,
      sefaz_credenciado: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'store_id' }
  )
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: nextStatus })
}
