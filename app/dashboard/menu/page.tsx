import Link from 'next/link'
import { MenuManagerClient } from './_components/MenuManagerClient'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { readStorePlano } from '@/lib/store-columns'
import {
  isDeliveryPipelineEnabled,
  parseOperationModeFromStore,
} from '@/lib/merchant-operation-mode'
import { getUser } from '@/services/auth.server'
import { getProductStocksForStore } from '@/services/inventory.server'
import { getMenuProductsForStore } from '@/services/menu.server'
import { getStoreByUser } from '@/services/store.server'
import { hasFeature } from '@/lib/plan'

export default async function MenuManagerPage() {
  const user = await getUser()

  if (!user) return null

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
  const storeSlug =
    'slug' in store && store.slug ? String(store.slug) : null
  const storeRecord = store as Record<string, unknown>
  const rawPlan = readStorePlano(storeRecord)
  const plan = effectiveDashboardPlan(user.email ?? null, rawPlan)
  const [initialProducts, stockMap] = await Promise.all([
    getMenuProductsForStore(storeId),
    hasFeature(plan, 'inventory')
      ? getProductStocksForStore(storeId)
      : Promise.resolve(
          new Map<
            string,
            { quantity: number; lowStockAlert: number | null; updatedAt: string | null }
          >()
        ),
  ])

  const showPublicStorefrontLink = isDeliveryPipelineEnabled(
    parseOperationModeFromStore(storeRecord)
  )

  return (
    <MenuManagerClient
      initialProducts={initialProducts}
      stockByProduct={Object.fromEntries(stockMap)}
      storeId={storeId}
      storeSlug={storeSlug}
      plan={plan}
      showPublicStorefrontLink={showPublicStorefrontLink}
    />
  )
}
