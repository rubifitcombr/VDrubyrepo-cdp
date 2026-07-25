import Link from 'next/link'
import { parsePrintingFromStore } from '@/lib/store-printing'
import {
  isDeliveryPipelineEnabled,
  parseOperationModeFromStore,
} from '@/lib/merchant-operation-mode'
import { merchantEntregadoresEnabled } from '@/lib/plan'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { readStorePlano } from '@/lib/store-columns'
import { KdsClient } from './_components/KdsClient'
import { getUser } from '@/services/auth.server'
import { getStoreOrders } from '@/services/orders.server'
import { getStoreByUser } from '@/services/store.server'

export default async function KdsPage() {
  const user = await getUser()
  if (!user) return null

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Loja não encontrada
        </h1>
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
  const initialOrders = await getStoreOrders(storeId)
  const row = store as Record<string, unknown>
  const storeName =
    typeof row.name === 'string' ? String(row.name) : 'Loja'
  const printing = parsePrintingFromStore(row)
  const operationMode = parseOperationModeFromStore(row)
  const deliveryPipelineEnabled = isDeliveryPipelineEnabled(operationMode)
  const plan = effectiveDashboardPlan(user.email, readStorePlano(row))
  const entregadoresEnabled = merchantEntregadoresEnabled(plan)

  return (
    <KdsClient
      initialOrders={initialOrders}
      storeId={storeId}
      storeName={storeName}
      printing={printing}
      deliveryPipelineEnabled={deliveryPipelineEnabled}
      entregadoresEnabled={entregadoresEnabled}
    />
  )
}
