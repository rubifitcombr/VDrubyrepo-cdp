import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/services/auth.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { getStoreFiscalConfig } from '@/services/fiscal.server'
import { getFiscalReadinessForStore } from '@/services/fiscal-readiness.server'
import { parseFiscalStatus } from '@/lib/fiscal'

/** Valida o checklist e envia a loja para aprovação do admin. */
export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  }
  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

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
  if (storeId !== gate.ctx.storeId) {
    return NextResponse.json({ error: 'Acesso negado à loja.' }, { status: 403 })
  }

  const svc = createServiceRoleClient()
  const cfg = await getStoreFiscalConfig(svc, storeId)
  const status = parseFiscalStatus(cfg?.status)

  if (status === 'ativo') {
    return NextResponse.json({ ok: true, status: 'ativo', alreadyActive: true })
  }
  if (status === 'bloqueado') {
    return NextResponse.json({ error: 'Módulo fiscal bloqueado.' }, { status: 403 })
  }
  if (status === 'pending_review') {
    return NextResponse.json({ ok: true, status: 'pending_review', alreadySubmitted: true })
  }

  const readiness = await getFiscalReadinessForStore(svc, storeId)
  if (!readiness.ready) {
    const pending = readiness.items.filter((i) => !i.ok && i.id !== 'pronto_emissao')
    return NextResponse.json(
      {
        error: 'A configuração fiscal ainda não está completa.',
        readiness,
        pending: pending.map((i) => ({ id: i.id, label: i.label, hint: i.hint })),
      },
      { status: 422 }
    )
  }

  const { error } = await svc
    .from('store_fiscal_config')
    .update({ status: 'pending_review', updated_at: new Date().toISOString() })
    .eq('store_id', storeId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: 'pending_review' })
}
