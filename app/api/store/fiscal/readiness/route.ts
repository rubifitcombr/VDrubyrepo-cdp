import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/services/auth.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { getStoreFiscalConfig } from '@/services/fiscal.server'
import { getFiscalReadinessForStore } from '@/services/fiscal-readiness.server'

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

export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get('storeId')?.trim() || ''
  if (!storeId) {
    return NextResponse.json({ error: 'storeId é obrigatório.' }, { status: 400 })
  }
  const owned = await requireOwnedStore(storeId)
  if (!owned.ok) return owned.response

  const svc = createServiceRoleClient()
  const cfg = await getStoreFiscalConfig(svc, storeId)
  const readiness = await getFiscalReadinessForStore(svc, storeId)

  return NextResponse.json({
    ok: true,
    status: cfg?.status ?? 'nao_configurado',
    readiness,
  })
}
