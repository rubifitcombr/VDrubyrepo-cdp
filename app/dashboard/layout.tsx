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
import { hasOrderPipelineAutomations } from '@/lib/plan'
import { parseOperationModeFromStore } from '@/lib/merchant-operation-mode'
import { parseAutomationsFromStore } from '@/lib/store-automations'
import { parsePrintingFromStore } from '@/lib/store-printing'
import { createClient } from '@/lib/supabase/server'
import { syncAutoCloseOutsideHoursForStore } from '@/services/store-hours-automation.server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ServiceWorkerRegister } from '@/app/_components/ServiceWorkerRegister'
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

  let storeRecord: Record<string, unknown> | null =
    store && typeof store === 'object'
      ? (store as Record<string, unknown>)
      : null

  if (storeRecord && user) {
    const supabase = await createClient()
    const synced = await syncAutoCloseOutsideHoursForStore(storeRecord, supabase)
    if (typeof synced === 'boolean') {
      storeRecord = { ...storeRecord, manual_closed: synced }
    }
  }

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

  const autoAcceptStoreName =
    (typeof storeName === 'string' && storeName.trim()) ||
    'Meu estabelecimento'

  const operationMode = storeRecord
    ? parseOperationModeFromStore(storeRecord)
    : null

  return (
    <DashboardShell
      storeName={storeName}
      storeSlug={storeSlug}
      storeLogoUrl={storeLogoUrl}
      storeId={storeId}
      isAuthenticated={!!user}
      plan={plan}
      notificationCount={notificationCount}
      billingBanner={billingBanner}
      billingBlock={billingBlock}
      vyriaDualAccount={vyriaDualAccount}
      operationMode={operationMode}
      disableAutoAccept={!!billingBlock}
      notifyOnNewOrder={
        !!(
          storeRecord &&
          hasOrderPipelineAutomations(plan) &&
          parseAutomationsFromStore(storeRecord).auto_notify_new_order
        )
      }
      autoAcceptOrders={
        !!(
          storeRecord &&
          hasOrderPipelineAutomations(plan) &&
          parseAutomationsFromStore(storeRecord).auto_accept_orders
        )
      }
      autoAcceptPrinting={
        storeRecord
          ? parsePrintingFromStore(storeRecord)
          : parsePrintingFromStore({})
      }
      businessHours={storeRecord?.business_hours}
      manualClosed={storeRecord?.manual_closed === true}
      autoAcceptStoreName={autoAcceptStoreName}
    >
      <ServiceWorkerRegister />
      {children}
    </DashboardShell>
  )
}
