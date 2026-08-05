import 'server-only'

import { NextResponse } from 'next/server'
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

async function resolveLojistaDbClient(): Promise<
  | { ok: true; db: Awaited<ReturnType<typeof createSessionSupabaseClient>> }
  | { ok: false; response: NextResponse }
> {
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
  return { ok: true, db }
}

export type LojistaAtivoContext = {
  storeId: string
  store: Record<string, unknown>
}

/**
 * Para rotas API do painel do lojista: 403 com `error` alinhado ao middleware.
 * Usa sempre a sessão autenticada (RLS) — nunca service role.
 */
export async function requireLojistaAtivoApi(
  userId: string
): Promise<{ ok: true; ctx: LojistaAtivoContext } | { ok: false; response: NextResponse }> {
  const resolved = await resolveLojistaDbClient()
  if (!resolved.ok) {
    return { ok: false, response: resolved.response }
  }
  const { db } = resolved

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

/**
 * Cancelamento de assinatura: permite loja `ativo` ou `bloqueado` (não exige plano válido).
 */
export async function requireLojistaCancelamentoApi(
  userId: string
): Promise<{ ok: true; ctx: LojistaAtivoContext } | { ok: false; response: NextResponse }> {
  const resolved = await resolveLojistaDbClient()
  if (!resolved.ok) {
    return { ok: false, response: resolved.response }
  }
  const { db } = resolved

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
  const status = parseMerchantStatus(readStoreStatus(row))

  if (status !== 'ativo' && status !== 'bloqueado') {
    return {
      ok: false,
      response: NextResponse.json({ error: status }, { status: 403 }),
    }
  }

  return {
    ok: true,
    ctx: { storeId: String(row.id), store: row },
  }
}
