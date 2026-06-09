import { redirect } from 'next/navigation'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { hasFeature } from '@/lib/plan'

export default async function OrdersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()
  if (!user) return null

  const store = await getStoreByUser(user.id)
  const rawPlan =
    store && typeof store === 'object'
      ? readStorePlano(store as Record<string, unknown>)
      : undefined
  const plan = effectiveDashboardPlan(user.email, rawPlan)

  if (!hasFeature(plan, 'orders')) {
    redirect('/dashboard/upgrade?feature=orders')
  }

  return children
}

