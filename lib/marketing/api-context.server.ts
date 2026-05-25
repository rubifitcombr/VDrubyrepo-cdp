import 'server-only'

import { NextResponse } from 'next/server'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { hasFeature } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'
import { marketingDb } from '@/services/marketing.server'

export async function requireMarketingApiContext() {
  const user = await getUser()
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'login_required' }, { status: 401 }),
    }
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return { ok: false as const, response: gate.response }

  const plan = effectiveDashboardPlan(
    user.email,
    readStorePlano(gate.ctx.store as Record<string, unknown>)
  )
  if (!hasFeature(plan, 'marketing_ads')) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'upgrade_required', redirectTo: '/dashboard/upgrade?recurso=marketing' },
        { status: 403 }
      ),
    }
  }

  return {
    ok: true as const,
    db: await marketingDb(),
    storeId: gate.ctx.storeId,
    store: gate.ctx.store,
    user,
    plan,
  }
}
