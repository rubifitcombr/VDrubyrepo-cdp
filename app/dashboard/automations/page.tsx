import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { readStorePlano } from '@/lib/store-columns'
import { parseAutomationsFromStore } from '@/lib/store-automations'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { AutomationsClient } from './_components/AutomationsClient'

export default async function AutomationsPage() {
  const user = await getUser()
  if (!user) return null

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-vyria-navy/20 bg-white p-8 text-center">
        <p className="text-sm text-vyria-navy-muted">
          Cria primeiro a tua loja para configurar automações.
        </p>
      </div>
    )
  }

  const row = store as Record<string, unknown>
  const initial = parseAutomationsFromStore(row)
  const rawPlan = readStorePlano(row)
  const plan = effectiveDashboardPlan(user.email ?? null, rawPlan)

  return (
    <AutomationsClient
      storeId={String(row.id)}
      storePlan={plan}
      initial={initial}
    />
  )
}
