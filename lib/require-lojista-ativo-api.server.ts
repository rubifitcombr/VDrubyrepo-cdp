import 'server-only'

import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient as createSessionSupabaseClient } from '@/lib/supabase/server'
import { parseMerchantStatus } from '@/lib/merchant-status'
import { isPlanoVencido } from '@/lib/merchant-access-dates'
import { requiresAnnualContractAcceptance } from '@/lib/annual-contract-acceptance'
import { readStorePlano, readStoreStatus } from '@/lib/store-columns'

function readEnv(...keys: string[]) {
  for (const k of keys) {
    const v = process.env[k]?.trim()
    if (v) return v
  }
  return null
}

function serviceClient(): SupabaseClient | null {
  const url = readEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
  const key = readEnv(
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_SERVICE_ROLE'
  )
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Sem service role: usa o cliente SSR com cookies (mesma sessão do painel).
 * Evita 503 em ambientes só com NEXT_PUBLIC_SUPABASE_* + sessão autenticada.
 */
async function resolveLojistaDbClient(): Promise<
  | { ok: true; svc: SupabaseClient | null; db: SupabaseClient }
  | { ok: false; response: NextResponse }
> {
  const svc = serviceClient()
  if (svc) {
    return { ok: true, svc, db: svc }
  }
  const url = readEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anon) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'configuração do servidor incompleta' },
        { status: 503 }
      ),
    }
  }
  const db = await createSessionSupabaseClient()
  return { ok: true, svc: null, db }
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
  const resolved = await resolveLojistaDbClient()
  if (!resolved.ok) {
    return { ok: false, response: resolved.response }
  }
  const { svc, db } = resolved

  const { data: store, error } = await db
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
      const updater = svc ?? db
      await updater
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

  if (requiresAnnualContractAcceptance(row)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'contrato_pendente', redirect: '/dashboard/contrato' },
        { status: 403 }
      ),
    }
  }

  return {
    ok: true,
    ctx: { storeId: String(row.id), store: row },
  }
}
