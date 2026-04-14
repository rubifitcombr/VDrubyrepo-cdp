import { redirect } from 'next/navigation'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { hasFeature } from '@/lib/plan'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'

export default async function KdsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const store = await getStoreByUser(user.id)
  const rawPlan =
    store && typeof store === 'object' && 'plan' in store
      ? (store as Record<string, unknown>).plan
      : undefined
  const plan = effectiveDashboardPlan(user.email ?? null, rawPlan)

  if (!hasFeature(plan, 'kds')) {
    redirect('/dashboard/upgrade?feature=kds')
  }

  return children
}
