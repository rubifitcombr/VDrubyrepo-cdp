import { createClient } from '@supabase/supabase-js'
import { parseMerchantStatus } from '@/lib/merchant-status'
import { isPlanoVencido } from '@/lib/merchant-access-dates'
import { readStorePlano, readStoreStatus } from '@/lib/store-columns'

export type VerificarAcessoResult =
  | { ok: true }
  | { ok: false; redirectPath: string }

/**
 * Equivalente ao middleware Express: bloqueia painel do lojista se não estiver ativo
 * ou se o plano estiver vencido (atualiza para bloqueado no vencimento).
 */
export async function verificarAcessoLojista(userId: string): Promise<VerificarAcessoResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    return { ok: true }
  }

  const svc = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: store, error } = await svc
    .from('stores')
    .select('*')
    .eq('owner_id', userId)
    .maybeSingle()

  if (error || !store) {
    return { ok: false, redirectPath: '/acesso-suspenso?error=pendente' }
  }

  const row = store as Record<string, unknown>
  void readStorePlano(row)
  const status = parseMerchantStatus(readStoreStatus(row))

  if (status !== 'ativo') {
    return { ok: false, redirectPath: `/acesso-suspenso?error=${encodeURIComponent(status)}` }
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
    return { ok: false, redirectPath: '/acesso-suspenso?error=plano_vencido' }
  }

  return { ok: true }
}
