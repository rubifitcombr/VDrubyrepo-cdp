import { redirect } from 'next/navigation'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { hasFeature } from '@/lib/plan'

export default async function PrintingLayout({
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
  const plan = effectiveDashboardPlan(user.email, rawPlan)

  if (!hasFeature(plan, 'printing')) {
    redirect('/dashboard/upgrade?feature=printing')
  }

  return children
}

