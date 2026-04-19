import { isVyriaAdminPanelUser } from '@/lib/admin-panel-user'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import {
  parseVyriaPanelMode,
  shouldApplyLojistaRulesForVyriaUser,
  VYRIA_PANEL_MODE_COOKIE,
} from '@/lib/vyria-panel-mode'
import { getDashboardAccessRedirectPath } from '@/lib/merchant-access-redirect.server'
import { readStorePlano } from '@/lib/store-columns'
import {
  getDashboardBillingBanner,
  getDashboardBillingBlock,
} from '@/services/billing.server'
import { getDashboardNotificationCount } from '@/services/dashboard.server'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DashboardShell } from './_components/DashboardShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()
  const store = user ? await getStoreByUser(user.id) : null

  const cookieStore = await cookies()
  const vyriaPanelMode = parseVyriaPanelMode(
    cookieStore.get(VYRIA_PANEL_MODE_COOKIE)?.value
  )

  if (
    user &&
    shouldApplyLojistaRulesForVyriaUser(user.id, vyriaPanelMode)
  ) {
    const path = getDashboardAccessRedirectPath(
      store && typeof store === 'object'
        ? (store as Record<string, unknown>)
        : null
    )
    if (path) redirect(path)
  }

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
    store && typeof store === 'object'
      ? readStorePlano(store as Record<string, unknown>)
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

  const vyriaDualAccount =
    user && isVyriaAdminPanelUser(user.id)
      ? { mode: vyriaPanelMode }
      : undefined

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
      vyriaDualAccount={vyriaDualAccount}
    >
      {children}
    </DashboardShell>
  )
}
