import Link from 'next/link'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { parsePrintingFromStore } from '@/lib/store-printing'
import { readStorePlano } from '@/lib/store-columns'
import {
  isDeliveryPipelineEnabled,
  parseOperationModeFromStore,
  resolveOrdersChannelFilter,
} from '@/lib/merchant-operation-mode'
import { dashboardUsesSlugChannelOrdersOnly } from '@/lib/slug-channel-orders'
import { OrdersClient } from './_components/OrdersClient'
import { getUser } from '@/services/auth.server'
import { getStoreOrders } from '@/services/orders.server'
import { getStoreByUser } from '@/services/store.server'
import { getStoreTablesForStore } from '@/services/waiter-tables.server'

/** Evita RSC em cache no router do Next ao navegar pelo painel. */
export const dynamic = 'force-dynamic'

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getUser()
  if (!user) return null
  const params = searchParams ? await searchParams : {}
  const hubParam = typeof params.hub === 'string' ? params.hub : null
  const preferPresencial = hubParam === 'comandas' || hubParam === 'balcao'

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Loja não encontrada
        </h1>
        <p className="mt-2 text-sm text-vyria-navy-muted">
          Precisas de uma loja associada à tua conta.
        </p>
        <Link
          href="/dashboard/settings"
          className="btn-vyria-gradient mt-8 inline-flex rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Configurações
        </Link>
      </div>
    )
  }

  const storeId = store.id as string
  const row = store as Record<string, unknown>
  const plan = effectiveDashboardPlan(user.email, readStorePlano(row))
  const operationMode = parseOperationModeFromStore(row)
  const slugChannelSourcesOnly = dashboardUsesSlugChannelOrdersOnly(
    plan,
    operationMode
  )
  const initialOrders = await getStoreOrders(storeId, {
    slugChannelSourcesOnly,
  })
  const salonTables = (await getStoreTablesForStore(storeId)).map((t) => ({
    name: t.name,
    ambiente: t.ambiente,
  }))

  const printing = parsePrintingFromStore(row)
  const storeName =
    typeof row.name === 'string' ? row.name : 'Meu estabelecimento'
  const deliveryPipelineEnabled = isDeliveryPipelineEnabled(operationMode)

  return (
    <OrdersClient
      initialOrders={initialOrders}
      storeId={storeId}
      storeName={storeName}
      printing={printing}
      plan={plan}
      deliveryPipelineEnabled={deliveryPipelineEnabled}
      operationMode={operationMode}
      slugChannelSourcesOnly={slugChannelSourcesOnly}
      initialChannelFilter={resolveOrdersChannelFilter(
        operationMode,
        preferPresencial ? 'presencial' : 'delivery'
      )}
      initialSalonTables={salonTables}
    />
  )
}
