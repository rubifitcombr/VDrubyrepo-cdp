import { NextResponse } from 'next/server'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { planTier, type Plan } from '@/lib/plan'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'
import { getStoreByUser } from '@/services/store.server'

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Atualiza apenas o campo `plan` na loja (cobrança manual).
 * Não integra gateway externo.
 */
export async function POST(req: Request) {
  const user = await getUser()
  if (!user) return jsonError('Não autenticado', 401)

  let body: { targetPlan?: string }
  try {
    body = (await req.json()) as { targetPlan?: string }
  } catch {
    return jsonError('JSON inválido', 400)
  }

  const raw = String(body.targetPlan || '').toUpperCase()
  if (
    raw !== 'GROWTH' &&
    raw !== 'PRO' &&
    raw !== 'MASTER' &&
    raw !== 'START'
  ) {
    return jsonError('Plano inválido', 400)
  }
  const targetPlan = raw as Plan

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return jsonError('Loja não encontrada', 404)
  }

  const row = store as Record<string, unknown>
  const rawPlan = row.plan
  const plan = effectiveDashboardPlan(user.email ?? null, rawPlan)

  if (planTier(targetPlan) <= planTier(plan)) {
    return jsonError('Escolhe um plano superior ao atual', 400)
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('stores')
    .update({ plan: targetPlan })
    .eq('id', String(row.id))

  if (error) {
    return jsonError(error.message || 'Erro ao guardar plano', 500)
  }

  return NextResponse.json({ ok: true, plan: targetPlan })
}
