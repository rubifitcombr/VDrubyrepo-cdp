import { NextResponse } from 'next/server'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { planTier, type Plan } from '@/lib/plan'
import { planToPlanoColumn } from '@/lib/plano-db'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'

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

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  let body: { targetPlan?: string }
  try {
    body = (await req.json()) as { targetPlan?: string }
  } catch {
    return jsonError('JSON inválido', 400)
  }

  const raw = String(body.targetPlan || '').toUpperCase()
  if (raw !== 'GROWTH' && raw !== 'PRO' && raw !== 'START') {
    return jsonError('Plano inválido', 400)
  }
  const targetPlan = raw as Plan

  const row = gate.ctx.store
  const rawPlan = readStorePlano(row)
  const plan = effectiveDashboardPlan(user.email ?? null, rawPlan)

  if (planTier(targetPlan) <= planTier(plan)) {
    return jsonError('Escolhe um plano superior ao atual', 400)
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('stores')
    .update({ plano: planToPlanoColumn(targetPlan) })
    .eq('id', gate.ctx.storeId)

  if (error) {
    return jsonError(error.message || 'Erro ao guardar plano', 500)
  }

  return NextResponse.json({ ok: true, plan: targetPlan })
}
