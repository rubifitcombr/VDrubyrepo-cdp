import { redirect } from 'next/navigation'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { hasAutomationAccess } from '@/lib/plan'

export default async function AutomationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const store = await getStoreByUser(user.id)
  const rawPlan =
    store && typeof store === 'object'
      ? readStorePlano(store as Record<string, unknown>)
      : undefined
  const plan = effectiveDashboardPlan(user.email, rawPlan)

  if (!hasAutomationAccess(plan)) {
    redirect('/dashboard/upgrade?feature=automations')
  }

  return children
}

