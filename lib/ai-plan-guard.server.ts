import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import type { Plan } from '@/lib/plan'

export type GuardOk = { ok: true; userId: string; plan: Plan }
export type GuardFail = { ok: false; status: number; error: string }

export async function requireProMarketingAiStore(
  storeId: string
): Promise<GuardOk | GuardFail> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, status: 401, error: 'Sessão necessária.' }
  }

  const { data: store, error } = await supabase
    .from('stores')
    .select('owner_id, plan')
    .eq('id', storeId)
    .maybeSingle()

  if (error || !store || store.owner_id !== user.id) {
    return { ok: false, status: 403, error: 'Loja não encontrada.' }
  }

  const plan = effectiveDashboardPlan(user.email, store.plan)
  if (plan !== 'PRO' && plan !== 'MASTER') {
    return {
      ok: false,
      status: 403,
      error: 'Marketing com IA disponível nos planos Pro e Master.',
    }
  }

  return { ok: true, userId: user.id, plan }
}
