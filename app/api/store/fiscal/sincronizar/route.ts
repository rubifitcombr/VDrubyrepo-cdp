import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/services/auth.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { cadastrarEmpresa } from '@/services/fiscal'
import { parseFiscalStatus } from '@/lib/fiscal'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { getStoreFiscalConfig } from '@/services/fiscal.server'

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

/** Cadastra/sincroniza a loja na Brasil NFe usando a conta master Vyria. */
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

  const svc = createServiceRoleClient()
  const cfg = await getStoreFiscalConfig(svc, storeId)
  const status = parseFiscalStatus(cfg?.status)
  if (status === 'nao_configurado') {
    return NextResponse.json({ error: 'Inicie a configuração fiscal antes de sincronizar.' }, { status: 422 })
  }
  if (status === 'bloqueado') {
    return NextResponse.json({ error: 'Módulo fiscal bloqueado.' }, { status: 403 })
  }

  const result = await cadastrarEmpresa(storeId)
  if (!result.ok) {
    return NextResponse.json({ error: result.motivo || 'Falha ao sincronizar com a Brasil NFe.' }, { status: 422 })
  }

  return NextResponse.json({ ok: true, sincronizado: true })
}
