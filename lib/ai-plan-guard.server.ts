import 'server-only'

import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import {
  hasMarketingAiDescription,
  hasProMarketingAi,
  type Plan,
} from '@/lib/plan'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'

export type GuardOk = { ok: true; userId: string; plan: Plan }
export type GuardFail = { ok: false; status: number; error: string }

async function requireOwnedActiveStorePlan(
  storeId: string
): Promise<GuardOk | GuardFail> {
  const user = await getUser()

  if (!user) {
    return { ok: false, status: 401, error: 'Sessão necessária.' }
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) {
    let err = 'Acesso suspenso.'
    try {
      const j = (await gate.response.clone().json()) as { error?: string }
      if (typeof j.error === 'string') err = j.error
    } catch {
      /* ignore */
    }
    return { ok: false, status: gate.response.status, error: err }
  }

  if (gate.ctx.storeId !== storeId) {
    return { ok: false, status: 403, error: 'Loja não encontrada.' }
  }

  const plan = effectiveDashboardPlan(
    user.email,
    readStorePlano(gate.ctx.store)
  )
  return { ok: true, userId: user.id, plan }
}

export async function requireMarketingAiDescriptionStore(
  storeId: string
): Promise<GuardOk | GuardFail> {
  const base = await requireOwnedActiveStorePlan(storeId)
  if (!base.ok) return base
  if (!hasMarketingAiDescription(base.plan)) {
    return {
      ok: false,
      status: 403,
      error: 'Descrição com IA disponível a partir do plano Growth.',
    }
  }
  return base
}

export async function requireProMarketingAiStore(
  storeId: string
): Promise<GuardOk | GuardFail> {
  const base = await requireOwnedActiveStorePlan(storeId)
  if (!base.ok) return base
  if (!hasProMarketingAi(base.plan)) {
    return {
      ok: false,
      status: 403,
      error: 'Geração de imagem com IA disponível a partir do plano Pro.',
    }
  }
  return base
}
