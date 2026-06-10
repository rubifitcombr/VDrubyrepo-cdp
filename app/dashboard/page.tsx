import Link from 'next/link'
import { OperationalHubClient } from './_components/OperationalHubClient'
import { menuKeysForMerchant } from '@/lib/dashboard-menu'
import type { DashboardMenuKey } from '@/lib/dashboard-menu-types'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { parseHubPinConfig } from '@/lib/hub-shortcut-pin'
import { parseOperationModeFromStore } from '@/lib/merchant-operation-mode'
import {
  isHubContextVisible,
  isHubMenuKeyVisible,
  shouldShowDigitalMenuShortcut,
} from '@/lib/operational-hub-navigation'
import { readStorePlano } from '@/lib/store-columns'
import { dashboardUsesSlugChannelOrdersOnly } from '@/lib/slug-channel-orders'
import {
  planAllowsSalonSelfServiceQr,
  planAllowsSalonStaffGarcom,
} from '@/lib/salao-attendance'
import { getPendingOrdersCount } from '@/services/dashboard.server'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'

function EmptyStoreNotice() {
  return (
    <div className="rounded-3xl border border-dashed border-[var(--card-border)] bg-white p-8 text-center shadow-sm">
      <h1 className="font-brand text-2xl font-bold text-[#1a1614]">
        Hub operacional
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-[#6b7280]">
        Associa uma loja à tua conta para abrir atalhos de operação, cardápio,
        configurações e administração.
      </p>
      <Link
        href="/dashboard/settings"
        className="mt-6 inline-flex rounded-xl bg-[var(--dash-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25"
      >
        Ir para configurações
      </Link>
    </div>
  )
}

export default async function DashboardHub() {
  const user = await getUser()
  if (!user) return null

  const store = await getStoreByUser(user.id)
  const row =
    store && typeof store === 'object' ? (store as Record<string, unknown>) : null
  const storeId = typeof row?.id === 'string' ? row.id : null
  const storeSlug =
    typeof row?.slug === 'string' && row.slug.trim() ? row.slug.trim() : null
  const operationMode = parseOperationModeFromStore(row)
  const plan = effectiveDashboardPlan(
    user.email ?? null,
    row ? readStorePlano(row) : undefined
  )

  const slugChannelSourcesOnly = dashboardUsesSlugChannelOrdersOnly(
    plan,
    operationMode
  )
  const pendingOrders = storeId
    ? await getPendingOrdersCount(storeId, { slugChannelSourcesOnly })
    : 0

  if (!storeId) return <EmptyStoreNotice />

  const digitalMenuHref = storeSlug ? `/${storeSlug}` : '/dashboard/settings'
  const allowed = menuKeysForMerchant(plan, operationMode)
  const balcaoRoutes: Array<{ key: DashboardMenuKey; href: string }> = [
    { key: 'pdv', href: '/dashboard/pdv?hub=balcao' },
    { key: 'caixa', href: '/dashboard/caixa?hub=balcao' },
    { key: 'pedidos', href: '/dashboard/orders?hub=balcao' },
  ]
  const showBalcao =
    isHubMenuKeyVisible('pdv', allowed) || isHubMenuKeyVisible('caixa', allowed)
  const balcaoHref = showBalcao
    ? balcaoRoutes.find((action) => isHubMenuKeyVisible(action.key, allowed))?.href ??
      null
    : null
  const garcomInMenu = isHubMenuKeyVisible('garcom', allowed)
  const hasStaffGarcom = planAllowsSalonStaffGarcom(plan)
  const hasSalonQr = planAllowsSalonSelfServiceQr(plan)
  const showSalao = garcomInMenu && hasStaffGarcom
  const showAutoatendimento = garcomInMenu && hasSalonQr && !hasStaffGarcom
  const showCozinha = isHubMenuKeyVisible('kds', allowed)
  const showDelivery = isHubContextVisible('delivery', allowed)
  const showMesas = garcomInMenu && hasSalonQr && !hasStaffGarcom
  const showComandas = isHubMenuKeyVisible('pedidos', allowed)
  const showDigitalMenu = shouldShowDigitalMenuShortcut(operationMode)
  const centerTileCount =
    Number(showSalao) + Number(showAutoatendimento) + Number(showCozinha)
  const sideShortcutCount =
    Number(showDelivery) +
    Number(showMesas) +
    Number(showComandas) +
    Number(showDigitalMenu) +
    2

  const gridClass =
    showBalcao && centerTileCount > 0
      ? 'lg:grid-cols-[1.25fr_1fr_0.85fr]'
      : showBalcao
        ? 'lg:grid-cols-[1.25fr_0.85fr]'
        : centerTileCount > 0
          ? 'lg:grid-cols-[1fr_0.85fr]'
          : 'lg:grid-cols-1'

  return (
    <OperationalHubClient
      storeId={storeId}
      hubPinConfig={parseHubPinConfig(row)}
      balcaoHref={balcaoHref}
      showBalcao={showBalcao}
      showSalao={showSalao}
      showAutoatendimento={showAutoatendimento}
      showCozinha={showCozinha}
      showDelivery={showDelivery}
      showMesas={showMesas}
      showComandas={showComandas}
      showDigitalMenu={showDigitalMenu}
      digitalMenuHref={digitalMenuHref}
      digitalMenuExternal={!!storeSlug}
      pendingOrders={pendingOrders}
      slugChannelSourcesOnly={slugChannelSourcesOnly}
      gridClass={gridClass}
      centerTileCount={centerTileCount}
      sideShortcutCount={sideShortcutCount}
    />
  )
}
