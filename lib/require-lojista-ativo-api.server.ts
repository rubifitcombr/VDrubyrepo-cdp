import 'server-only'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseMerchantStatus } from '@/lib/merchant-status'
import { isPlanoVencido } from '@/lib/merchant-access-dates'
import { readStorePlano, readStoreStatus } from '@/lib/store-columns'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type LojistaAtivoContext = {
  storeId: string
  store: Record<string, unknown>
}

/**
 * Para rotas API do painel do lojista: 403 com `error` alinhado ao middleware.
 */
export async function requireLojistaAtivoApi(
  userId: string
): Promise<{ ok: true; ctx: LojistaAtivoContext } | { ok: false; response: NextResponse }> {
  const svc = serviceClient()
  if (!svc) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'configuração do servidor incompleta' },
        { status: 503 }
      ),
    }
  }

  const { data: store, error } = await svc
    .from('stores')
    .select('*')
    .eq('owner_id', userId)
    .maybeSingle()

  if (error || !store) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'pendente' }, { status: 403 }),
    }
  }

  const row = store as Record<string, unknown>
  void readStorePlano(row)
  const status = parseMerchantStatus(readStoreStatus(row))

  if (status !== 'ativo') {
    return {
      ok: false,
      response: NextResponse.json({ error: status }, { status: 403 }),
    }
  }

  const rawVence = row.plano_vence_em
  const vence =
    typeof rawVence === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawVence.trim())
      ? rawVence.trim()
      : null

  if (!vence || isPlanoVencido(vence)) {
    const id = String(row.id ?? '')
    if (id) {
      await svc
        .from('stores')
        .update({
          status: 'bloqueado',
          plano_atualizado_em: new Date().toISOString(),
        })
        .eq('id', id)
    }
    return {
      ok: false,
      response: NextResponse.json({ error: 'plano_vencido' }, { status: 403 }),
    }
  }

  return {
    ok: true,
    ctx: { storeId: String(row.id), store: row },
  }
}
