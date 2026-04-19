import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import {
  getDashboardBillingBanner,
  getDashboardBillingBlock,
} from '@/services/billing.server'
import { getDashboardNotificationCount } from '@/services/dashboard.server'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { DashboardShell } from './_components/DashboardShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()
  const store = user ? await getStoreByUser(user.id) : null

  const storeName =
    store && typeof store === 'object' && 'name' in store
      ? (store.name as string)
      : null
  const storeSlug =
    store && typeof store === 'object' && 'slug' in store
      ? (store.slug as string)
      : null

  const storeLogoUrl =
    store &&
    typeof store === 'object' &&
    'logo_url' in store &&
    typeof (store as Record<string, unknown>).logo_url === 'string'
      ? String((store as Record<string, unknown>).logo_url).trim() || null
      : null

  const rawPlan =
    store && typeof store === 'object' && 'plan' in store
      ? (store as Record<string, unknown>).plan
      : undefined
  const plan = effectiveDashboardPlan(user?.email ?? null, rawPlan)

  const storeId =
    store && typeof store === 'object' && 'id' in store
      ? (store.id as string)
      : null
  const notificationCount = storeId
    ? await getDashboardNotificationCount(storeId)
    : 0

  const storeRecord =
    store && typeof store === 'object'
      ? (store as Record<string, unknown>)
      : null
  const billingBlock = storeRecord
    ? getDashboardBillingBlock(storeRecord)
    : null
  const billingBanner =
    !storeRecord || billingBlock
      ? null
      : getDashboardBillingBanner(storeRecord)

  return (
    <DashboardShell
      storeName={storeName}
      storeSlug={storeSlug}
      storeLogoUrl={storeLogoUrl}
      isAuthenticated={!!user}
      plan={plan}
      notificationCount={notificationCount}
      billingBanner={billingBanner}
      billingBlock={billingBlock}
    >
      {children}
    </DashboardShell>
  )
}
