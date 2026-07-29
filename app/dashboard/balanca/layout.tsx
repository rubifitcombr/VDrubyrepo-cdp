import { redirect } from 'next/navigation'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { parseOperationModeFromStore } from '@/lib/merchant-operation-mode'
import { hasScaleIntegration } from '@/lib/scale/gate'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'

export default async function BalancaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()
  if (!user) return null

  const store = await getStoreByUser(user.id)
  const row =
    store && typeof store === 'object' ? (store as Record<string, unknown>) : null
  const plan = effectiveDashboardPlan(user.email, row ? readStorePlano(row) : undefined)
  const operationMode = row ? parseOperationModeFromStore(row) : null

  if (!hasScaleIntegration(plan, operationMode)) {
    redirect('/dashboard/upgrade?feature=scale_integration')
  }

  return children
}
