import { resolveMenuImageUrl } from '@/lib/menu-image-url'
import { isVyriaAdminPanelUser } from '@/lib/admin-panel-user'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import {
  parseVyriaPanelMode,
  shouldApplyLojistaRulesForVyriaUser,
  VYRIA_PANEL_MODE_COOKIE,
} from '@/lib/vyria-panel-mode'
import { getDashboardAccessRedirectPath } from '@/lib/merchant-access-redirect.server'
import { readStorePlano } from '@/lib/store-columns'
import { dashboardUsesSlugChannelOrdersOnly } from '@/lib/slug-channel-orders'
import {
  getDashboardBillingBanner,
  getDashboardBillingBlock,
} from '@/services/billing.server'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { hasOrderPipelineAutomations } from '@/lib/plan'
import {
  isDeliveryPipelineEnabled,
  parseOperationModeFromStore,
} from '@/lib/merchant-operation-mode'
import { parseAutomationsFromStore } from '@/lib/store-automations'
import { parsePrintingFromStore } from '@/lib/store-printing'
import { parseHubPinConfig } from '@/lib/hub-shortcut-pin'
import { requiresAnnualContractAcceptance } from '@/lib/annual-contract-acceptance'
import {
  IMPERSONATION_ACTIVE_COOKIE,
} from '@/lib/impersonation'
import { openImpersonationContext } from '@/lib/impersonation-sign.server'
import { createClient } from '@/lib/supabase/server'
import { syncAutoCloseOutsideHoursForStore } from '@/services/store-hours-automation.server'
import { cookies } from 'next/headers'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { ServiceWorkerRegister } from '@/app/_components/ServiceWorkerRegister'
import { DashboardShell } from './_components/DashboardShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()
  if (!user) redirect('/login?next=/dashboard')

  const store = user ? await getStoreByUser(user.id) : null

  const cookieStore = await cookies()
  const vyriaPanelMode = parseVyriaPanelMode(
    cookieStore.get(VYRIA_PANEL_MODE_COOKIE)?.value
  )
  const impersonation = openImpersonationContext(
    cookieStore.get(IMPERSONATION_ACTIVE_COOKIE)?.value
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
      ? resolveMenuImageUrl(
          (store as Record<string, unknown>).logo_url,
          store && typeof store === 'object' && 'id' in store
            ? String(store.id)
            : null
        )
      : null

  const rawPlan =
    store && typeof store === 'object'
      ? readStorePlano(store as Record<string, unknown>)
      : undefined
  const plan = effectiveDashboardPlan(user?.email ?? null, rawPlan)

  const storeRecordPreSync: Record<string, unknown> | null =
    store && typeof store === 'object'
      ? (store as Record<string, unknown>)
      : null
  const slugChannelSourcesOnly = dashboardUsesSlugChannelOrdersOnly(
    plan,
    storeRecordPreSync
      ? parseOperationModeFromStore(storeRecordPreSync)
      : null
  )

  const storeId =
    store && typeof store === 'object' && 'id' in store
      ? (store.id as string)
      : null

  const storeRecord: Record<string, unknown> | null = storeRecordPreSync

  if (storeRecord && user) {
    const supabase = await createClient()
    after(async () => {
      await syncAutoCloseOutsideHoursForStore(storeRecord!, supabase)
    })
  }

  // Contagem no topbar já actualiza em tempo real no client — não bloquear navegação.
  const notificationCount = 0

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
  const deliveryPipelineEnabled = storeRecord
    ? isDeliveryPipelineEnabled(operationMode)
    : true

  const storeAutomations = storeRecord
    ? parseAutomationsFromStore(storeRecord)
    : null
  const orderPipelineAutomationsEnabled = hasOrderPipelineAutomations(plan)
  const autoAcceptPrinting = storeRecord
    ? parsePrintingFromStore(storeRecord)
    : parsePrintingFromStore({})

  const headerList = await headers()
  const pathname = headerList.get('x-pathname') ?? ''
  const isContratoRoute =
    pathname === '/dashboard/contrato' || pathname.startsWith('/dashboard/contrato/')

  if (
    storeRecord &&
    !isContratoRoute &&
    requiresAnnualContractAcceptance(storeRecord)
  ) {
    redirect('/dashboard/contrato')
  }

  if (isContratoRoute) {
    return <>{children}</>
  }

  return (
    <Suspense fallback={null}>
      <DashboardShell
        storeName={storeName}
        storeSlug={storeSlug}
        storeLogoUrl={storeLogoUrl}
        storeId={storeId}
        isAuthenticated={!!user}
        plan={plan}
        notificationCount={notificationCount}
        slugChannelSourcesOnly={slugChannelSourcesOnly}
        billingBanner={billingBanner}
        billingBlock={billingBlock}
        vyriaDualAccount={vyriaDualAccount}
        operationMode={operationMode}
        deliveryPipelineEnabled={deliveryPipelineEnabled}
        disableAutoAccept={!!billingBlock}
        notifyOnNewOrder={
          !!(
            storeRecord &&
            orderPipelineAutomationsEnabled &&
            storeAutomations?.auto_notify_new_order
          )
        }
        autoAcceptOrders={
          !!(
            storeRecord &&
            orderPipelineAutomationsEnabled &&
            storeAutomations?.auto_accept_orders
          )
        }
        autoAcceptPrinting={autoAcceptPrinting}
        manualClosed={storeRecord?.manual_closed === true}
        autoAcceptStoreName={autoAcceptStoreName}
      hubPinConfig={parseHubPinConfig(storeRecord)}
      impersonatingStoreName={impersonation?.storeName ?? null}
      >
        <ServiceWorkerRegister />
        {children}
      </DashboardShell>
    </Suspense>
  )
}
